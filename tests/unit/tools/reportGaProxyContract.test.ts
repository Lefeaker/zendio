import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const scriptPath = resolve('tools/report-ga-proxy-contract.mjs');

type GaProxyContractReportFixture = {
  readonly version: number;
  readonly generatedAtSource: string;
  readonly transports: readonly string[];
  readonly events: readonly object[];
};

describe('report-ga-proxy-contract', () => {
  it('writes the proxy contract report in check mode for downstream docs gates', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'aiiinob-ga-proxy-contract-'));
    const reportPath = join(fixtureRoot, 'ga-proxy-contract.json');

    try {
      const result = spawnSync(process.execPath, [scriptPath, '--check', '--out', reportPath], {
        encoding: 'utf8'
      });

      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).toContain('Check passed');
      expect(existsSync(reportPath)).toBe(true);
      expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toMatchObject({
        generatedAtSource: 'extension-schema',
        transports: ['proxy', 'directDebug']
      });
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('refreshes a stale proxy contract report in check mode', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'aiiinob-ga-proxy-contract-'));
    const reportPath = join(fixtureRoot, 'ga-proxy-contract.json');

    try {
      writeFileSync(
        reportPath,
        `${JSON.stringify({
          version: 0,
          generatedAtSource: 'extension-schema',
          transports: ['proxy', 'directDebug'],
          events: []
        })}\n`,
        'utf8'
      );

      const result = spawnSync(process.execPath, [scriptPath, '--check', '--out', reportPath], {
        encoding: 'utf8'
      });

      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).toContain('Check passed');

      const refreshedReport = JSON.parse(
        readFileSync(reportPath, 'utf8')
      ) as GaProxyContractReportFixture;
      expect(refreshedReport).toMatchObject({
        version: 1,
        generatedAtSource: 'extension-schema',
        transports: ['proxy', 'directDebug']
      });
      expect(refreshedReport.events.length).toBeGreaterThan(0);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
