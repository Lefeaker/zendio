import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadNpmAuditRegression } from '../../utils/npmAuditTypedLoader.mjs';

const toolPath = resolve('tools/check-npm-audit-regression.mjs');
const closedEnvironment = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
  HOME: '/var/empty',
  LANG: 'C',
  LC_ALL: 'C',
  TZ: 'UTC'
};

describe('portable npm audit regression owner', () => {
  it('is import-safe when process.argv[1] is absent', async () => {
    const original = process.argv[1];
    Reflect.deleteProperty(process.argv, '1');
    try {
      await expect(loadNpmAuditRegression()).resolves.toHaveProperty('npmAuditRegressionTestHooks');
    } finally {
      process.argv[1] = original;
    }
  });

  it('binds the accepted corrected-R01 base and immutable portable v10 transition', async () => {
    const module = await loadNpmAuditRegression();
    const transition = module.getR02ImmutableTransition();
    expect(transition.schema).toEqual({
      name: 'r02-transition-v10',
      version: 10,
      rejectUnknownFields: true,
      rejectDuplicateFields: true
    });
    expect(transition.base).toMatchObject({
      head: 'e190bdc2fea559c8a3e90bb7220286de2595a754',
      tree: 'e90eaff9b9c55260e9a12d7e5f076c1eef3d174e'
    });
    expect(transition.runtime).toEqual({
      nodeVersion: 'v20.20.2',
      nodeEngine: '>=20.19 <21',
      npmVersion: '10.8.2',
      npmEngine: '>=10 <11',
      npmCliSha256: '8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7',
      npmPackageSha256: '5af906974b65fc1e48d709687e174a466614b9706f9479bea73c650bc3142fb5',
      discoveryContract: 'process-execPath-contained-npm-cli-v1',
      registry: 'https://registry.npmjs.org/'
    });
    expect(JSON.stringify(transition)).not.toContain('/Users/');
    expect(Object.isFrozen(transition)).toBe(true);
  });

  it('projects only dependency-affecting package fields', async () => {
    const module = await loadNpmAuditRegression();
    expect(
      module.createDependencyProjection({
        name: 'fixture',
        scripts: { test: 'false' },
        dependencies: { zod: '^3.23.8' },
        devDependencies: { vitest: '4.1.9' },
        engines: { node: '>=20.19 <21' }
      })
    ).toEqual({
      dependencies: { zod: '^3.23.8' },
      devDependencies: { vitest: '4.1.9' },
      engines: { node: '>=20.19 <21' }
    });
  });

  it.each([
    ['duplicate mode', ['--verify-baseline-context', '--verify-baseline-context']],
    ['two modes', ['--verify-baseline-context', '--compare-reports']],
    ['unknown flag', ['--verify-baseline-context', '--extra', 'x']],
    ['positional argument', ['positional']]
  ])('rejects closed CLI grammar: %s', (_label, args) => {
    const result = spawnSync(process.execPath, [toolPath, ...args], {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: closedEnvironment
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('[npm-audit-regression]');
  });

  it('rejects the wrong corrected-R01 authority before repository or network work', () => {
    const root = mkdtempSync(join(tmpdir(), 'zendio-r02-cli-preflight-'));
    const output = join(root, 'baseline');
    const result = spawnSync(
      process.execPath,
      [
        toolPath,
        '--capture-baseline-pair',
        '--milestone',
        'R02-origin',
        '--accepted-parent-head',
        '0'.repeat(40),
        '--audit-level',
        'low',
        '--output-dir',
        output,
        '--evidence-manifest',
        join(output, 'manifest.json')
      ],
      { cwd: resolve('.'), encoding: 'utf8', env: closedEnvironment }
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('sealed accepted R01 commit');
    expect(existsSync(output)).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ['NoDe_OpTiOnS', 'Forbidden preload environment: NoDe_OpTiOnS'],
    ['NpM_CoNfIg_ReGiStRy', 'Forbidden npm config environment: NpM_CoNfIg_ReGiStRy'],
    ['GiT_DiR', 'Forbidden Git environment: GiT_DiR'],
    ['HuSkY', 'Forbidden Husky environment: HuSkY'],
    ['CUSTOM_LOADER_PATH', 'Forbidden loader environment: CUSTOM_LOADER_PATH']
  ])('rejects inherited %s before evidence preflight with exact stderr', (key, message) => {
    const result = spawnSync(
      process.execPath,
      [toolPath, '--verify-baseline-context', '--baseline-manifest', '/missing'],
      {
        cwd: resolve('.'),
        encoding: 'utf8',
        env: { ...closedEnvironment, [key]: 'hostile' }
      }
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`[npm-audit-regression] ${message}\n`);
  });
});
