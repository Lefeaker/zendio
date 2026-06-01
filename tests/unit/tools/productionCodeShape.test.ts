import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('production code shape report', () => {
  const toolPath = resolve('tools/report-production-code-shape.mjs');

  it('prints hotspot counts and enforces final thresholds', () => {
    const output = execFileSync(process.execPath, [toolPath], { encoding: 'utf8' });
    expect(output).toContain('Production code shape report');
    expect(output).toContain('src/options/app/productionStitchShell.ts');
    expect(output).toContain('src/options/app/productionStitchShellMount.ts');
    expect(output).toContain('src/ui/domains/usage-chart/usageChartRenderers.ts');
    expect(output).toContain('src/options/yaml-config-editor/view.ts');
    expect(output).toContain('src/options/yaml-config-editor/widgetAdapter.ts');
  });

  it('fails when a tracked hotspot file is missing', () => {
    const result = spawnSync(process.execPath, [toolPath], {
      cwd: resolve('tests/fixtures/tools/production-code-shape/missing-hotspot'),
      encoding: 'utf8'
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('src/options/yaml-config-editor/view.ts | exists=false');
    expect(result.stderr).toContain(
      'src/options/yaml-config-editor/view.ts is listed as a production hotspot but is missing'
    );
  });
});
