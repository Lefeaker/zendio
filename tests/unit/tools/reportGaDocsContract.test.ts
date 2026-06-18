import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const scriptPath = resolve('tools/report-ga-docs-contract.mjs');

interface ProxyEventContract {
  name: string;
  classification: 'emitted' | 'error' | 'dev-only' | 'contract-only' | 'future';
  runtimeAllowed: boolean;
  requiredParams: string[];
  optionalParams: string[];
  allowedParams: string[];
  paramValidators: Record<string, string>;
}

interface FixtureOptions {
  activeRows?: string[];
  catalogRows?: string[];
  dashboardEvents?: string[];
  dashboardDimensions?: string[];
  configDoc?: string;
  writeProxyReport?: boolean;
  writeSourceContract?: boolean;
}

function createProxyContract(): { events: ProxyEventContract[] } {
  return {
    events: [
      createEvent('support_link_clicked', 'emitted', true, ['target']),
      createEvent('support_like_clicked', 'emitted', true, ['variant']),
      createEvent('runtime_harness_open', 'dev-only', true, ['source']),
      createEvent('extension_error', 'error', false, ['error_code'], ['browser_name']),
      createEvent('video_started', 'contract-only', true, ['source']),
      createEvent('video_screenshot_captured', 'future', true, ['screenshot_count_bucket'])
    ]
  };
}

function createEvent(
  name: string,
  classification: ProxyEventContract['classification'],
  runtimeAllowed: boolean,
  requiredParams: string[] = [],
  optionalParams: string[] = []
): ProxyEventContract {
  const allowedParams = [...requiredParams, ...optionalParams];
  return {
    name,
    classification,
    runtimeAllowed,
    requiredParams,
    optionalParams,
    allowedParams,
    paramValidators: Object.fromEntries(allowedParams.map((param) => [param, `fixture:${param}`]))
  };
}

function createFixture({
  activeRows = [
    row('support_link_clicked', ['target'], [], 'emitted', true),
    row('support_like_clicked', ['variant'], [], 'emitted', true),
    row('runtime_harness_open', ['source'], [], 'dev-only', true),
    row('extension_error', ['error_code'], ['browser_name'], 'error', false)
  ],
  catalogRows = [
    row('video_started', ['source'], [], 'contract-only', true),
    row(
      'video_screenshot_captured',
      ['screenshot_count_bucket'],
      [],
      'future',
      true,
      'current branch has no active emitter'
    )
  ],
  dashboardEvents = ['support_link_clicked', 'support_like_clicked', 'extension_error'],
  dashboardDimensions = ['target', 'variant', 'error_code', 'browser_name'],
  configDoc = defaultConfigDoc(),
  writeProxyReport = true,
  writeSourceContract = false
}: FixtureOptions = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'aiiinob-ga-docs-contract-'));
  const docsDir = join(dir, 'docs');
  const reportsDir = join(dir, 'build', 'reports');

  mkdirSync(docsDir, { recursive: true });
  mkdirSync(reportsDir, { recursive: true });

  if (writeProxyReport) {
    writeFile(
      join(reportsDir, 'ga-proxy-contract.json'),
      JSON.stringify(createProxyContract(), null, 2)
    );
  }

  if (writeSourceContract) {
    writeFile(
      join(dir, 'src', 'shared', 'analytics', 'analyticsProxyContract.ts'),
      `
const contract = ${JSON.stringify(createProxyContract(), null, 2)} as const;

export const ANALYTICS_PROXY_CONTRACT = contract;

export function buildAnalyticsProxyContract() {
  return contract;
}
`
    );
  }

  writeFile(join(docsDir, 'ga4-telemetry-reference.md'), referenceDoc(activeRows, catalogRows));
  writeFile(join(docsDir, 'analytics-configuration-guide.md'), configDoc);
  writeFile(
    join(docsDir, 'google-analytics-dashboard-setup.md'),
    dashboardDoc(dashboardEvents, dashboardDimensions)
  );

  return dir;
}

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${contents.trim()}\n`, 'utf8');
}

function row(
  eventName: string,
  requiredParams: string[],
  optionalParams: string[],
  classification: string,
  runtimeAllowed: boolean,
  currentTruth = 'ok'
): string {
  const params = [
    ...requiredParams.map((param) => `\`${param}\``),
    ...optionalParams.map((param) => `\`${param}?\``)
  ];
  return `| \`${eventName}\` | ${params.join(', ') || 'none'} | \`${classification}\` | \`${String(runtimeAllowed)}\` | ${currentTruth} |`;
}

function referenceDoc(activeRows: string[], catalogRows: string[]): string {
  return `
# GA4 Telemetry Reference

<!-- GA_SCHEMA_TABLE_START:support_usage_error -->
| Event | Params | Class | Runtime | Notes |
| --- | --- | --- | --- | --- |
${activeRows.join('\n')}
<!-- GA_SCHEMA_TABLE_END:support_usage_error -->

<!-- GA_SCHEMA_TABLE_START:catalog_only -->
| Event | Params | Class | Runtime | Notes |
| --- | --- | --- | --- | --- |
${catalogRows.join('\n')}
<!-- GA_SCHEMA_TABLE_END:catalog_only -->
`;
}

function defaultConfigDoc(): string {
  return `
# Analytics Configuration Guide

GA \`api_secret\` remains server-only in the Cloudflare Worker secret \`GA4_API_SECRET\`.
Do not put it in extension source, tracked config, or \`.env.production.local\`.
`;
}

function dashboardDoc(events: string[], dimensions: string[]): string {
  return `
# Google Analytics Dashboard Setup

## Recommended event-scoped dimensions

${dimensions.map((dimension) => `| \`${dimension}\` | example |`).join('\n')}

## Recommended Explorations

### Core events

${events.map((eventName) => `- \`${eventName}\``).join('\n')}
`;
}

function runReport(root: string, options: { useDefaultPaths?: boolean; cwd?: string } = {}) {
  const { useDefaultPaths = false, cwd } = options;
  const args = [scriptPath, '--check'];

  if (!useDefaultPaths) {
    args.push(
      '--proxy-contract',
      join(root, 'build', 'reports', 'ga-proxy-contract.json'),
      '--reference-doc',
      join(root, 'docs', 'ga4-telemetry-reference.md'),
      '--config-doc',
      join(root, 'docs', 'analytics-configuration-guide.md'),
      '--dashboard-doc',
      join(root, 'docs', 'google-analytics-dashboard-setup.md')
    );
  }

  return spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8'
  });
}

describe('report-ga-docs-contract', () => {
  it('passes when docs, dashboard, and server-only proxy guidance match the proxy contract', () => {
    const fixtureRoot = createFixture();

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).toContain('Check passed');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when the active reference table contains an extra docs event', () => {
    const fixtureRoot = createFixture({
      activeRows: [
        row('support_link_clicked', ['target'], [], 'emitted', true),
        row('support_like_clicked', ['variant'], [], 'emitted', true),
        row('runtime_harness_open', ['source'], [], 'dev-only', true),
        row('extension_error', ['error_code'], ['browser_name'], 'error', false),
        row('extension_usage', [], [], 'inventory-only', false)
      ]
    });

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('extra active docs rows');
      expect(result.stdout + result.stderr).toContain('extension_usage');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when an emitted event is missing from the active reference table', () => {
    const fixtureRoot = createFixture({
      activeRows: [
        row('support_link_clicked', ['target'], [], 'emitted', true),
        row('runtime_harness_open', ['source'], [], 'dev-only', true),
        row('extension_error', ['error_code'], ['browser_name'], 'error', false)
      ]
    });

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('missing active docs rows');
      expect(result.stdout + result.stderr).toContain('support_like_clicked');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when a documented event classification drifts from the proxy contract', () => {
    const fixtureRoot = createFixture({
      activeRows: [
        row('support_link_clicked', ['target'], [], 'emitted', true),
        row('support_like_clicked', ['variant'], [], 'emitted', true),
        row('runtime_harness_open', ['source'], [], 'dev-only', true),
        row('extension_error', ['error_code'], ['browser_name'], 'emitted', false)
      ]
    });

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('classification mismatch');
      expect(result.stdout + result.stderr).toContain('extension_error');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when the dashboard recommends a non-active contract event', () => {
    const fixtureRoot = createFixture({
      dashboardEvents: ['support_link_clicked', 'extension_error', 'video_screenshot_captured']
    });

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('dashboard recommends non-active events');
      expect(result.stdout + result.stderr).toContain('video_screenshot_captured');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when the dashboard documents raw duration fields as dimensions', () => {
    const fixtureRoot = createFixture({
      dashboardDimensions: ['target', 'duration_ms']
    });

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('dashboard uses forbidden raw dimensions');
      expect(result.stdout + result.stderr).toContain('duration_ms');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when a documented event param list drifts from the proxy contract', () => {
    const fixtureRoot = createFixture({
      activeRows: [
        row('support_link_clicked', ['target'], [], 'emitted', true),
        row('support_like_clicked', [], [], 'emitted', true),
        row('runtime_harness_open', ['source'], [], 'dev-only', true),
        row('extension_error', ['error_code', 'browser_name'], [], 'error', false)
      ]
    });

    try {
      const result = runReport(fixtureRoot);
      const output = result.stdout + result.stderr;

      expect(result.status).not.toBe(0);
      expect(output).toContain('missing required params for support_like_clicked');
      expect(output).toContain('variant');
      expect(output).toContain('optional marker mismatch for extension_error');
      expect(output).toContain('browser_name');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when the dashboard documents an unknown param', () => {
    const fixtureRoot = createFixture({
      dashboardDimensions: ['target', 'browser_name', 'day_index_bucket']
    });

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('dashboard documents unknown params');
      expect(result.stdout + result.stderr).toContain('day_index_bucket');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('falls back to the source analytics proxy contract when the default report file is absent', () => {
    const fixtureRoot = createFixture({
      writeProxyReport: false,
      writeSourceContract: true
    });

    try {
      const result = runReport(fixtureRoot, { useDefaultPaths: true, cwd: fixtureRoot });
      const output = result.stdout + result.stderr;

      expect(result.status).toBe(0);
      expect(output).toContain('Contract source: schema');
      expect(output).toContain('Check passed');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when docs instruct owners to set GA4_API_SECRET in extension-side public config', () => {
    const fixtureRoot = createFixture({
      configDoc: `
# Analytics Configuration Guide

Put this in \`.env.production.local\`:

\`\`\`bash
GA4_API_SECRET=do-not-do-this
\`\`\`
`
    });

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain(
        'forbidden extension-side secret instruction'
      );
      expect(result.stdout + result.stderr).toContain('GA4_API_SECRET');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
