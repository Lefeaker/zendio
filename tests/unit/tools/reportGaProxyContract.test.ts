import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const scriptPath = resolve('tools/report-ga-proxy-contract.mjs');

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
});
