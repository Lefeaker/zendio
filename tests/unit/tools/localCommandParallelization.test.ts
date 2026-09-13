import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { z } from 'zod';
import {
  BROWSER_NPM_SCRIPTS,
  COMMAND_LIMITS,
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
  it.each(['linux', 'darwin'])('owns the locale of every browser entrypoint on %s', (platform) => {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    if (!descriptor) throw new Error('Missing platform descriptor');
    const environment = {
      HOME: process.env.HOME ?? '/tmp',
      LANG: 'caller-locale',
      LC_ALL: 'caller-locale'
    };
    Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
    try {
      const browserLocale = platform === 'linux' ? 'C.UTF-8' : 'C';
      const direct = resolveCommandProfile('playwright-v1', ['test'], { environment });
      expect(direct.env).toMatchObject({ LANG: browserLocale, LC_ALL: browserLocale, TZ: 'UTC' });
      for (const script of BROWSER_NPM_SCRIPTS) {
        const browser = resolveCommandProfile('npm-script-browser-v1', [script], { environment });
        expect(browser.argv.slice(-2)).toEqual(['run', script]);
        expect(browser.env, script).toMatchObject({
          LANG: browserLocale,
          LC_ALL: browserLocale,
          TZ: 'UTC'
        });
      }
      const tooling = resolveCommandProfile('vitest-v1', ['run'], { environment });
      expect(tooling.env).toMatchObject({ LANG: 'C', LC_ALL: 'C', TZ: 'UTC' });
      expect(environment.LANG).toBe('caller-locale');
      expect(environment.LC_ALL).toBe('caller-locale');
    } finally {
      Object.defineProperty(process, 'platform', descriptor);
    }
  });

  it('gives the full lint warning scan the same bounded class as lint', () => {
    const environment = { HOME: process.env.HOME ?? '/tmp', TMPDIR: '/tmp' };
    const guard = resolveCommandProfile('npm-script-standard-v1', ['lint:warnings-guard'], {
      environment
    });
    const lint = resolveCommandProfile('npm-script-standard-v1', ['lint'], { environment });

    expect(guard.limits).toEqual(COMMAND_LIMITS.standard);
    expect(guard.limits).toEqual(lint.limits);
    expect(guard.argv.slice(-2)).toEqual(['run', 'lint:warnings-guard']);
    expect(() =>
      resolveCommandProfile('npm-script-quick-v1', ['lint:warnings-guard'], { environment })
    ).toThrow();
  });

  it('keeps full production build routes fail-closed with one in-process quality owner', async () => {
    const { buildQualityCommandEnvironment } =
      await import('../../../scripts/utils/buildQualityCommandEnvironment.mjs');
    const scripts = readPackageScripts();
    const buildScript = readFileSync(resolve('scripts/build.mjs'), 'utf8');
    const fullProductionRoutes = {
      build: 'node scripts/build.mjs --mode=prod',
      'build:firefox': 'node scripts/build.mjs --mode=prod --firefox',
      'build:prod:ga': 'node --env-file=.env.production.local scripts/build.mjs --mode=prod',
      'build:firefox:prod:ga':
        'node --env-file=.env.production.local scripts/build.mjs --mode=prod --firefox',
      'build:firefox:prod:ga:ci': 'node scripts/build.mjs --mode=prod --firefox'
    };
    const intentionalSkipCheckRoutes = {
      'build:fast': 'node scripts/build.mjs --mode=prod --skip-checks',
      'build:dev': 'node scripts/build.mjs --skip-checks',
      'build:firefox:fast': 'node scripts/build.mjs --mode=prod --skip-checks --firefox',
      'build:firefox:dev': 'node scripts/build.mjs --skip-checks --firefox',
      'build:prod:ga:fast':
        'node --env-file=.env.production.local scripts/build.mjs --mode=prod --skip-checks',
      'build:firefox:prod:ga:fast':
        'node --env-file=.env.production.local scripts/build.mjs --mode=prod --skip-checks --firefox',
      dev: 'node scripts/build.mjs --watch --skip-checks',
      'dev:firefox': 'node scripts/build.mjs --watch --skip-checks --firefox'
    };
    const gaBuildEnvironmentKeys = [
      'ZENDIO_GA_MEASUREMENT_ID',
      'ZENDIO_GA_TRANSPORT_MODE',
      'ZENDIO_GA_PROXY_ENDPOINT',
      'AIIINOB_GA_MEASUREMENT_ID',
      'AIIINOB_GA_TRANSPORT_MODE',
      'AIIINOB_GA_PROXY_ENDPOINT'
    ];
    const sourceProcessEnvironment = Object.freeze({
      HOME: process.env.HOME ?? '/tmp',
      TMPDIR: '/tmp/c06-build-quality-unit-test',
      ZENDIO_GA_MEASUREMENT_ID: 'G-CURRENT-UNIT-TEST',
      ZENDIO_GA_TRANSPORT_MODE: 'current-unit-test-transport',
      ZENDIO_GA_PROXY_ENDPOINT: 'https://unit-test.invalid/current-ga-proxy',
      AIIINOB_GA_MEASUREMENT_ID: 'G-LEGACY-UNIT-TEST',
      AIIINOB_GA_TRANSPORT_MODE: 'legacy-unit-test-transport',
      AIIINOB_GA_PROXY_ENDPOINT: 'https://unit-test.invalid/legacy-ga-proxy'
    });
    const sourceProcessEnvironmentSnapshot = { ...sourceProcessEnvironment };
    const qualityChildEnvironment = buildQualityCommandEnvironment(sourceProcessEnvironment);

    for (const key of gaBuildEnvironmentKeys) {
      expect(qualityChildEnvironment).not.toHaveProperty(key);
    }
    expect(qualityChildEnvironment).toMatchObject({
      HOME: sourceProcessEnvironment.HOME,
      TMPDIR: sourceProcessEnvironment.TMPDIR,
      LANG: 'C',
      LC_ALL: 'C',
      TZ: 'UTC'
    });
    expect(qualityChildEnvironment.PATH).toBeTruthy();
    expect(sourceProcessEnvironment).toEqual(sourceProcessEnvironmentSnapshot);
    expect(() =>
      buildQualityCommandEnvironment({
        ...sourceProcessEnvironment,
        HTTPS_PROXY: 'https://unit-test.invalid/unrelated-proxy'
      })
    ).toThrow('ENVIRONMENT_FORBIDDEN');

    expect(
      Object.fromEntries(Object.keys(fullProductionRoutes).map((name) => [name, scripts[name]]))
    ).toEqual(fullProductionRoutes);
    for (const route of Object.values(fullProductionRoutes)) {
      expect(route).not.toContain('npm run quality');
      expect(route).not.toContain('--skip-checks');
    }
    expect(
      Object.fromEntries(
        Object.keys(intentionalSkipCheckRoutes).map((name) => [name, scripts[name]])
      )
    ).toEqual(intentionalSkipCheckRoutes);
    for (const route of Object.values(intentionalSkipCheckRoutes)) {
      expect(route).toContain('--skip-checks');
    }

    expect(scripts['build:chrome:isolated']).toBe(
      'npm run build:fast -- --outdir build/dist-chrome'
    );
    expect(scripts['build:firefox:isolated']).toBe(
      'npm run build:firefox:fast -- --outdir build/dist-firefox'
    );
    const edgeRoutes = {
      'build:edge': 'node scripts/build.mjs --mode=prod --outdir build/dist-edge',
      'build:edge:prod:ga':
        'node --env-file=.env.production.local scripts/setup-error-analytics.js --require-env --require-zendio-env --require-proxy-transport && node --env-file=.env.production.local scripts/build.mjs --mode=prod --outdir build/dist-edge',
      'build:edge:fast':
        'node scripts/build.mjs --mode=prod --skip-checks --outdir build/dist-edge',
      'package:edge': 'npm run build:edge && node scripts/package.mjs --edge',
      'package:edge:ci': 'node scripts/package.mjs --edge'
    };
    for (const [name, command] of Object.entries(edgeRoutes)) {
      expect(scripts[name]).toBe(command);
      expect(resolveCommandProfile('npm-script-build-v1', [name]).argv).toContain(name);
    }
    expect(scripts['package:firefox:ci']).toBe('node scripts/package-firefox.mjs');
    expect(scripts['package:firefox:ci']).not.toMatch(/sign|credential/iu);
    expect(scripts['package:firefox:prod:ga:ci']).toBeUndefined();
    expect(scripts['lint:firefox:addons']).toBe(
      'node scripts/package-firefox.mjs --lint-only --dist-dir build/dist-firefox'
    );
    expect(scripts['lint:firefox:addons']).not.toMatch(/npx|web-ext|credential|sign|publish/iu);

    expect(
      Object.fromEntries(
        [
          'package',
          'package:prod:ga',
          'package:firefox',
          'package:firefox:prod:ga',
          'release',
          'release:prod:ga'
        ].map((name) => [name, scripts[name]])
      )
    ).toEqual({
      package: 'npm run build && node scripts/package.mjs',
      'package:prod:ga': 'npm run build:prod:ga && node scripts/package.mjs',
      'package:firefox': 'npm run build:firefox && node scripts/package-firefox.mjs',
      'package:firefox:prod:ga':
        'npm run build:firefox:prod:ga && node scripts/package-firefox.mjs',
      release: 'npm run build && node scripts/create-release.mjs',
      'release:prod:ga': 'npm run build:prod:ga && node scripts/create-release.mjs'
    });
    expect(scripts['package:chrome:isolated']).toBe(
      'npm run build:chrome:isolated && node scripts/package.mjs --dist-dir build/dist-chrome'
    );
    expect(scripts['package:firefox:isolated']).toBe(
      'npm run build:firefox:isolated && node scripts/package-firefox.mjs --dist-dir build/dist-firefox'
    );

    const closedEnvironment =
      'const qualityEnvironment = buildQualityCommandEnvironment(process.env);';
    const qualityInvocation = 'const qualityResult = await runQualityChecks({';
    const failureGuard = 'if (!qualityResult.ok) {';
    const nonzeroFailure = 'process.exitCode = qualityResult.failed[0]?.code || 1;';
    const buildAbort =
      "throw new Error('Production build aborted because quality checks failed.');";
    const distCleanup = 'await rm(distDir, { recursive: true, force: true });';
    expect(buildScript).toContain(closedEnvironment);
    expect(buildScript).toContain(qualityInvocation);
    expect(buildScript).toContain('startBoundedCommand(');
    expect(buildScript.indexOf(closedEnvironment)).toBeLessThan(
      buildScript.indexOf(qualityInvocation)
    );
    expect(buildScript).toContain(failureGuard);
    expect(buildScript).toContain(nonzeroFailure);
    expect(buildScript).toContain(buildAbort);
    expect(buildScript.indexOf(qualityInvocation)).toBeLessThan(buildScript.indexOf(failureGuard));
    expect(buildScript.indexOf(failureGuard)).toBeLessThan(buildScript.indexOf(nonzeroFailure));
    expect(buildScript.indexOf(nonzeroFailure)).toBeLessThan(buildScript.indexOf(buildAbort));
    expect(buildScript.indexOf(buildAbort)).toBeLessThan(buildScript.indexOf(distCleanup));
  });

  it('admits the exact G00 browser and ownership routes through their fixed profiles', () => {
    const scripts = readPackageScripts();
    const stateScript =
      'npm run verify:runtime && node scripts/run-playwright.mjs test tests/e2e/sessionDraftConcurrency.browser.test.ts tests/e2e/sessionLifecycleRecovery.browser.test.ts tests/e2e/optionsCrossContextMutation.browser.test.ts tests/e2e/videoScreenshotCacheMigration.browser.test.ts --project=chromium-desktop';
    const architectureScript =
      'npm run verify:runtime && node scripts/run-playwright.mjs test tests/e2e/uiPrimitiveTokenParity.browser.test.ts tests/e2e/contentIdleCss.browser.test.ts tests/e2e/sessionPanelsIncremental.browser.test.ts tests/e2e/optionsIncrementalRender.browser.test.ts tests/e2e/optionsCaptureControls.browser.test.ts tests/e2e/runtimeSurfaceNavigation.browser.test.ts --project=chromium-desktop';
    const browserScripts = ['test:e2e:browser:state', 'test:e2e:browser:architecture'];
    const ownershipScripts = [
      'audit:test-suite-ownership:report',
      'audit:test-suite-ownership:check'
    ];
    const supplyChainScripts = [
      'audit:github-actions-supply-chain:report',
      'audit:github-actions-supply-chain:check'
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
    expect(STANDARD_NPM_SCRIPTS.filter((name) => supplyChainScripts.includes(name))).toEqual([
      'audit:github-actions-supply-chain:check',
      'audit:github-actions-supply-chain:report'
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
    for (const script of supplyChainScripts) {
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
      'audit-github-actions-supply-chain-check',
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
    expect(taskById.get('lint-warnings-guard')).toMatchObject({
      profile: 'npm-script-standard-v1',
      args: ['lint:warnings-guard']
    });
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
    expect(taskById.get('audit-github-actions-supply-chain-check')).toEqual({
      id: 'audit-github-actions-supply-chain-check',
      name: 'GitHub Actions immutable dependency guard',
      profile: 'npm-script-standard-v1',
      args: ['audit:github-actions-supply-chain:check'],
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
    expect(
      graph.tasks.filter((task) => task.args.includes('audit:github-actions-supply-chain:check'))
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
