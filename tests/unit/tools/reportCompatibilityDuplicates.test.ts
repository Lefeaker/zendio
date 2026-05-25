import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const fixtureRoot = resolve('tests/fixtures/tools/compatibility-duplicates');
const toolPath = resolve('tools/report-compatibility-duplicates.mjs');

describe('report-compatibility-duplicates', () => {
  it('reports exact duplicate compatibility shell groups', () => {
    const output = execFileSync(process.execPath, [toolPath, '--root', fixtureRoot], {
      encoding: 'utf8'
    });

    expect(output).toContain('duplicate groups: 1');
    expect(output).toContain('src/options/components/sections/usageClone.ts');
    expect(output).toContain('src/options/widgets/shared/usage/usageClone.ts');
    expect(output).not.toContain(
      'unexpected duplicate group:\n- src/options/components/sections/restSectionLayout.ts'
    );
  });

  it('fails check mode when duplicate groups are not allowlisted', () => {
    const result = spawnSync(process.execPath, [toolPath, '--root', fixtureRoot, '--check'], {
      encoding: 'utf8'
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unexpected compatibility duplicate groups found: 1');
  });

  it('passes check mode for owner-approved allowlisted duplicate groups', () => {
    const result = spawnSync(
      process.execPath,
      [toolPath, '--root', fixtureRoot, '--allowlist', 'allowlist.json', '--check'],
      {
        encoding: 'utf8'
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('allowed duplicate group');
  });
});
