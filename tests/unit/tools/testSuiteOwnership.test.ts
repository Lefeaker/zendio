import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeTestModule,
  auditRepositoryTestSuiteOwnership,
  buildTestSuiteOwnershipReport,
  decodeNulDelimitedPaths,
  formatTestSuiteOwnershipReport,
  listGitVisibleTestFiles,
  parsePlaywrightConfig,
  type OwnershipReport,
  type PlaywrightCollectionConfig,
  type TestShardDescriptor
} from '../../../scripts/utils/testSuiteOwnership.mjs';
import {
  OWNERSHIP_CHARACTERIZATION,
  OWNERSHIP_CHARACTERIZATION_SOURCES,
  OWNERSHIP_PUBLIC_EXPORTS
} from './fixtures/testSuiteOwnershipCharacterization';

const temporaryRoots: string[] = [];
const G00_STATE_BROWSER_FILES = [
  'tests/e2e/sessionDraftConcurrency.browser.test.ts',
  'tests/e2e/optionsCrossContextMutation.browser.test.ts',
  'tests/e2e/videoScreenshotCacheMigration.browser.test.ts'
];
const G00_OPTIONS_INCREMENTAL_BROWSER_FILE = 'tests/e2e/optionsIncrementalRender.browser.test.ts';
const G00_ARCHITECTURE_BROWSER_FILES = [
  'tests/e2e/uiPrimitiveTokenParity.browser.test.ts',
  'tests/e2e/contentIdleCss.browser.test.ts',
  'tests/e2e/sessionPanelsIncremental.browser.test.ts',
  G00_OPTIONS_INCREMENTAL_BROWSER_FILE
];
const G00_STATE_BROWSER_SCRIPT = `npm run verify:runtime && node scripts/run-playwright.mjs test ${G00_STATE_BROWSER_FILES.join(' ')} --project=chromium-desktop`;
const G00_ARCHITECTURE_BROWSER_SCRIPT = `npm run verify:runtime && node scripts/run-playwright.mjs test ${G00_ARCHITECTURE_BROWSER_FILES.join(' ')} --project=chromium-desktop`;
const R01_CASE_MIGRATION_LEDGER = [
  {
    sourceCase: 'Chrome: setBadgeText 应该调用 chrome.action.setBadgeText 并返回 Promise',
    destination: 'tests/unit/platform/chrome/action.test.ts',
    destinationCase:
      '[R01-CHROME-01] setBadgeText forwards exact details and resolves only after the Chrome callback'
  },
  {
    sourceCase:
      'Chrome: setBadgeBackgroundColor 应该调用 chrome.action.setBadgeBackgroundColor 并返回 Promise',
    destination: 'tests/unit/platform/chrome/action.test.ts',
    destinationCase:
      '[R01-CHROME-02] setBadgeBackgroundColor forwards exact details and resolves only after the Chrome callback'
  },
  {
    sourceCase: 'Chrome: onClicked 应该注册监听并在销毁时移除监听',
    destination: 'tests/unit/platform/chrome/action.test.ts',
    destinationCase:
      '[R01-CHROME-03] onClicked forwards through one wrapper and removes that same wrapper on dispose'
  },
  {
    sourceCase: 'Firefox: 应该正确检测 Firefox 环境',
    destination: 'tests/unit/platform/firefox/browserDetection.test.ts',
    destinationCase: '[R01-FIREFOX-DETECTION-01] detects Firefox from its user agent'
  },
  {
    sourceCase: 'Firefox: 应该正确检测 Chrome 环境',
    destination: 'tests/unit/platform/firefox/browserDetection.test.ts',
    destinationCase: '[R01-FIREFOX-DETECTION-02] detects a non-Firefox Chrome browser'
  },
  {
    sourceCase: 'Firefox: 应该为 Firefox 添加正确的 CSS 类',
    destination: 'tests/unit/platform/firefox/browserDetection.test.ts',
    destinationCase: '[R01-FIREFOX-DETECTION-03] applies the Firefox CSS class to the document root'
  },
  {
    sourceCase: 'Firefox: 应该使用 Firefox storage API',
    destination: 'tests/unit/platform/firefox/services.test.ts',
    destinationCase: '[R01-FIREFOX-SERVICES-01] writes through the Firefox storage service'
  },
  {
    sourceCase: 'Firefox: 应该在 Firefox 暴露 chrome runtime 命名空间时仍使用 Firefox 默认平台服务',
    destination: 'tests/unit/platform/firefox/services.test.ts',
    destinationCase:
      '[R01-FIREFOX-SERVICES-02] selects Firefox defaults even when Firefox exposes chrome.runtime'
  },
  {
    sourceCase: 'Firefox/B01: 应该使用 Firefox messaging API',
    destination: 'tests/unit/platform/firefox/messaging.test.ts',
    destinationCase: '应该使用 Firefox messaging API'
  },
  {
    sourceCase: 'Firefox: 应该优先通过 browserAction 设置徽标文本',
    destination: 'tests/unit/platform/firefox/action.test.ts',
    destinationCase:
      '[R01-FIREFOX-ACTION-01] forwards badge text to browserAction with exact details'
  },
  {
    sourceCase: 'Firefox: 应该在缺少 browserAction 时回退到 action API',
    destination: 'tests/unit/platform/firefox/action.test.ts',
    destinationCase: '[R01-FIREFOX-ACTION-02] falls back to action for badge text'
  },
  {
    sourceCase: 'Firefox: 应该返回注销函数以移除点击监听',
    destination: 'tests/unit/platform/firefox/action.test.ts',
    destinationCase:
      '[R01-FIREFOX-ACTION-03] forwards clicks through and removes the identical wrapper'
  },
  {
    sourceCase: 'Firefox: 应该处理 Firefox 特有的 API 差异',
    destination: 'tests/unit/platform/firefox/services.test.ts',
    destinationCase:
      '[R01-FIREFOX-SERVICES-03] recognizes the browser namespace without a chrome namespace'
  },
  {
    sourceCase: 'Firefox: 应该正确处理 Firefox 的 manifest 差异',
    destination: 'tests/unit/platform/firefox/manifest.test.ts',
    destinationCase:
      '[R01-FIREFOX-MANIFEST-01] preserves Firefox background and Gecko manifest differences'
  }
] as const;

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('ownership module characterization', () => {
  it('preserves the public facade and semantic report diagnostics across extraction', async () => {
    const facade = await import('../../../scripts/utils/testSuiteOwnership.mjs');
    expect(Object.keys(facade).sort()).toEqual(OWNERSHIP_PUBLIC_EXPORTS);

    const sources = new Map<string, string>(OWNERSHIP_CHARACTERIZATION_SOURCES);
    const pass = buildFixtureReport(sources, {
      unitShards: [{ id: 'unit-owned', patterns: ['tests/unit/**/*.test.ts'] }]
    });
    const zeroOwner = buildFixtureReport(sources);

    const cases: ReadonlyArray<
      readonly [
        OwnershipReport,
        { reportSha256: string; formattedSha256: string; failures: readonly string[] }
      ]
    > = [
      [pass, OWNERSHIP_CHARACTERIZATION.pass],
      [zeroOwner, OWNERSHIP_CHARACTERIZATION.zeroOwner]
    ];
    for (const [report, expected] of cases) {
      expect(createHash('sha256').update(JSON.stringify(report)).digest('hex')).toBe(
        expected.reportSha256
      );
      expect(
        createHash('sha256').update(formatTestSuiteOwnershipReport(report)).digest('hex')
      ).toBe(expected.formattedSha256);
      expect(report.failures).toEqual(expected.failures);
    }
  });
});

describe('canonical test suite descriptors', () => {
  it('registers the closed bundled Chromium collection config', async () => {
    const collectionConfigModuleUrl = new URL(
      '../../../scripts/utils/testSuiteOwnership/collectionConfig.mjs',
      import.meta.url
    ).href;
    const { PLAYWRIGHT_CONFIG_PATHS } = (await import(collectionConfigModuleUrl)) as {
      PLAYWRIGHT_CONFIG_PATHS: string[];
    };
    const configPath = 'playwright.bundled-chromium.config.ts';

    expect(PLAYWRIGHT_CONFIG_PATHS).toEqual([
      'playwright.config.ts',
      'playwright.reader.config.ts',
      configPath
    ]);
    expect(
      parsePlaywrightConfig(
        readFileSync(path.resolve(process.cwd(), configPath), 'utf8'),
        configPath
      )
    ).toEqual({
      testDir: 'tests',
      testMatch: [
        '**/tests/e2e/optionsCrossContextMutation.browser.test.ts',
        '**/tests/e2e/sessionDraftConcurrency.browser.test.ts',
        '**/tests/e2e/contentIdleCss.browser.test.ts',
        '**/tests/e2e/uiPrimitiveTokenParity.browser.test.ts',
        '**/tests/e2e/videoScreenshotCacheMigration.browser.test.ts',
        '**/tests/visual/options.stitch-secondary.parity.spec.ts',
        '**/tests/visual/preview.runtime.alignment.spec.ts',
        '**/tests/visual/preview.task-success.layout.spec.ts',
        '**/tests/visual/migration-harness.spec.ts'
      ],
      testIgnore: []
    });
  });

  it('returns fresh exact browser shard suites without process or logging access', async () => {
    const { createBrowserTestShardSuites } = await loadTestShardsModule();
    const cwd = vi.spyOn(process, 'cwd');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const environmentBefore = { ...process.env };

    const first = createBrowserTestShardSuites();
    const second = createBrowserTestShardSuites();

    expect(createBrowserTestShardSuites).toHaveLength(0);
    expect(Object.keys(first)).toEqual(['e2e', 'visual', 'bundled']);
    expect(first).toEqual({
      e2e: [
        {
          id: 'yaml',
          args: ['test', 'tests/visual/yaml-config.interaction.spec.ts']
        },
        {
          id: 'reader-panel',
          args: [
            'test',
            'tests/e2e/readerPanelFlow.test.ts',
            '--config=playwright.reader.config.ts'
          ]
        },
        {
          id: 'smoke',
          args: ['test', 'tests/visual/migration-harness.spec.ts', '--project=chromium-desktop']
        }
      ],
      visual: ['chromium-desktop', 'chromium-tablet', 'chromium-mobile'].map((project) => ({
        id: project,
        args: ['test', '--config=playwright.config.ts', `--project=${project}`]
      })),
      bundled: [
        {
          id: 'bundled-e2e',
          args: [
            'test',
            '--config=playwright.bundled-chromium.config.ts',
            '--project=chromium-desktop',
            'tests/e2e/sessionDraftConcurrency.browser.test.ts',
            'tests/e2e/sessionLifecycleRecovery.browser.test.ts',
            'tests/e2e/optionsCrossContextMutation.browser.test.ts',
            'tests/e2e/videoScreenshotCacheMigration.browser.test.ts'
          ]
        },
        {
          id: 'bundled-visual',
          dependsOn: ['bundled-e2e'],
          args: [
            'test',
            '--config=playwright.bundled-chromium.config.ts',
            '--project=chromium-desktop',
            'tests/visual/options.stitch-secondary.parity.spec.ts',
            'tests/visual/preview.runtime.alignment.spec.ts',
            'tests/visual/preview.task-success.layout.spec.ts',
            'tests/visual/migration-harness.spec.ts'
          ]
        }
      ]
    });
    expect(first).not.toBe(second);
    expect(first.e2e).not.toBe(second.e2e);
    expect(first.visual).not.toBe(second.visual);
    expect(first.e2e[0]).not.toBe(second.e2e[0]);
    expect(first.e2e[0]?.args).not.toBe(second.e2e[0]?.args);
    first.e2e[0]?.args.push('--mutation');
    expect(second.e2e[0]?.args).toEqual(['test', 'tests/visual/yaml-config.interaction.spec.ts']);
    expect(cwd).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(process.env).toEqual(environmentBefore);
  });

  it('imports the browser shard runner without spawning, logging, exiting, or setting exitCode', () => {
    const script = [
      "process.argv[1] = 'synthetic-import-only';",
      'const before = process.exitCode;',
      "await import('./scripts/run-browser-test-shards.mjs?import-safety-test=1');",
      "if (process.exitCode !== before) throw new Error('exitCode changed during import');",
      "process.stdout.write('IMPORT_COMPLETE\\n');"
    ].join('\n');
    const result = spawnSync(
      process.execPath,
      [
        '--no-warnings',
        '--experimental-permission',
        `--allow-fs-read=${process.cwd()}`,
        '--input-type=module',
        '--eval',
        script
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 10_000
      }
    );

    expect(result.status).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout).toBe('IMPORT_COMPLETE\n');
    expect(result.stderr).toBe('');

    const runnerPath = 'scripts/run-browser-test-shards.mjs';
    const runnerSource = readFileSync(path.resolve(process.cwd(), runnerPath), 'utf8');
    const runnerAst = ts.createSourceFile(
      runnerPath,
      runnerSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS
    );
    expect(
      runnerAst.statements
        .filter(ts.isImportDeclaration)
        .map((statement) =>
          ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : ''
        )
    ).toEqual([
      'node:path',
      'node:url',
      './config/commandBoundaryProfiles.mjs',
      './utils/boundedCommand.mjs',
      './utils/taskGraphRunner.mjs',
      './utils/playwrightBuildLease.mjs',
      './utils/testShards.mjs'
    ]);
    expect(
      runnerAst.statements.filter(
        (statement) =>
          !ts.isImportDeclaration(statement) &&
          !ts.isFunctionDeclaration(statement) &&
          !ts.isIfStatement(statement)
      )
    ).toEqual([]);
    expect(runnerAst.statements.filter(ts.isIfStatement)).toHaveLength(1);
    expect(runnerSource).not.toMatch(/node:child_process|\bspawn(?:Sync)?\s*\(/u);
    expect(runnerSource).toContain('startBoundedCommand');
    expect(runnerSource).toContain('parseManagedCommandInvocationArgv');
  });

  it('fails closed through the shared parser for an invalid browser suite', async () => {
    const { main: runBrowserShardsMain } = await loadBrowserRunnerModule();
    const exitCodeBefore = process.exitCode;

    await expect(runBrowserShardsMain(['node', 'runner', 'unknown'], {})).rejects.toMatchObject({
      code: 'COORDINATOR_ARGUMENTS_INVALID'
    });
    expect(process.exitCode).toBe(exitCodeBefore);

    for (const inheritedName of ['__proto__', 'constructor', 'toString']) {
      await expect(
        runBrowserShardsMain(['node', 'runner', inheritedName], {})
      ).rejects.toMatchObject({ code: 'COORDINATOR_ARGUMENTS_INVALID' });
    }
  });
});

describe('Git-visible NUL inventory', () => {
  it('preserves spaces and embedded newlines, includes untracked files, and skips ignored/deleted files', () => {
    const root = createGitFixture();
    writeTest(root, 'tests/unit/ordinary.test.ts');
    writeTest(root, 'tests/unit/ leading space.test.ts');
    writeTest(root, 'tests/unit/embedded\nnewline.test.ts');
    writeTest(root, 'tests/line\nbreak/nested.test.ts');
    writeTest(root, 'tests/unit/literal\\backslash.test.ts');
    writeTest(root, 'tests/unit/trailing.test.ts\n');
    writeTest(root, 'tests/unit/deleted.test.ts');
    writeTest(root, 'tests/unit/ignored.test.ts');
    writeFileSync(path.join(root, '.gitignore'), 'tests/unit/ignored.test.ts\n');
    runGit(root, ['add', '--', '.gitignore', 'tests/unit/ordinary.test.ts']);
    runGit(root, ['add', '--', 'tests/unit/ leading space.test.ts']);
    runGit(root, ['add', '--', 'tests/unit/embedded\nnewline.test.ts']);
    runGit(root, ['add', '--', 'tests/line\nbreak/nested.test.ts']);
    runGit(root, ['add', '--', 'tests/unit/literal\\backslash.test.ts']);
    runGit(root, ['add', '--', 'tests/unit/deleted.test.ts']);
    unlinkSync(path.join(root, 'tests/unit/deleted.test.ts'));
    writeTest(root, 'tests/unit/untracked.test.ts');

    expect(listGitVisibleTestFiles({ cwd: root })).toEqual([
      'tests/line\nbreak/nested.test.ts',
      'tests/unit/ leading space.test.ts',
      'tests/unit/embedded\nnewline.test.ts',
      'tests/unit/literal\\backslash.test.ts',
      'tests/unit/ordinary.test.ts',
      'tests/unit/untracked.test.ts'
    ]);
  });

  it('rejects a Git-visible symlink rather than following it', () => {
    const root = createGitFixture();
    writeTest(root, 'tests/unit/ordinary.test.ts');
    symlinkSync('ordinary.test.ts', path.join(root, 'tests/unit/link.test.ts'));

    expect(() => listGitVisibleTestFiles({ cwd: root })).toThrow(
      'Test candidate must not be a symlink'
    );
  });

  it('rejects every non-regular Git-visible candidate', () => {
    expect(() =>
      listGitVisibleTestFiles({
        cwd: '/synthetic',
        runGit: () => Buffer.from('tests/unit/directory.test.ts\0'),
        lstat: () => ({ isSymbolicLink: () => false, isFile: () => false })
      })
    ).toThrow('Test candidate is not a regular file');
  });

  it('deduplicates exact normalized Git entries', () => {
    const visible = Buffer.from('tests/unit/a.test.ts\0tests/unit/a.test.ts\0');
    const tracked = Buffer.from('tests/unit/a.test.ts\0');
    const runGit = vi.fn((args: string[]) => (args.includes('--others') ? visible : tracked));
    const lstat = vi.fn(() => ({ isSymbolicLink: () => false, isFile: () => true }));

    expect(listGitVisibleTestFiles({ cwd: '/synthetic', runGit, lstat })).toEqual([
      'tests/unit/a.test.ts'
    ]);
    expect(runGit).toHaveBeenNthCalledWith(
      1,
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'tests'],
      { cwd: '/synthetic' }
    );
  });

  it('rejects malformed UTF-8, unterminated output, Git failures, and stat failures', () => {
    expect(() => decodeNulDelimitedPaths(Buffer.from([0xff, 0]))).toThrow('not valid UTF-8');
    expect(() => decodeNulDelimitedPaths(Buffer.from('tests/unit/a.test.ts'))).toThrow(
      'not NUL terminated'
    );
    expect(() =>
      listGitVisibleTestFiles({
        cwd: '/synthetic',
        runGit: () => {
          throw new Error('synthetic Git failure');
        }
      })
    ).toThrow('synthetic Git failure');
    expect(() =>
      listGitVisibleTestFiles({
        cwd: '/synthetic',
        runGit: () => Buffer.from('tests/unit/a.test.ts\0'),
        lstat: () => {
          const error = new Error('synthetic stat failure') as NodeJS.ErrnoException;
          error.code = 'EACCES';
          throw error;
        }
      })
    ).toThrow('Unable to lstat test candidate');
  });
});

describe('structured ownership analysis', () => {
  it('distinguishes direct registration from an exported registrar', () => {
    const direct = analyzeTestModule(
      'tests/e2e/direct.browser.test.ts',
      "import { test } from '@playwright/test';\ntest('direct', async () => undefined);\n"
    );
    const registrar = analyzeTestModule(
      'tests/e2e/registrar.browser.test.ts',
      [
        "import { test } from '@playwright/test';",
        'export function registerChildTests(): void {',
        "  test('registered later', async () => undefined);",
        '}'
      ].join('\n')
    );

    expect(direct.directRegistration).toBe(true);
    expect(registrar.directRegistration).toBe(false);
    expect([...registrar.exportedRegistrars]).toEqual(['registerChildTests']);

    const shadowed = analyzeTestModule(
      'tests/unit/shadowed.test.ts',
      "function test(): void {}\ntest('not a test registration');\n"
    );
    expect(shadowed.directRegistration).toBe(false);
    expect(shadowed.potentialRegistration).toBe(true);

    for (const dormantSource of [
      "for (; false; ) test('dead loop', () => undefined);",
      "const cases: number[] = []; cases.forEach(() => test('dead array', () => undefined));",
      "try {} catch (test) { test('not the test API'); }",
      "if (0) test('dead numeric branch', () => undefined);",
      "0 && test('dead numeric logical', () => undefined);",
      "'' && test('dead string logical', () => undefined);",
      "null && test('dead null logical', () => undefined);",
      "(1 === 2) && test('dead comparison logical', () => undefined);",
      "(() => { return; test('after return', () => undefined); })();",
      "(function test() { test('shadowed named IIFE', () => undefined); })();",
      "class Dormant { field = test('uninstantiated field', () => undefined); }",
      "class Dormant { constructor() { test('dormant constructor', () => undefined); } }",
      "throw new Error('stop'); test('after throw', () => undefined);"
    ]) {
      const dormant = analyzeTestModule('tests/unit/dormant.test.ts', dormantSource);
      expect(dormant.directRegistration).toBe(false);
      expect(dormant.potentialRegistration).toBe(true);
    }
  });

  it('requires browser registrations to come from the Playwright API', () => {
    const browserFile = 'tests/e2e/no-import.browser.test.ts';
    const report = buildFixtureReport(
      new Map([[browserFile, "test('not a Playwright registration', async () => undefined);\n"]]),
      {
        packageScripts: {
          browser: `node scripts/run-playwright.mjs test ${browserFile}`
        }
      }
    );

    expect(report.ok).toBe(false);
    expect(report.runnableFiles).toEqual([]);
    expect(report.unclassifiedModules).toEqual([browserFile]);
    expect(report.invalidDescriptors).toContain(
      `package:browser:0 names a non-runnable test module: ${browserFile}`
    );
  });

  it('keeps a dynamically imported runnable test runnable instead of classifying it as a helper', () => {
    const parent = 'tests/e2e/parent.browser.test.ts';
    const child = 'tests/e2e/dynamic-child.browser.test.ts';
    const report = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "test('parent', async () => import('./dynamic-child.browser.test'));"
          ].join('\n')
        ],
        [child, "import { test } from '@playwright/test';\ntest('child', async () => undefined);\n"]
      ]),
      {
        packageScripts: {
          browser: `node scripts/run-playwright.mjs test ${parent}`
        }
      }
    );

    expect(report.zeroOwner).toEqual([child]);
    expect(report.multipleOwners).toEqual([]);
    expect(report.classifications).toEqual([
      { file: child, kind: 'runnable' },
      { file: parent, kind: 'runnable' }
    ]);
  });

  it('classifies an invoked registration module as a registrar without making it an orphan', () => {
    const parent = 'tests/e2e/parent.browser.test.ts';
    const registrar = 'tests/e2e/child-registrar.browser.test.ts';
    const report = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "import { registerChildTests } from './child-registrar.browser.test';",
            "test.describe('parent', () => registerChildTests());"
          ].join('\n')
        ],
        [
          registrar,
          [
            "import { test } from '@playwright/test';",
            'export function registerChildTests(): void {',
            "  test('child', async () => undefined);",
            '}'
          ].join('\n')
        ]
      ]),
      {
        packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` }
      }
    );

    expect(report.ok).toBe(true);
    expect(report.counts).toMatchObject({ inventory: 2, runnable: 1, classified: 1 });
    expect(report.classifications).toContainEqual({
      file: registrar,
      kind: 'registrar',
      importedBy: [parent]
    });
  });

  it('recognizes namespace and concurrent registrations without relying on a path name', () => {
    const file = 'tests/unit/opaque-module.test.ts';
    const report = buildFixtureReport(
      new Map([
        [
          file,
          [
            "import * as vitest from 'vitest';",
            'const cases = [1] as const;',
            "cases.forEach(() => vitest.test.concurrent('namespace case', async () => undefined));"
          ].join('\n')
        ]
      ]),
      { unitShards: [{ id: 'unit', patterns: [file] }] }
    );

    expect(report.ok).toBe(true);
    expect(report.classifications).toEqual([{ file, kind: 'runnable' }]);
  });

  it('counts registrar calls only when they execute during test collection', () => {
    const parent = 'tests/e2e/parent.browser.test.ts';
    const child = 'tests/e2e/opaque-child.browser.test.ts';
    const childSource = [
      "import { test } from '@playwright/test';",
      'export function registerCases(): void {',
      "  test('child', async () => undefined);",
      '}'
    ].join('\n');
    const late = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "import { registerCases } from './opaque-child.browser.test';",
            "test('parent', () => registerCases());"
          ].join('\n')
        ],
        [child, childSource]
      ]),
      { packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` } }
    );
    const dead = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "import { registerCases } from './opaque-child.browser.test';",
            "test('parent', async () => undefined);",
            'if (false) registerCases();'
          ].join('\n')
        ],
        [child, childSource]
      ]),
      { packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` } }
    );
    const deadDefinition = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "import { registerCases } from './opaque-child.browser.test';",
            "test.describe('parent', () => registerCases());"
          ].join('\n')
        ],
        [
          child,
          [
            "import { test } from '@playwright/test';",
            'export function registerCases(): void {',
            "  if (false) test('dead child', async () => undefined);",
            '}'
          ].join('\n')
        ]
      ]),
      { packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` } }
    );
    const shadowed = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "import { registerCases } from './opaque-child.browser.test';",
            "test.describe('parent', (registerCases = () => undefined) => registerCases());"
          ].join('\n')
        ],
        [child, childSource]
      ]),
      { packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` } }
    );

    const afterThrow = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "import { registerCases } from './opaque-child.browser.test';",
            "test('parent', async () => undefined);",
            "throw new Error('stop collection');",
            'registerCases();'
          ].join('\n')
        ],
        [child, childSource]
      ]),
      { packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` } }
    );
    const catchShadow = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "import { registerCases } from './opaque-child.browser.test';",
            "test('parent', async () => undefined);",
            'try { throw new Error(); } catch (registerCases) { registerCases(); }'
          ].join('\n')
        ],
        [child, childSource]
      ]),
      { packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` } }
    );

    for (const report of [late, dead, deadDefinition, shadowed, afterThrow, catchShadow]) {
      expect(report.ok).toBe(false);
      expect(report.unclassifiedModules).toEqual([child]);
    }
  });

  it('supports namespace registrar calls during collection but ignores type-only imports', () => {
    const parent = 'tests/e2e/parent.browser.test.ts';
    const child = 'tests/e2e/opaque-child.browser.test.ts';
    const childSource = [
      "import { test } from '@playwright/test';",
      'export function registerCases(): void {',
      "  test('child', async () => undefined);",
      '}'
    ].join('\n');
    const consumed = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "import * as cases from './opaque-child.browser.test';",
            "test.describe.parallel('parent', () => cases.registerCases());"
          ].join('\n')
        ],
        [child, childSource]
      ]),
      { packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` } }
    );
    const typeOnly = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "import type { registerCases } from './opaque-child.browser.test';",
            "test('parent', async () => undefined);"
          ].join('\n')
        ],
        [child, 'export type Fixture = { value: string };\n']
      ]),
      { packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` } }
    );

    expect(consumed.ok).toBe(true);
    expect(consumed.classifications).toContainEqual({
      file: child,
      kind: 'registrar',
      importedBy: [parent]
    });
    expect(typeOnly.unclassifiedModules).toEqual([child]);
  });

  it('recognizes top-level dynamic registrars, parenthesized IIFEs, and suite modifiers', () => {
    const parent = 'tests/e2e/parent.browser.test.ts';
    const child = 'tests/e2e/opaque-child.browser.test.ts';
    const dynamic = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "const { default: registerCases } = await import('./opaque-child.browser.test');",
            "test.describe('parent', () => registerCases());"
          ].join('\n')
        ],
        [
          child,
          [
            "import { test } from '@playwright/test';",
            'function defineCases(): void {',
            "  test('child', async () => undefined);",
            '}',
            'export default defineCases;'
          ].join('\n')
        ]
      ]),
      { packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` } }
    );
    expect(dynamic.ok).toBe(true);
    expect(dynamic.classifications).toContainEqual({
      file: child,
      kind: 'registrar',
      importedBy: [parent]
    });

    const unitFile = 'tests/unit/wrapped.test.ts';
    const wrapped = buildFixtureReport(
      new Map([
        [
          unitFile,
          [
            "import { test } from 'vitest';",
            "((() => test.runIf(true)('wrapped', () => undefined)))();"
          ].join('\n')
        ]
      ]),
      { unitShards: [{ id: 'wrapped', patterns: [unitFile] }] }
    );
    expect(wrapped.ok).toBe(true);

    const modifierChild = 'tests/e2e/modifier-child.browser.test.ts';
    const modifiers = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "import './modifier-child.browser.test';",
            "test('parent', async () => undefined);"
          ].join('\n')
        ],
        [
          modifierChild,
          [
            "import { test } from '@playwright/test';",
            "test.describe.parallel('parallel suite', () => undefined);"
          ].join('\n')
        ]
      ]),
      { packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` } }
    );
    expect(modifiers.zeroOwner).toEqual([modifierChild]);
    expect(modifiers.classifications).toContainEqual({ file: modifierChild, kind: 'runnable' });
  });

  it('requires every structural registrar export to be consumed by a runnable caller', () => {
    const parent = 'tests/e2e/parent.browser.test.ts';
    const registrar = 'tests/e2e/child-registrar.browser.test.ts';
    const report = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "import { defineChildTests } from './child-registrar.browser.test';",
            "test.describe('parent', () => defineChildTests());"
          ].join('\n')
        ],
        [
          registrar,
          [
            "import { test } from '@playwright/test';",
            'export function defineChildTests(): void {',
            "  test('child', async () => undefined);",
            '}',
            'export function defineForgottenTests(): void {',
            "  test('forgotten', async () => undefined);",
            '}'
          ].join('\n')
        ]
      ]),
      {
        packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` }
      }
    );

    expect(report.unclassifiedModules).toEqual([registrar]);
    expect(report.failures).toContain(`unclassified:${registrar}`);
  });

  it('fails closed on malformed browser descriptors and dynamic Playwright config paths', () => {
    const browserFile = 'tests/e2e/browser.browser.test.ts';
    const report = buildFixtureReport(
      new Map([
        [
          browserFile,
          "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
        ]
      ]),
      {
        browserSuites: {
          e2e: [{ id: 'broken', args: ['--project=chromium-desktop'] }]
        }
      }
    );

    expect(report.invalidDescriptors).toEqual([
      'browser-shard:e2e:broken has no Playwright test command'
    ]);
    expect(report.zeroOwner).toEqual([browserFile]);
    expect(() =>
      parsePlaywrightConfig(
        "export default defineConfig({ testDir: path.join(runtimeRoot, 'tests/e2e') });"
      )
    ).toThrow('testDir is not statically derivable');
    expect(() => parsePlaywrightConfig('export default defineConfig({ testDir: [ });')).toThrow(
      'contains TypeScript parse errors'
    );
  });

  it('does not classify disconnected zero-registration test modules as support', () => {
    const first = 'tests/e2e/disconnected-a.browser.test.ts';
    const second = 'tests/e2e/disconnected-b.browser.test.ts';
    const report = buildFixtureReport(
      new Map([
        [first, "import './disconnected-b.browser.test';\nexport const fixture = true;\n"],
        [second, 'export const helper = true;\n']
      ])
    );

    expect(report.unclassifiedModules).toEqual([first, second]);
    expect(report.counts).toMatchObject({ runnable: 0, classified: 2 });
  });

  it('fails a relative import that claims a missing test module', () => {
    const parent = 'tests/e2e/parent.browser.test.ts';
    const report = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "import './missing.browser.test';",
            "test('parent', async () => undefined);"
          ].join('\n')
        ]
      ]),
      { packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` } }
    );

    expect(report.ok).toBe(false);
    expect(report.invalidDescriptors).toContain(
      `unresolved test-module import: ${parent} -> ./missing.browser.test`
    );

    const deferredDynamic = buildFixtureReport(
      new Map([
        [
          parent,
          [
            "import { test } from '@playwright/test';",
            "test('parent', async () => import('./missing.browser.test'));"
          ].join('\n')
        ]
      ]),
      { packageScripts: { browser: `node scripts/run-playwright.mjs test ${parent}` } }
    );
    expect(deferredDynamic.ok).toBe(false);
    expect(deferredDynamic.invalidDescriptors).toContain(
      `unresolved test-module import: ${parent} -> ./missing.browser.test`
    );
  });

  it('fails empty shard globs and missing, duplicate, or multiply owned members', () => {
    const unitFile = 'tests/unit/a.test.ts';
    const empty = buildFixtureReport(
      new Map([[unitFile, "describe('a', () => it('works', () => undefined));\n"]]),
      {
        unitShards: [{ id: 'empty', patterns: ['tests/unit/missing/**/*.test.ts'] }]
      }
    );
    expect(empty.emptyPatterns).toEqual([
      { kind: 'unit', shard: 'empty', pattern: 'tests/unit/missing/**/*.test.ts' }
    ]);
    expect(empty.zeroOwner).toEqual([unitFile]);

    const emptyDescriptor = buildFixtureReport(
      new Map([[unitFile, "describe('a', () => it('works', () => undefined));\n"]]),
      { unitShards: [{ id: 'empty-descriptor', patterns: [] }] }
    );
    expect(emptyDescriptor.invalidDescriptors).toContain('unit shard is not a valid descriptor');

    const newlineFile = 'tests/unit/line\nbreak/a.test.ts';
    const newlineGlob = buildFixtureReport(
      new Map([[newlineFile, "import { test } from 'vitest';\ntest('works', () => undefined);\n"]]),
      { unitShards: [{ id: 'newline', patterns: ['tests/unit/**/*.test.ts'] }] }
    );
    expect(newlineGlob.ok).toBe(false);
    expect(newlineGlob.zeroOwner).toEqual([newlineFile]);

    const duplicate = buildFixtureReport(
      new Map([[unitFile, "describe('a', () => it('works', () => undefined));\n"]]),
      {
        unitShards: [
          { id: 'first', patterns: ['tests/unit/**/*.test.ts'] },
          { id: 'second', patterns: ['tests/unit/a.test.ts'] }
        ]
      }
    );
    expect(duplicate.multipleOwners).toEqual([
      { file: unitFile, owners: ['vitest:unit:first', 'vitest:unit:second'] }
    ]);

    const duplicateWithinShard = buildFixtureReport(
      new Map([[unitFile, "describe('a', () => it('works', () => undefined));\n"]]),
      {
        unitShards: [
          {
            id: 'overlap',
            patterns: ['tests/unit/**/*.test.ts', 'tests/unit/a.test.ts']
          }
        ]
      }
    );
    expect(duplicateWithinShard.duplicateRouteMembers).toEqual([
      { route: 'vitest:unit:overlap', file: unitFile }
    ]);

    const e2eFile = 'tests/e2e/a.test.ts';
    const configLeak = buildFixtureReport(
      new Map([
        [unitFile, "describe('unit', () => it('works', () => undefined));\n"],
        [e2eFile, "describe('e2e', () => it('works', () => undefined));\n"]
      ]),
      {
        unitShards: [{ id: 'unit', patterns: ['tests/**/*.test.ts'] }],
        e2eShards: [{ id: 'e2e', patterns: [e2eFile] }]
      }
    );
    expect(configLeak.invalidDescriptors).toContain(
      `unit shard unit pattern tests/**/*.test.ts escapes its Vitest config: ${e2eFile}`
    );

    const missing = buildFixtureReport(new Map(), {
      packageScripts: {
        browser: 'node scripts/run-playwright.mjs test tests/e2e/missing.browser.test.ts'
      }
    });
    expect(missing.missingRouteMembers).toEqual([
      {
        route: 'package:browser:0',
        file: 'tests/e2e/missing.browser.test.ts'
      }
    ]);

    const browserFile = 'tests/e2e/duplicate.browser.test.ts';
    const duplicateMember = buildFixtureReport(
      new Map([
        [
          browserFile,
          "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
        ]
      ]),
      {
        packageScripts: {
          browser: `node scripts/run-playwright.mjs test ${browserFile} ${browserFile}`
        }
      }
    );
    expect(duplicateMember.duplicateRouteMembers).toEqual([
      { route: 'package:browser:0', file: browserFile }
    ]);
  });

  it('rejects unreachable package commands and explicit non-runnable route members', () => {
    const browserFile = 'tests/e2e/orphan.browser.test.ts';
    const unreachable = buildFixtureReport(
      new Map([
        [
          browserFile,
          "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
        ]
      ]),
      {
        packageScripts: {
          browser: `true || node scripts/run-playwright.mjs test ${browserFile}`
        }
      }
    );
    expect(unreachable.zeroOwner).toEqual([browserFile]);
    expect(unreachable.invalidDescriptors).toEqual([
      'package script browser uses unsupported control flow around Playwright'
    ]);

    const falseAnd = buildFixtureReport(
      new Map([
        [
          browserFile,
          "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
        ]
      ]),
      {
        packageScripts: {
          browser: `false && node scripts/run-playwright.mjs test ${browserFile}; true`
        }
      }
    );
    expect(falseAnd.zeroOwner).toEqual([browserFile]);
    expect(falseAnd.ok).toBe(false);

    const missingBuildSetup = buildFixtureReport(
      new Map([
        [
          browserFile,
          "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
        ]
      ]),
      {
        packageScripts: {
          browser: `npm run build:does-not-exist && node scripts/run-playwright.mjs test ${browserFile}`
        }
      }
    );
    expect(missingBuildSetup.zeroOwner).toEqual([browserFile]);
    expect(missingBuildSetup.ok).toBe(false);

    const deadSetupScripts: Array<Record<string, string>> = [
      {
        browser: `npm run build:dead && node scripts/run-playwright.mjs test ${browserFile}`,
        'build:dead': 'false'
      },
      {
        browser: `npm run verify:runtime && node scripts/run-playwright.mjs test ${browserFile}`,
        'verify:runtime': 'exit 1'
      },
      {
        browser: `npm run build:dead && node scripts/run-playwright.mjs test ${browserFile}`,
        'build:dead': 'npm run build:missing'
      }
    ];
    for (const packageScripts of deadSetupScripts) {
      const deadSetup = buildFixtureReport(
        new Map([
          [
            browserFile,
            "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
          ]
        ]),
        { packageScripts }
      );
      expect(deadSetup.ok).toBe(false);
      expect(deadSetup.zeroOwner).toEqual([browserFile]);
    }

    const reachableBuildSetup = buildFixtureReport(
      new Map([
        [
          browserFile,
          "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
        ]
      ]),
      {
        packageScripts: {
          browser: `npm run build:good && node scripts/run-playwright.mjs test ${browserFile}`,
          'build:good': 'node scripts/build.mjs --mode=prod --skip-checks'
        }
      }
    );
    expect(reachableBuildSetup.ok).toBe(true);

    const helper = 'tests/e2e/helper.browser.test.ts';
    const nonRunnable = buildFixtureReport(new Map([[helper, 'export const fixture = true;\n']]), {
      packageScripts: {
        browser: `node scripts/run-playwright.mjs test ${helper}`
      }
    });
    expect(nonRunnable.invalidDescriptors).toContain(
      `package:browser:0 names a non-runnable test module: ${helper}`
    );
    expect(nonRunnable.unclassifiedModules).toEqual([helper]);

    const visualFile = 'tests/visual/filtered.spec.ts';
    const filtered = buildFixtureReport(
      new Map([
        [
          visualFile,
          "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
        ]
      ]),
      {
        packageScripts: {
          browser: 'node scripts/run-playwright.mjs test --grep=works'
        }
      }
    );
    expect(filtered.zeroOwner).toEqual([visualFile]);
    expect(filtered.invalidDescriptors).toContain(
      'package:browser:0 uses Playwright filter --grep, which is not a complete collection owner'
    );

    const missingConfig = buildFixtureReport(
      new Map([
        [
          browserFile,
          "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
        ]
      ]),
      {
        packageScripts: {
          browser: `node scripts/run-playwright.mjs test ${browserFile} --config=missing.config.ts`
        }
      }
    );
    expect(missingConfig.zeroOwner).toEqual([browserFile]);
    expect(missingConfig.missingRouteMembers).toContainEqual({
      route: 'package:browser:0',
      file: 'config:missing.config.ts'
    });

    const passWithNoTests = buildFixtureReport(
      new Map([
        [
          browserFile,
          "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
        ]
      ]),
      {
        packageScripts: {
          browser: `node scripts/run-playwright.mjs test ${browserFile} --pass-with-no-tests`
        }
      }
    );
    expect(passWithNoTests.zeroOwner).toEqual([browserFile]);
    expect(passWithNoTests.invalidDescriptors).toContain(
      'package:browser:0 uses Playwright filter --pass-with-no-tests, which is not a complete collection owner'
    );

    for (const nonExecutingOption of ['--list', '--ui']) {
      const nonExecuting = buildFixtureReport(
        new Map([
          [
            browserFile,
            "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
          ]
        ]),
        {
          packageScripts: {
            browser: `node scripts/run-playwright.mjs test ${browserFile} ${nonExecutingOption}`
          }
        }
      );
      expect(nonExecuting.zeroOwner).toEqual([browserFile]);
      expect(nonExecuting.invalidDescriptors).toContain(
        `package:browser:0 uses Playwright filter ${nonExecutingOption}, which is not a complete collection owner`
      );
    }

    const maxFailuresFlag = buildFixtureReport(
      new Map([
        [
          browserFile,
          "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
        ]
      ]),
      {
        packageScripts: {
          browser: `node scripts/run-playwright.mjs test -x ${browserFile}`
        }
      }
    );
    expect(maxFailuresFlag.ok).toBe(true);
  });

  it('collapses identical and matrix Playwright routes but rejects incomparable owners', () => {
    const fileA = 'tests/e2e/a.browser.test.ts';
    const fileB = 'tests/e2e/b.browser.test.ts';
    const fileC = 'tests/e2e/c.browser.test.ts';
    const sources = new Map(
      [fileA, fileB, fileC].map((file) => [
        file,
        "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
      ])
    );
    const collapsed = buildFixtureReport(sources, {
      packageScripts: {
        first: `node scripts/run-playwright.mjs test ${fileA} --project=chromium-desktop`,
        second: `node scripts/run-playwright.mjs test ${fileA} --project=chromium-mobile`
      }
    });
    expect(collapsed.multipleOwners).toEqual([]);
    expect(collapsed.zeroOwner).toEqual([fileB, fileC]);

    const nested = buildFixtureReport(sources, {
      packageScripts: {
        full: `node scripts/run-playwright.mjs test ${fileA} ${fileB} ${fileC}`,
        focused: `node scripts/run-playwright.mjs test ${fileA}`
      }
    });
    expect(nested.multipleOwners).toEqual([]);
    expect(nested.owners.find((row) => row.file === fileA)?.owners).toEqual([
      `playwright:${JSON.stringify([fileA])}`
    ]);
    expect(nested.owners.find((row) => row.file === fileB)?.owners).toEqual([
      `playwright:${JSON.stringify([fileA, fileB, fileC])}`
    ]);

    const evidenceConsumer = buildFixtureReport(sources, {
      packageScripts: {
        canonical: `node scripts/run-playwright.mjs test ${fileA} ${fileB} ${fileC}`,
        verification: `npx vitest run tests/unit/example.test.ts && node scripts/run-playwright.mjs test ${fileA}`
      }
    });
    expect(evidenceConsumer.owners.find((row) => row.file === fileA)?.owners).toEqual([
      `playwright:${JSON.stringify([fileA, fileB, fileC])}`
    ]);

    const overlapping = buildFixtureReport(sources, {
      packageScripts: {
        first: `node scripts/run-playwright.mjs test ${fileA} ${fileB}`,
        second: `node scripts/run-playwright.mjs test ${fileA} ${fileC}`
      }
    });
    expect(overlapping.multipleOwners).toHaveLength(1);
    expect(overlapping.multipleOwners[0]?.file).toBe(fileA);
  });

  it('binds the exact G00 state and architecture routes without weakening generic ownership', () => {
    const files = [...G00_STATE_BROWSER_FILES, ...G00_ARCHITECTURE_BROWSER_FILES];
    const sources = new Map(
      files.map((file) => [
        file,
        "import { test } from '@playwright/test';\ntest('works', async () => undefined);\n"
      ])
    );
    const packageScripts = {
      'verify:runtime': 'node scripts/verify-runtime.mjs',
      'test:e2e:browser:state': G00_STATE_BROWSER_SCRIPT,
      'test:e2e:browser:architecture': G00_ARCHITECTURE_BROWSER_SCRIPT
    };
    const browserSuites = {
      bundled: [
        {
          id: 'bundled-e2e',
          args: ['test', ...G00_STATE_BROWSER_FILES]
        }
      ]
    };
    const exact = buildFixtureReport(sources, { browserSuites, packageScripts });

    expect(exact.zeroOwner).toEqual([]);
    expect(exact.multipleOwners).toEqual([]);
    expect(exact.duplicateRouteMembers).toEqual([]);
    expect(exact.ok).toBe(true);
    for (const file of files) {
      expect(exact.owners.find((row) => row.file === file)?.owners).toHaveLength(1);
    }

    const missingArchitectureMember = buildFixtureReport(sources, {
      browserSuites,
      packageScripts: {
        ...packageScripts,
        'test:e2e:browser:architecture': G00_ARCHITECTURE_BROWSER_SCRIPT.replace(
          ` ${G00_OPTIONS_INCREMENTAL_BROWSER_FILE}`,
          ''
        )
      }
    });
    expect(missingArchitectureMember.zeroOwner).toEqual([G00_OPTIONS_INCREMENTAL_BROWSER_FILE]);

    const duplicateStateMember = buildFixtureReport(sources, {
      browserSuites,
      packageScripts: {
        ...packageScripts,
        'test:e2e:browser:state': G00_STATE_BROWSER_SCRIPT.replace(
          G00_STATE_BROWSER_FILES[1],
          `${G00_STATE_BROWSER_FILES[1]} ${G00_STATE_BROWSER_FILES[1]}`
        )
      }
    });
    expect(duplicateStateMember.duplicateRouteMembers.map((row) => row.file)).toContain(
      G00_STATE_BROWSER_FILES[1]
    );

    const secondCanonicalRoute = buildFixtureReport(sources, {
      browserSuites,
      packageScripts: {
        ...packageScripts,
        'test:e2e:browser:cross-lane': `node scripts/run-playwright.mjs test ${G00_STATE_BROWSER_FILES[0]} ${G00_ARCHITECTURE_BROWSER_FILES[0]}`
      }
    });
    expect(secondCanonicalRoute.multipleOwners.map((row) => row.file)).toEqual([
      G00_STATE_BROWSER_FILES[0],
      G00_ARCHITECTURE_BROWSER_FILES[0]
    ]);
  });

  it('derives the live registrar set and keeps every retained shard pattern non-empty', () => {
    const report = auditRepositoryTestSuiteOwnership();
    const registrars = report.classifications
      .filter((row) => row.kind === 'registrar')
      .map((row) => row.file);

    expect(registrars).toEqual([
      'tests/e2e/videoListenerScope.bilibili.browser.test.ts',
      'tests/e2e/videoListenerScope.lifecycle.browser.test.ts',
      'tests/e2e/videoListenerScope.youtube.browser.test.ts'
    ]);
    expect(report.emptyPatterns).toEqual([]);
    expect(report.multipleOwners).toEqual([]);
    expect(report.unclassifiedModules).toEqual([]);
    expect(report.zeroOwner).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe('R01 cross-milestone case migration ledger', () => {
  it('maps all 3 Chrome and 11 Firefox root cases to one distinct runnable replacement', () => {
    expect(R01_CASE_MIGRATION_LEDGER).toHaveLength(14);
    expect(
      createHash('sha256').update(JSON.stringify(R01_CASE_MIGRATION_LEDGER)).digest('hex')
    ).toBe('ba544f38bd24f3f39b865d19cd6d88bb529dfca23ef0a2d325ad40976513a721');
    expect(new Set(R01_CASE_MIGRATION_LEDGER.map((row) => row.sourceCase)).size).toBe(14);
    expect(
      new Set(R01_CASE_MIGRATION_LEDGER.map((row) => `${row.destination}\0${row.destinationCase}`))
        .size
    ).toBe(14);

    const registrationsByFile = new Map(
      [...new Set(R01_CASE_MIGRATION_LEDGER.map((row) => row.destination))].map((file) => [
        file,
        collectCaseRegistrations(file)
      ])
    );
    for (const row of R01_CASE_MIGRATION_LEDGER) {
      const matches = registrationsByFile
        .get(row.destination)
        ?.filter((registration) => registration.title === row.destinationCase);
      expect(matches, `${row.sourceCase} -> ${row.destinationCase}`).toEqual([
        { title: row.destinationCase, mode: 'run' }
      ]);
    }

    expect(
      collectCaseRegistrationsFromSource(
        'synthetic-ledger.test.ts',
        [
          "describe('suite', () => {",
          "  it('ordinary', () => it('too late', () => undefined));",
          "  if (false) it('dead', () => undefined);",
          "  false && it('dead logical', () => undefined);",
          "  false ? it('dead ternary', () => undefined) : undefined;",
          "  try {} catch { it('dead catch', () => undefined); }",
          "  describe.skip('skipped suite', () => it('skipped child', () => undefined));",
          "  { const it = (..._args: unknown[]) => undefined; it('shadowed local', () => undefined); }",
          "  (() => { return; it('after return', () => undefined); })();",
          "  (function it() { it('shadowed named IIFE', () => undefined); })();",
          "  (() => { throw new Error('stop'); it('after throw', () => undefined); })();",
          "  class Dormant { constructor() { it('constructor', () => undefined); } }",
          "  class Accessors { get value() { it('getter', () => undefined); return 1; } set value(_next: number) { it('setter', () => undefined); } }",
          "  class Field { value = it('field', () => undefined); }",
          '});'
        ].join('\n')
      )
    ).toEqual([{ title: 'ordinary', mode: 'run' }]);
  });
});

function createGitFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'zendio-test-ownership-'));
  temporaryRoots.push(root);
  runGit(root, ['init', '--quiet']);
  mkdirSync(path.join(root, 'tests/unit'), { recursive: true });
  return root;
}

async function loadTestShardsModule(): Promise<{
  createBrowserTestShardSuites: () => {
    e2e: Array<{ id: string; args: string[]; dependsOn?: string[] }>;
    visual: Array<{ id: string; args: string[]; dependsOn?: string[] }>;
    bundled: Array<{ id: string; args: string[]; dependsOn?: string[] }>;
  };
}> {
  const moduleUrl = new URL('../../../scripts/utils/testShards.mjs', import.meta.url).href;
  return (await import(moduleUrl)) as {
    createBrowserTestShardSuites: () => {
      e2e: Array<{ id: string; args: string[]; dependsOn?: string[] }>;
      visual: Array<{ id: string; args: string[]; dependsOn?: string[] }>;
      bundled: Array<{ id: string; args: string[]; dependsOn?: string[] }>;
    };
  };
}

async function loadBrowserRunnerModule(): Promise<{
  main: (
    argv?: string[],
    options?: object
  ) => Promise<{ ok: boolean; failed: Array<{ code?: number }> }>;
}> {
  const moduleUrl = new URL('../../../scripts/run-browser-test-shards.mjs', import.meta.url).href;
  return (await import(moduleUrl)) as {
    main: (
      argv?: string[],
      options?: object
    ) => Promise<{ ok: boolean; failed: Array<{ code?: number }> }>;
  };
}

function writeTest(root: string, relativePath: string): void {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, "describe('fixture', () => it('works', () => undefined));\n");
}

function runGit(root: string, args: string[]): void {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  }
}

function buildFixtureReport(
  sources: Map<string, string>,
  overrides: {
    unitShards?: TestShardDescriptor[];
    e2eShards?: TestShardDescriptor[];
    browserSuites?: Record<string, Array<{ id: string; args: string[] }>>;
    packageScripts?: Record<string, string>;
  } = {}
): OwnershipReport {
  const emptyPlaywrightConfig: PlaywrightCollectionConfig = {
    testDir: 'tests/visual',
    testMatch: [],
    testIgnore: []
  };
  return buildTestSuiteOwnershipReport({
    files: [...sources.keys()],
    sources,
    unitShards: overrides.unitShards ?? [],
    e2eShards: overrides.e2eShards ?? [],
    browserSuites: overrides.browserSuites ?? {},
    packageScripts: overrides.packageScripts ?? {},
    vitestConfigs: {
      unit: { include: ['tests/unit/**/*.test.ts'], exclude: [] },
      e2e: {
        include: ['tests/e2e/**/*.test.ts'],
        exclude: ['tests/e2e/**/*.browser.test.ts']
      }
    },
    playwrightConfigs: new Map([['playwright.config.ts', emptyPlaywrightConfig]])
  });
}

function collectCaseRegistrations(file: string): Array<{ title: string; mode: string }> {
  const source = readFileSync(path.resolve(process.cwd(), file), 'utf8');
  return collectCaseRegistrationsFromSource(file, source);
}

function collectCaseRegistrationsFromSource(
  file: string,
  source: string
): Array<{ title: string; mode: string }> {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  if (parseDiagnostics.length > 0) {
    throw new Error(`${file} contains TypeScript parse errors`);
  }
  const registrations: Array<{ title: string; mode: string }> = [];
  const visitFunction = (
    node: ts.FunctionLikeDeclaration,
    inheritedShadowed: Set<string>
  ): void => {
    const shadowed = new Set(inheritedShadowed);
    if (node.name && ts.isIdentifier(node.name)) shadowed.add(node.name.text);
    for (const parameter of node.parameters) collectCaseBindingNames(parameter.name, shadowed);
    if (node.body) visit(node.body, shadowed);
  };
  const visit = (node: ts.Node, inheritedShadowed: Set<string>): void => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    let shadowed = inheritedShadowed;
    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      shadowed = new Set(inheritedShadowed);
      collectDirectCaseScopeBindings(node.statements, shadowed);
      for (const statement of node.statements) {
        visit(statement, shadowed);
        if (isDefinitelyAbruptCaseStatement(statement)) break;
      }
      return;
    }
    if (node !== sourceFile && isDeferredCaseFunction(node)) return;
    if (ts.isIfStatement(node)) {
      const condition = readCaseStaticBoolean(node.expression);
      if (condition === true) visit(node.thenStatement, shadowed);
      if (condition === false && node.elseStatement) visit(node.elseStatement, shadowed);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.condition, shadowed);
      const condition = readCaseStaticBoolean(node.condition);
      if (condition === true) visit(node.whenTrue, shadowed);
      if (condition === false) visit(node.whenFalse, shadowed);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(
        node.operatorToken.kind
      )
    ) {
      visit(node.left, shadowed);
      const condition = readCaseStaticBoolean(node.left);
      if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && condition === true) {
        visit(node.right, shadowed);
      }
      if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken && condition === false) {
        visit(node.right, shadowed);
      }
      return;
    }
    if (ts.isTryStatement(node)) {
      visit(node.tryBlock, shadowed);
      if (node.finallyBlock) visit(node.finallyBlock, shadowed);
      return;
    }
    if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isSwitchStatement(node)
    ) {
      return;
    }
    if (ts.isCallExpression(node)) {
      const mode = readCaseRegistrationMode(node.expression, shadowed);
      const title = node.arguments[0];
      if (mode && title && ts.isStringLiteralLike(title)) {
        registrations.push({ title: title.text, mode });
        return;
      }
      if (isSynchronousCaseSuite(node.expression, shadowed)) {
        for (const argument of node.arguments) {
          if (ts.isFunctionExpression(argument) || ts.isArrowFunction(argument)) {
            visitFunction(argument, shadowed);
          }
        }
        return;
      }
      const callee = unwrapCaseExpression(node.expression);
      if (ts.isFunctionExpression(callee) || ts.isArrowFunction(callee)) {
        visitFunction(callee, shadowed);
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, shadowed));
  };
  visit(sourceFile, new Set());
  return registrations;
}

function isDeferredCaseFunction(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function isSynchronousCaseSuite(
  expression: ts.LeftHandSideExpression,
  shadowed: Set<string>
): boolean {
  if (ts.isIdentifier(expression)) {
    return !shadowed.has(expression.text) && ['describe', 'suite'].includes(expression.text);
  }
  if (!ts.isPropertyAccessExpression(expression)) return false;
  if (
    expression.name.text === 'describe' &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'test' &&
    !shadowed.has('test')
  ) {
    return true;
  }
  if (['concurrent', 'sequential'].includes(expression.name.text)) {
    return isSynchronousCaseSuite(expression.expression, shadowed);
  }
  return false;
}

function readCaseStaticBoolean(expression: ts.Expression): boolean | undefined {
  const value = readCaseStaticPrimitive(expression);
  return value === CASE_STATIC_UNKNOWN ? undefined : Boolean(value);
}

const CASE_STATIC_UNKNOWN = Symbol('case-static-unknown');

function readCaseStaticPrimitive(
  expression: ts.Expression
): string | number | boolean | null | undefined | typeof CASE_STATIC_UNKNOWN {
  const node = unwrapCaseExpression(expression);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isVoidExpression(node)) return undefined;
  if (ts.isPrefixUnaryExpression(node)) {
    const operand = readCaseStaticPrimitive(node.operand);
    if (operand === CASE_STATIC_UNKNOWN) return CASE_STATIC_UNKNOWN;
    if (node.operator === ts.SyntaxKind.ExclamationToken) return !operand;
    if (node.operator === ts.SyntaxKind.PlusToken && typeof operand === 'number') return +operand;
    if (node.operator === ts.SyntaxKind.MinusToken && typeof operand === 'number') return -operand;
    return CASE_STATIC_UNKNOWN;
  }
  if (ts.isBinaryExpression(node)) {
    const left = readCaseStaticPrimitive(node.left);
    const right = readCaseStaticPrimitive(node.right);
    if (left === CASE_STATIC_UNKNOWN || right === CASE_STATIC_UNKNOWN) return CASE_STATIC_UNKNOWN;
    if (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) return left === right;
    if (node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
      return left !== right;
    }
  }
  return CASE_STATIC_UNKNOWN;
}

function readCaseRegistrationMode(
  expression: ts.LeftHandSideExpression,
  shadowed: Set<string>
): string | undefined {
  if (
    ts.isIdentifier(expression) &&
    ['it', 'test'].includes(expression.text) &&
    !shadowed.has(expression.text)
  ) {
    return 'run';
  }
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    ['it', 'test'].includes(expression.expression.text) &&
    !shadowed.has(expression.expression.text) &&
    ['concurrent', 'fails', 'fixme', 'only', 'sequential', 'skip', 'todo'].includes(
      expression.name.text
    )
  ) {
    return expression.name.text;
  }
  return undefined;
}

function collectDirectCaseScopeBindings(
  statements: ts.NodeArray<ts.Statement>,
  target: Set<string>
): void {
  for (const statement of statements) {
    if (ts.isImportDeclaration(statement)) continue;
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name) target.add(statement.name.text);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      collectCaseBindingNames(declaration.name, target);
    }
  }
}

function collectCaseBindingNames(name: ts.BindingName, target: Set<string>): void {
  if (ts.isIdentifier(name)) {
    target.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) collectCaseBindingNames(element.name, target);
  }
}

function unwrapCaseExpression<T extends ts.Expression>(expression: T): ts.Expression {
  let current: ts.Expression = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isDefinitelyAbruptCaseStatement(statement: ts.Statement): boolean {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) {
    return statement.statements.some(isDefinitelyAbruptCaseStatement);
  }
  if (ts.isIfStatement(statement)) {
    const condition = readCaseStaticBoolean(statement.expression);
    if (condition === true) return isDefinitelyAbruptCaseStatement(statement.thenStatement);
    if (condition === false) {
      return Boolean(
        statement.elseStatement && isDefinitelyAbruptCaseStatement(statement.elseStatement)
      );
    }
    return Boolean(
      statement.elseStatement &&
      isDefinitelyAbruptCaseStatement(statement.thenStatement) &&
      isDefinitelyAbruptCaseStatement(statement.elseStatement)
    );
  }
  return false;
}
