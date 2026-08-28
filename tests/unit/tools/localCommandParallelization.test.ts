import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { z } from 'zod';
import {
  BROWSER_NPM_SCRIPTS,
  STANDARD_NPM_SCRIPTS,
  resolveCommandProfile
} from '../../../scripts/config/commandBoundaryProfiles.mjs';

const PackageJsonSchema = z.object({
  scripts: z.record(z.string())
});

const QualityTaskSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    profile: z.string(),
    args: z.array(z.string()),
    dependsOn: z.array(z.string())
  })
  .strict();

const QualityTaskGraphSchema = z.object({
  tasks: z.array(QualityTaskSchema)
});

const ShardCoverageSchema = z.object({
  missing: z.array(z.string()),
  duplicates: z.array(
    z.object({
      file: z.string(),
      owners: z.array(z.string())
    })
  )
});

const ShardExpansionSchema = z.array(
  z.object({
    id: z.string(),
    files: z.array(z.string())
  })
);

function readPackageScripts(): Record<string, string> {
  return PackageJsonSchema.parse(JSON.parse(readFileSync(resolve('package.json'), 'utf8'))).scripts;
}

function runNodeJson<T>(code: string, schema: z.ZodType<T>): T {
  return runNodeJsonWithArgs(code, [], schema);
}

function runNodeJsonWithArgs<T>(code: string, args: string[], schema: z.ZodType<T>): T {
  const stdout = execFileSync('node', ['-e', code, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  return schema.parse(JSON.parse(stdout));
}

function readQualityTaskGraph(): z.infer<typeof QualityTaskGraphSchema> {
  return runNodeJson(
    "import('./scripts/quality-check.mjs').then(({ createQualityTaskGraph }) => process.stdout.write(JSON.stringify(createQualityTaskGraph())));",
    QualityTaskGraphSchema
  );
}

function collectUnitShardCoverage(files: string[]): z.infer<typeof ShardCoverageSchema> {
  return runNodeJsonWithArgs(
    "import('./scripts/utils/testShards.mjs').then(({ createUnitTestShards, collectShardCoverage }) => process.stdout.write(JSON.stringify(collectShardCoverage(createUnitTestShards(), JSON.parse(process.argv[1])))));",
    [JSON.stringify(files)],
    ShardCoverageSchema
  );
}

function collectE2eShardCoverage(files: string[]): z.infer<typeof ShardCoverageSchema> {
  return runNodeJsonWithArgs(
    "import('./scripts/utils/testShards.mjs').then(({ createE2eTestShards, collectShardCoverage }) => process.stdout.write(JSON.stringify(collectShardCoverage(createE2eTestShards(), JSON.parse(process.argv[1])))));",
    [JSON.stringify(files)],
    ShardCoverageSchema
  );
}

function readShardExpansions(suite: 'unit' | 'e2e'): z.infer<typeof ShardExpansionSchema> {
  const factory = suite === 'unit' ? 'createUnitTestShards' : 'createE2eTestShards';
  return runNodeJson(
    `import('./scripts/utils/testShards.mjs').then((module) => process.stdout.write(JSON.stringify(module.${factory}().map((shard) => ({ id: shard.id, files: module.expandShardPatterns(shard.patterns) })))));`,
    ShardExpansionSchema
  );
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const entries = readdirSync(root).sort();
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(root, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      files.push(...walkFiles(absolutePath));
    } else {
      files.push(relative(process.cwd(), absolutePath).replaceAll('\\', '/'));
    }
  }
  return files;
}

describe('local command parallelization contract', () => {
  it('keeps production build scripts from running quality twice', () => {
    const scripts = readPackageScripts();

    expect(scripts.build).toBe(
      'npm run quality && node scripts/build.mjs --mode=prod --skip-checks'
    );
    expect(scripts['build:firefox']).toBe(
      'npm run quality && node scripts/build.mjs --mode=prod --skip-checks --firefox'
    );
    expect(scripts.package).toBe('npm run build && node scripts/package.mjs');
    expect(scripts['package:chrome:isolated']).toBe(
      'npm run build:chrome:isolated && node scripts/package.mjs --dist-dir build/dist-chrome'
    );
    expect(scripts['package:firefox:isolated']).toBe(
      'npm run build:firefox:isolated && node scripts/package-firefox.mjs --dist-dir build/dist-firefox'
    );
  });

  it('admits the exact G00 browser and ownership routes through their fixed profiles', () => {
    const scripts = readPackageScripts();
    const stateScript =
      'npm run verify:runtime && node scripts/run-playwright.mjs test tests/e2e/sessionDraftConcurrency.browser.test.ts tests/e2e/optionsCrossContextMutation.browser.test.ts tests/e2e/videoScreenshotCacheMigration.browser.test.ts --project=chromium-desktop';
    const architectureScript =
      'npm run verify:runtime && node scripts/run-playwright.mjs test tests/e2e/uiPrimitiveTokenParity.browser.test.ts tests/e2e/contentIdleCss.browser.test.ts tests/e2e/sessionPanelsIncremental.browser.test.ts tests/e2e/optionsIncrementalRender.browser.test.ts --project=chromium-desktop';
    const browserScripts = ['test:e2e:browser:state', 'test:e2e:browser:architecture'];
    const ownershipScripts = [
      'audit:test-suite-ownership:report',
      'audit:test-suite-ownership:check'
    ];
    const environment = { HOME: process.env.HOME ?? '/tmp', TMPDIR: '/tmp' };

    expect(scripts['test:e2e:browser:state']).toBe(stateScript);
    expect(scripts['test:e2e:browser:architecture']).toBe(architectureScript);
    expect(BROWSER_NPM_SCRIPTS.filter((name) => browserScripts.includes(name))).toEqual([
      'test:e2e:browser:architecture',
      'test:e2e:browser:state'
    ]);
    expect(STANDARD_NPM_SCRIPTS.filter((name) => ownershipScripts.includes(name))).toEqual([
      'audit:test-suite-ownership:check',
      'audit:test-suite-ownership:report'
    ]);
    for (const script of browserScripts) {
      expect(() =>
        resolveCommandProfile('npm-script-browser-v1', [script], { environment })
      ).not.toThrow();
    }
    for (const script of ownershipScripts) {
      expect(() =>
        resolveCommandProfile('npm-script-standard-v1', [script], { environment })
      ).not.toThrow();
    }
  });

  it('defines a complete dependency-aware quality task graph', () => {
    const graph = readQualityTaskGraph();
    const ids = graph.tasks.map((task) => task.id).sort();

    expect(ids).toEqual([
      'audit-active-documents-check',
      'audit-build-graph-report',
      'audit-chrome-webstore-release-check',
      'audit-ci-workflow-check',
      'audit-compatibility-duplicates-check',
      'audit-components-report',
      'audit-content-css-packs-check',
      'audit-deps-report',
      'audit-design-system-doc-report',
      'audit-design-tokens-check',
      'audit-ga-client-secret',
      'audit-ga-docs',
      'audit-ga-legacy-api',
      'audit-ga-proxy-contract',
      'audit-ga-release-surface',
      'audit-hardcoded-user-copy-check',
      'audit-imports-report',
      'audit-interaction-contract-report',
      'audit-locales-report',
      'audit-non-production-source-check',
      'audit-options-mainline-report',
      'audit-performance-report',
      'audit-platform-services-report',
      'audit-production-shape-report',
      'audit-release-surface-report',
      'audit-retired-code-report',
      'audit-test-suite-ownership-check',
      'audit-ui-architecture-report',
      'audit-ui-production-ownership-check',
      'build-fast',
      'i18n-catalog-check',
      'i18n-lint',
      'lint-css',
      'lint-hardcoded',
      'lint-type-any-ratchet',
      'lint-warnings-guard',
      'release-metadata-check',
      'report-options-legacy',
      'typecheck-app',
      'typecheck-strict',
      'typecheck-tests',
      'uncatalogued-user-copy-check',
      'validate-i18n-budgets',
      'verify-runtime'
    ]);

    const taskById = new Map(graph.tasks.map((task) => [task.id, task]));
    expect(taskById.get('audit-hardcoded-user-copy-check')?.dependsOn).toEqual([
      'audit-build-graph-report'
    ]);
    expect(taskById.get('uncatalogued-user-copy-check')?.dependsOn).toEqual([
      'audit-hardcoded-user-copy-check'
    ]);
    expect(taskById.get('audit-non-production-source-check')?.dependsOn).toEqual([
      'audit-build-graph-report'
    ]);
    expect(taskById.get('audit-release-surface-report')?.dependsOn).toEqual(['build-fast']);
    expect(taskById.get('audit-ga-client-secret')?.dependsOn).toEqual(['build-fast']);
    expect(taskById.get('audit-ga-release-surface')?.dependsOn).toEqual(['build-fast']);
    expect(taskById.get('lint-css')).toEqual({
      id: 'lint-css',
      name: 'Options/onboarding/UI CSS 命名校验',
      profile: 'stylelint-v1',
      args: ['src/options/**/*.css', 'src/onboarding/**/*.css', 'src/ui/**/*.css'],
      dependsOn: ['verify-runtime']
    });
    expect(taskById.get('audit-ui-production-ownership-check')).toEqual({
      id: 'audit-ui-production-ownership-check',
      name: 'UI production ownership 守卫',
      profile: 'npm-script-standard-v1',
      args: ['audit:ui-production-ownership:check'],
      dependsOn: ['verify-runtime']
    });
    expect(taskById.get('audit-content-css-packs-check')).toEqual({
      id: 'audit-content-css-packs-check',
      name: 'Content CSS packs 守卫',
      profile: 'npm-script-standard-v1',
      args: ['audit:content-css-packs:check'],
      dependsOn: ['build-fast']
    });
    expect(taskById.get('audit-design-tokens-check')).toEqual({
      id: 'audit-design-tokens-check',
      name: 'Design token alignment 守卫',
      profile: 'npm-script-standard-v1',
      args: ['audit:design-tokens:check'],
      dependsOn: ['verify-runtime']
    });
    expect(taskById.get('audit-performance-report')).toEqual({
      id: 'audit-performance-report',
      name: 'Performance hotspot budget 守卫',
      profile: 'npm-script-standard-v1',
      args: ['audit:performance:report'],
      dependsOn: ['verify-runtime']
    });
    expect(taskById.get('audit-active-documents-check')).toEqual({
      id: 'audit-active-documents-check',
      name: 'Active document contract 守卫',
      profile: 'npm-script-standard-v1',
      args: ['audit:active-documents:check'],
      dependsOn: ['verify-runtime']
    });
    expect(taskById.get('audit-deps-report')).toMatchObject({
      profile: 'dependency-cruiser-v1',
      args: []
    });
    expect(taskById.get('audit-test-suite-ownership-check')).toEqual({
      id: 'audit-test-suite-ownership-check',
      name: 'Test suite canonical owner guard',
      profile: 'npm-script-standard-v1',
      args: ['audit:test-suite-ownership:check'],
      dependsOn: ['verify-runtime']
    });
    expect(
      graph.tasks.flatMap((task) => task.args).filter((argument) => argument.includes('browser:'))
    ).toEqual([]);
    expect(
      graph.tasks.filter((task) => task.args.includes('audit:performance:report'))
    ).toHaveLength(1);
    expect(
      graph.tasks.filter((task) => task.args.includes('audit:active-documents:check'))
    ).toHaveLength(1);
  });

  it('adds process-level unit and e2e shard scripts without changing canonical coverage', () => {
    const scripts = readPackageScripts();
    const expectedScripts = [
      'test:unit:shards',
      'test:unit:shard:background',
      'test:unit:shard:content',
      'test:unit:shard:options',
      'test:unit:shard:shared',
      'test:unit:shard:tools',
      'test:e2e:shards',
      'test:e2e:shard:ai-chat',
      'test:e2e:shard:content',
      'test:e2e:shard:options',
      'test:e2e:shard:video',
      'test:e2e:browser:parallel',
      'visual:test:parallel'
    ];

    for (const script of expectedScripts) {
      expect(scripts[script], `${script} should exist`).toBeTruthy();
    }

    expect(scripts['test:coverage']).toBe(
      'node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts --coverage'
    );
  });

  it('covers every current unit test file with exactly one shard owner', () => {
    const unitTests = walkFiles(resolve('tests/unit')).filter((file) => file.endsWith('.test.ts'));
    const coverage = collectUnitShardCoverage(unitTests);

    expect(coverage.missing).toEqual([]);
    expect(coverage.duplicates).toEqual([]);
  });

  it('covers every current non-browser e2e test file with exactly one shard owner', () => {
    const e2eTests = walkFiles(resolve('tests/e2e')).filter(
      (file) =>
        file.endsWith('.test.ts') &&
        file !== 'tests/e2e/readerPanelFlow.test.ts' &&
        file !== 'tests/e2e/videoPanelFlow.test.ts' &&
        !file.endsWith('.browser.test.ts')
    );
    const coverage = collectE2eShardCoverage(e2eTests);

    expect(coverage.missing).toEqual([]);
    expect(coverage.duplicates).toEqual([]);
  });

  it('expands every process-level Vitest shard to concrete test files', () => {
    for (const expansion of [...readShardExpansions('unit'), ...readShardExpansions('e2e')]) {
      expect(
        expansion.files.length,
        `${expansion.id} should match at least one file`
      ).toBeGreaterThan(0);
    }
  });

  it('supports isolated build and Playwright dist directories before local browser parallelization', () => {
    const buildScript = readFileSync(resolve('scripts/build.mjs'), 'utf8');
    const packageScript = readFileSync(resolve('scripts/package.mjs'), 'utf8');
    const firefoxPackageScript = readFileSync(resolve('scripts/package-firefox.mjs'), 'utf8');
    const playwrightServer = readFileSync(
      resolve('scripts/start-playwright-web-server.mjs'),
      'utf8'
    );
    const browserShardRunner = readFileSync(resolve('scripts/run-browser-test-shards.mjs'), 'utf8');
    const visualPlaywrightConfig = readFileSync(resolve('playwright.config.ts'), 'utf8');
    const readerPlaywrightConfig = readFileSync(resolve('playwright.reader.config.ts'), 'utf8');

    expect(buildScript).toContain('--outdir');
    expect(buildScript).toContain('BUILD_DIST_DIR');
    expect(packageScript).toContain('--dist-dir');
    expect(firefoxPackageScript).toContain('--dist-dir');
    expect(playwrightServer).toContain('PLAYWRIGHT_DIST_DIR');
    expect(playwrightServer).toContain('PLAYWRIGHT_SKIP_WEB_SERVER_BUILD');
    expect(playwrightServer).toContain('acquirePlaywrightBuildLease');
    expect(browserShardRunner).toContain('PLAYWRIGHT_OUTPUT_DIR');
    expect(browserShardRunner).toContain('build:bundled-dist');
    expect(browserShardRunner).toContain('acquirePlaywrightBuildLease');
    expect(browserShardRunner).not.toContain('BROWSER_TEST_CONCURRENCY');
    expect(browserShardRunner).not.toContain("from 'node:child_process'");
    expect(visualPlaywrightConfig).toContain('PLAYWRIGHT_OUTPUT_DIR');
    expect(visualPlaywrightConfig).not.toContain("channel: 'chrome'");
    expect(readerPlaywrightConfig).toContain('PLAYWRIGHT_OUTPUT_DIR');
    expect(readerPlaywrightConfig).toContain("...devices['Desktop Chrome']");
    expect(readerPlaywrightConfig).not.toContain("channel: 'chrome'");
    expect(readerPlaywrightConfig).not.toContain('executablePath');
    for (const file of ['tests/e2e/readerPanelFlow.test.ts', 'tests/e2e/videoPanelFlow.test.ts']) {
      const source = readFileSync(resolve(file), 'utf8');
      expect(source).toContain("'--headless=new'");
      expect(source).toContain('headless: false');
      expect(source).not.toContain('channel:');
      expect(source).not.toContain('executablePath');
    }
  });
});
