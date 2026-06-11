import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const setupErrorAnalyticsScript = 'scripts/setup-error-analytics.js';
const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function stripAnsi(value: string): string {
  return value.replace(ansiPattern, '');
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
});
