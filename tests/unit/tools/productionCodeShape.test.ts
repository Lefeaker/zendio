import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('production code shape report', () => {
  it('prints hotspot counts without enforcing final thresholds yet', () => {
    const output = execFileSync(
      process.execPath,
      [resolve('tools/report-production-code-shape.mjs')],
      {
        encoding: 'utf8'
      }
    );
    expect(output).toContain('Production code shape report');
    expect(output).toContain('src/options/app/productionStitchShell.ts');
  });
});
