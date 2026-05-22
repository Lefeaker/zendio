import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('report-performance-hotspots', () => {
  it('tracks post-split production hotspots that remain over 400 LOC', () => {
    const output = execFileSync(
      process.execPath,
      [resolve('tools/report-performance-hotspots.mjs')],
      {
        encoding: 'utf8'
      }
    );

    expect(output).toContain('src/options/app/productionStitchShellMount.ts');
    expect(output).toContain('src/ui/domains/usage-chart/usageChartRenderers.ts');
  });
});
