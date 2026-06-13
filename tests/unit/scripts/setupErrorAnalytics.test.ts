import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const setupErrorAnalyticsScript = 'scripts/setup-error-analytics.js';
const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const setupErrorAnalyticsModuleUrl = new URL(
  '../../../scripts/setup-error-analytics.js',
  import.meta.url
);

type TrackedAnalyticsSourceContract = {
  clientRuntimeContainsApiSecret: boolean;
  runtimeCallsGoogleEndpointsDirectly: boolean;
  proxyBackedTransports: boolean;
  directDebugValidationIntent: boolean;
  debugSuccessSummaryRedacted: boolean;
  successLoggingScopedToDirectDebug: boolean;
};

type SetupErrorAnalyticsModule = {
  collectTrackedAnalyticsSourceContract: (projectRoot?: string) => TrackedAnalyticsSourceContract;
};

function stripAnsi(value: string): string {
  return value.replace(ansiPattern, '');
}

async function collectTrackedContract(): Promise<TrackedAnalyticsSourceContract> {
  const module = (await import(setupErrorAnalyticsModuleUrl.href)) as SetupErrorAnalyticsModule;
  return module.collectTrackedAnalyticsSourceContract(PROJECT_ROOT);
}

describe('setup-error-analytics script', () => {
  it('accepts the current proxy-first production analytics contracts without public env vars', () => {
    const result = spawnSync(process.execPath, [setupErrorAnalyticsScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ZENDIO_GA_MEASUREMENT_ID: '',
        ZENDIO_GA_TRANSPORT_MODE: '',
        ZENDIO_GA_PROXY_ENDPOINT: '',
        AIIINOB_GA_MEASUREMENT_ID: '',
        AIIINOB_GA_TRANSPORT_MODE: '',
        AIIINOB_GA_PROXY_ENDPOINT: ''
      }
    });

    const output = stripAnsi(`${result.stdout}${result.stderr}`);

    expect(result.status).toBe(0);
    expect(output).toContain('Validation finished with 0 failures');
    expect(output).toContain('proxy-first');
  });

  it('keeps client runtime free of server-only GA secrets', async () => {
    const contract = await collectTrackedContract();

    expect(contract.clientRuntimeContainsApiSecret).toBe(false);
  });

  it('keeps runtime transport off direct Google Measurement Protocol endpoints', async () => {
    const contract = await collectTrackedContract();

    expect(contract.runtimeCallsGoogleEndpointsDirectly).toBe(false);
    expect(contract.proxyBackedTransports).toBe(true);
    expect(contract.directDebugValidationIntent).toBe(true);
  });

  it('keeps directDebug success summaries redacted', async () => {
    const contract = await collectTrackedContract();

    expect(contract.debugSuccessSummaryRedacted).toBe(true);
    expect(contract.successLoggingScopedToDirectDebug).toBe(true);
  });
});
