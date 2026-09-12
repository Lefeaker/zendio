import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { auditOptionsRepositoryComposition } from '../../../tools/repository-composition-rules.mjs';

const runtimePath = 'src/options/runtimeEntry.ts';
const previewPath = 'src/platform/preview/optionsRepository.ts';
const runtime = readFileSync(runtimePath, 'utf8');
const preview = readFileSync(previewPath, 'utf8');
const scriptPath = resolve('tools/report-repository-composition.mjs');

function replace(source: string, before: string, after: string): string {
  expect(source).toContain(before);
  return source.replace(before, after);
}
function runtimeFault(before: string, after: string): string[] {
  return auditOptionsRepositoryComposition(replace(runtime, before, after), preview);
}
function previewFault(before: string, after: string): string[] {
  return auditOptionsRepositoryComposition(runtime, replace(preview, before, after));
}

const registration = `registerRepositories({
      storage: platformServices.storage,
      messaging: platformServices.messaging,
      tabs: platformServices.tabs,
      runtime: platformServices.runtime
    });`;

function runReport(overrides: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'zendio-repository-composition-'));
  try {
    for (const path of [
      'src/options/index.ts',
      runtimePath,
      previewPath,
      'src/content/index.ts',
      'src/background/index.ts',
      'src/onboarding/index.ts',
      'src/shared/di/serviceRegistry.ts'
    ]) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, overrides[path] ?? readFileSync(path, 'utf8'));
    }
    return spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('repository composition report', () => {
  it('accepts actual production and preview owners through the CLI', () => {
    expect(auditOptionsRepositoryComposition(runtime, preview)).toEqual([]);
    const result = runReport();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Options repository composition: passed');
  });

  it.each([
    'registerRepositories = (_services: unknown) => {}',
    'configureOptionsAppBootstrapStorage = (_storage: unknown) => {}',
    'bootstrapOptionsApp = (_options: unknown) => Promise.resolve()',
    '{ install: registerRepositories } = { install: (_services: unknown) => {} }',
    '[registerRepositories] = [(_services: unknown) => {}]'
  ])('rejects enclosing runtime parameter shadow: %s', (parameter) => {
    expect(
      runtimeFault(
        'platformServices?: PlatformServices',
        `platformServices?: PlatformServices, ${parameter}`
      )
    ).toContain('Options composition must call imported owners without local shadow bindings');
  });

  it.each([
    'registerFallbackRepositories = () => {}',
    'createPreviewOptionsRepository = () => ({})',
    'createPreviewPlatformServices = () => ({})',
    '{ install: registerFallbackRepositories } = { install: () => {} }',
    '[createPreviewOptionsRepository] = [() => ({})]'
  ])('rejects enclosing preview parameter shadow: %s', (parameter) => {
    expect(
      previewFault(
        'configurePreviewOptionsRuntime(): PlatformServices',
        `configurePreviewOptionsRuntime(${parameter}): PlatformServices`
      )
    ).toContain(
      'Preview composition must use its imported and exported owners without local shadow bindings'
    );
  });

  it('tolerates formatting, comments and renamed imported/local bindings', () => {
    const formatted = runtime
      .replace(
        'import { registerRepositories }',
        'import { registerRepositories as installRepositories }'
      )
      .replace('registerRepositories({', 'installRepositories /* install */ (\n({')
      .replace(
        'runtime: platformServices.runtime\n    });',
        'runtime: (platformServices.runtime)\n    }));'
      )
      .replaceAll('previewPlatformServices', 'previewServices')
      .replaceAll('bootstrapStorage', 'selectedStorage');
    expect(auditOptionsRepositoryComposition(formatted, preview)).toEqual([]);
  });

  it.each([
    ['missing registration', registration, ''],
    ['comment masquerade', registration, `/* ${registration} */`],
    ['dormant registration', registration, `function unused() { ${registration} }`],
    ['conditional registration', registration, `if (false) { ${registration} }`],
    ['wrong storage', 'storage: platformServices.storage', 'storage: platformServices.messaging'],
    ['wrong import owner', "from '@shared/di/serviceRegistry'", "from './otherRegistry'"],
    ['inverted branch', 'if (hasChromeStorage)', 'if (!hasChromeStorage)'],
    ['false Chrome condition', "typeof chrome !== 'undefined'", 'false'],
    ['duplicate owner', registration, `${registration}\n${registration}`],
    ['early exit before registration', registration, `return;\n${registration}`],
    [
      'shadowed registration owner',
      registration,
      `const registerRepositories = () => {};\n${registration}`
    ]
  ])('rejects %s in the production branch', (_label, before, after) => {
    expect(runtimeFault(before, after).length).toBeGreaterThan(0);
  });

  it('rejects production registration moved into the preview branch', () => {
    const moved = replace(runtime, registration, '');
    expect(
      auditOptionsRepositoryComposition(
        replace(moved, '} else {', `} else {\n${registration}`),
        preview
      ).length
    ).toBeGreaterThan(0);
  });

  it.each([
    ['early exit before branch', 'if (hasChromeStorage)', 'return;\nif (hasChromeStorage)'],
    [
      'storage overwrite after branch',
      '  configureOptionsAppBootstrapStorage(',
      '  bootstrapStorage = platformServices?.storage;\n  configureOptionsAppBootstrapStorage('
    ],
    [
      'runtime override after spread',
      '...(runtime ? { runtime } : {})',
      '...(runtime ? { runtime } : {}), runtime: platformServices?.runtime'
    ],
    [
      'shadowed preview owner',
      'const previewPlatformServices =',
      'const configurePreviewOptionsRuntime = () => ({});\n const previewPlatformServices ='
    ],
    ['missing preview configure', 'configurePreviewOptionsRuntime();', 'undefined;'],
    [
      'wrong preview import',
      "import('@platform/preview/optionsRepository')",
      "import('@platform/preview/services')"
    ],
    [
      'unawaited preview import',
      "await import('@platform/preview/optionsRepository')",
      "import('@platform/preview/optionsRepository')"
    ],
    [
      'legacy fallback masquerade',
      'configurePreviewOptionsRuntime();',
      'registerFallbackRepositories();'
    ],
    [
      'wrong preview storage',
      'bootstrapStorage = previewPlatformServices.storage;',
      'bootstrapStorage = platformServices.storage;'
    ],
    [
      'wrong preview runtime',
      'runtime = previewPlatformServices.runtime;',
      'runtime = platformServices.runtime;'
    ],
    ['wrong bootstrap storage', 'storage: bootstrapStorage,', 'storage: platformServices.storage,'],
    [
      'wrong bootstrap runtime',
      '...(runtime ? { runtime } : {})',
      '...(runtime ? { runtime: platformServices.runtime } : {})'
    ],
    [
      'bootstrap before branch',
      'if (hasChromeStorage)',
      'await bootstrapOptionsApp({ storage: bootstrapStorage });\n if (hasChromeStorage)'
    ]
  ])('rejects %s at the preview/bootstrap boundary', (_label, before, after) => {
    expect(runtimeFault(before, after).length).toBeGreaterThan(0);
  });

  it.each([
    [
      'shadowed Options factory',
      '  const platformServices =',
      '  const createPreviewOptionsRepository = () => ({});\n  const platformServices ='
    ],
    [
      'early preview return',
      '  registerFallbackRepositories();',
      '  return platformServices;\n  registerFallbackRepositories();'
    ],
    ['missing fallback', '  registerFallbackRepositories();', ''],
    [
      'missing Options override',
      '    createPreviewOptionsRepository\n',
      '    createPreviewPlatformServices\n'
    ],
    ['wrong repository token', 'DI_TOKENS.IOptionsRepository,', 'DI_TOKENS.IYamlRepository,'],
    [
      'wrong platform return',
      '  return platformServices;',
      '  return createPreviewPlatformServices();'
    ],
    ['wrong factory import', "from './services'", "from './otherServices'"],
    [
      'extra fallback reset',
      '  return platformServices;',
      '  registerFallbackRepositories();\n  return platformServices;'
    ]
  ])('rejects %s inside the actual preview owner', (_label, before, after) => {
    expect(previewFault(before, after).length).toBeGreaterThan(0);
  });

  it('rejects fallback registration after the Options override', () => {
    const moved = replace(preview, '  registerFallbackRepositories();', '');
    expect(
      auditOptionsRepositoryComposition(
        runtime,
        replace(
          moved,
          '  return platformServices;',
          '  registerFallbackRepositories();\n  return platformServices;'
        )
      ).length
    ).toBeGreaterThan(0);
  });

  it('retains other entrypoint and implicit registry fallback checks', () => {
    const registryPath = 'src/shared/di/serviceRegistry.ts';
    const result = runReport({
      'src/background/index.ts': '',
      [registryPath]: `${readFileSync(registryPath, 'utf8')}\nensureFallbackRepositoriesRegistered();`
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'src/background/index.ts requires "registerRepositories({": no'
    );
    expect(result.stdout).toContain('forbids "ensureFallbackRepositoriesRegistered()": present');
  });
});
