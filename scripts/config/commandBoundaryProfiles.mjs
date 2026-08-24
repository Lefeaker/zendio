import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deepFreeze, sha256Buffer } from '../../tools/npm-audit-regression/canonical-json.mjs';
import { detectNpmCommand } from '../../tools/npm-audit-regression/runtime-discovery.mjs';

export const COMMAND_BOUNDARY_VERSION = 'command-boundary-v1';
export const COMMAND_REQUEST_FILE = 'command-request.json';
export const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const COMMAND_LIMITS = deepFreeze({
  quick: {
    activeMs: 60_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 8 << 20,
    stderrBytes: 8 << 20,
    fd4Bytes: 1 << 20,
    fd5Bytes: 1 << 20
  },
  standard: {
    activeMs: 180_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 16 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  build: {
    activeMs: 360_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 32 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  vitest: {
    activeMs: 720_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 64 << 20,
    stderrBytes: 32 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  browser: {
    activeMs: 1_380_000,
    termMs: 35_000,
    killMs: 15_000,
    stdoutBytes: 64 << 20,
    stderrBytes: 32 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  fixture: {
    activeMs: 750,
    termMs: 100,
    killMs: 250,
    stdoutBytes: 64 << 10,
    stderrBytes: 64 << 10,
    fd4Bytes: 64 << 10,
    fd5Bytes: 64 << 10
  }
});

export const TASK_GRAPH_POLICIES = deepFreeze({
  'quality-v1': { concurrency: 3, fullMs: 930_000, terminalReserveMs: 10_000 },
  'preflight-v1': { concurrency: 1, fullMs: 640_000, terminalReserveMs: 10_000 },
  'vitest-shards-v1': { concurrency: 3, fullMs: 1_510_000, terminalReserveMs: 10_000 },
  'browser-shards-v1': { concurrency: 2, fullMs: 2_750_000, terminalReserveMs: 50_000 }
});

export const DIRECT_ROOT_COORDINATOR_GRAMMARS = deepFreeze([
  { path: 'scripts/quality-check.mjs', grammar: 'none' },
  { path: 'scripts/run-browser-test-shards.mjs', grammar: 'browser-shards-v1' },
  { path: 'scripts/run-test-shards.mjs', grammar: 'test-shards-v1' },
  { path: 'scripts/verify-preflight.mjs', grammar: 'none' }
]);

const LOCKED_PACKAGES = deepFreeze({
  vitest: {
    rootSpec: '4.1.9',
    version: '4.1.9',
    binName: 'vitest',
    packageSha256: 'e12762a5b629bea6cbb2b0540a8a15c50f3098bb3193d3e319293b58b64c4ed9',
    binSha256: '39db22f579acf5639bbb17a261408debbde03f4692c0c439e77e7f13aeba74d6'
  },
  prettier: {
    rootSpec: '^3.8.3',
    version: '3.8.3',
    binName: 'prettier',
    packageSha256: '223e6230f29d5537f6448db55339355c08c2125afe92977a1492a569cbfd413d',
    binSha256: 'ac5523cd57e7e9d8eac71caef7e022a8a8489bcdc19ca8a778b7e728ec103b93'
  },
  stylelint: {
    rootSpec: '^16.26.1',
    version: '16.26.1',
    binName: 'stylelint',
    packageSha256: 'eaeb825454198489518207184a9928212e54e3147a91a7e6522c16942601773a',
    binSha256: 'fff129a9fdd70eea1aaa609c42277622bf5bbbac228e54d22858d3324eada025'
  },
  'lint-staged': {
    rootSpec: '^16.4.0',
    version: '16.4.0',
    binName: 'lint-staged',
    packageSha256: '340e88434a282cd38350f84fe589505afbc6c4a1472c0c8c1f878533b13ead87',
    binSha256: 'cccadd752dcc66d8e07160d03ecb71469ed3913bbab00917f17ee0cdede57cb2'
  },
  husky: {
    rootSpec: '^9.1.7',
    version: '9.1.7',
    binName: 'husky',
    packageSha256: '8f3966c3b43a59e4b8e13fdfe8eb00a7ab66dfeb235515f7c19c8e0f5ca530e1',
    binSha256: 'c6965589a83667d43c4dc22f90dccfa91c133f8ed23629b896ce326f0a6c5cc8'
  },
  playwright: { rootSpec: '^1.60.0', version: '1.60.0', binName: 'playwright' }
});

export const QUICK_NPM_SCRIPTS = deepFreeze([
  'audit:ci-workflow:check',
  'lint:type-any',
  'lint:type-any:ratchet',
  'lint:warnings-guard',
  'lint:warnings-report',
  'release:metadata:check',
  'release:metadata:sync',
  'report:layout',
  'report:options-legacy',
  'report:release-summary',
  'validate:i18n:budgets',
  'verify:runtime'
]);

export const STANDARD_NPM_SCRIPTS = deepFreeze([
  'analytics:validate:prod',
  'analytics:validate:prod:required',
  'audit:build-graph:report',
  'audit:build:report',
  'audit:chrome-webstore-release:check',
  'audit:compatibility-duplicates:check',
  'audit:components:report',
  'audit:design-system-doc:report',
  'audit:design-tokens:report',
  'audit:ga:client-secret',
  'audit:ga:docs',
  'audit:ga:legacy-api',
  'audit:ga:proxy-contract',
  'audit:ga:release-surface',
  'audit:i18n-uncatalogued-user-copy:check',
  'audit:imports:check',
  'audit:imports:report',
  'audit:interaction-contract:report',
  'audit:locales:report',
  'audit:non-production-source:check',
  'audit:non-production-source:report',
  'audit:options-mainline:report',
  'audit:performance:report',
  'audit:platform-boundary:report',
  'audit:platform-services:report',
  'audit:production-build-graph:report',
  'audit:production-shape:report',
  'audit:release-surface:report',
  'audit:repository-composition:report',
  'audit:retired-code:report',
  'audit:ui-architecture:report',
  'i18n:catalog:check',
  'i18n:generate',
  'i18n:lint',
  'layout:report',
  'lint',
  'lint:hardcoded',
  'manifest:generate',
  'typecheck:app',
  'typecheck:strict',
  'typecheck:tests'
]);

export const BUILD_NPM_SCRIPTS = deepFreeze(['build:dev', 'build:fast', 'package:ci']);
export const BROWSER_NPM_SCRIPTS = deepFreeze([
  'test:e2e:browser',
  'test:e2e:browser:firefox',
  'test:e2e:browser:local-vault',
  'test:e2e:browser:reader-panel',
  'test:e2e:browser:smoke',
  'test:e2e:browser:video',
  'test:i18n:visual',
  'visual:record',
  'visual:stitch',
  'visual:test'
]);

export const PROFILE_IDS = deepFreeze([
  'coverage-summary-v1',
  'dependency-cruiser-v1',
  'fixture-v1',
  'generated-artifact-check-v1',
  'husky-provision-v1',
  'lint-staged-hook-v1',
  'lint-staged-prepare-v1',
  'npm-ci-v1',
  'npm-script-browser-v1',
  'npm-script-build-v1',
  'npm-script-quick-v1',
  'npm-script-standard-v1',
  'node-script-standard-v1',
  'playwright-install-v1',
  'playwright-v1',
  'prettier-v1',
  'stitch-secondary-v1',
  'stylelint-v1',
  'vitest-v1'
]);

const PROFILE_ID_SET = new Set(PROFILE_IDS);
const UNIT_SHARDS = new Set(['background', 'content', 'options', 'shared', 'tools']);
const E2E_SHARDS = new Set(['ai-chat', 'content', 'options', 'video']);

export class CommandBoundaryInvocationValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CommandBoundaryInvocationValidationError';
    this.code = code;
  }
}

function invalid(code) {
  throw new CommandBoundaryInvocationValidationError(code);
}

function boundedToken(value, { path = false, glob = false } = {}) {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value) > 4096)
    invalid('ARGUMENT_INVALID');
  if (/[\0-\x1f\x7f]/u.test(value) || value.startsWith('@')) invalid('ARGUMENT_INVALID');
  if (path) {
    const normalized = value.replaceAll('\\', '/');
    if (isAbsolute(value) || normalized.startsWith('/') || normalized.split('/').includes('..'))
      invalid('PATH_INVALID');
    if (!glob && /[*?{}[\]]/u.test(value)) invalid('PATH_INVALID');
  }
  return value;
}

function validateVitestArgs(args) {
  if (args[0] !== 'run') invalid('VITEST_ARGUMENTS_INVALID');
  let index = 1;
  if (args[index] === '--config') {
    if (!['vitest.unit.config.ts', 'vitest.e2e.config.ts'].includes(args[index + 1]))
      invalid('VITEST_ARGUMENTS_INVALID');
    index += 2;
  }
  if (args[index] === '--coverage') index += 1;
  if (args.length - index > 256) invalid('VITEST_ARGUMENTS_INVALID');
  for (; index < args.length; index += 1) boundedToken(args[index], { path: true, glob: true });
  return args;
}

function validatePrettierArgs(args) {
  if (!['--check', '--write'].includes(args[0]) || args.length < 2 || args.length > 257)
    invalid('PRETTIER_ARGUMENTS_INVALID');
  for (const token of args.slice(1)) boundedToken(token, { path: true, glob: true });
  return args;
}

function validateStylelintArgs(args) {
  if (args[0] === '--print-config') {
    if (args.length !== 2) invalid('STYLELINT_ARGUMENTS_INVALID');
    const item = boundedToken(args[1], { path: true });
    if (!item.startsWith('src/options/') && !item.startsWith('src/ui/'))
      invalid('STYLELINT_ARGUMENTS_INVALID');
    return args;
  }
  if (args.length < 1 || args.length > 256) invalid('STYLELINT_ARGUMENTS_INVALID');
  for (const token of args) boundedToken(token, { path: true, glob: true });
  return args;
}

function validateNpmScriptArgs(args, accepted) {
  const [name, separator, ...forwarded] = args;
  if (!accepted.includes(name)) invalid('NPM_SCRIPT_INVALID');
  if (separator === undefined) return args;
  if (separator !== '--') invalid('NPM_SCRIPT_INVALID');
  if (name === 'lint' && JSON.stringify(forwarded) === JSON.stringify(['--quiet'])) return args;
  if (forwarded.length !== 0) invalid('NPM_SCRIPT_ARGUMENTS_INVALID');
  return args;
}

export function validateProfileArguments(profileId, args) {
  if (!PROFILE_ID_SET.has(profileId) || !Array.isArray(args)) invalid('PROFILE_INVALID');
  if (args.length > 256) invalid('ARGUMENT_COUNT_INVALID');
  for (const item of args) boundedToken(item);
  if (profileId === 'vitest-v1') return validateVitestArgs(args);
  if (profileId === 'prettier-v1') return validatePrettierArgs(args);
  if (profileId === 'stylelint-v1') return validateStylelintArgs(args);
  if (
    [
      'lint-staged-hook-v1',
      'lint-staged-prepare-v1',
      'husky-provision-v1',
      'coverage-summary-v1',
      'dependency-cruiser-v1',
      'npm-ci-v1',
      'stitch-secondary-v1'
    ].includes(profileId)
  ) {
    if (args.length !== 0) invalid('PROFILE_ARGUMENTS_INVALID');
  }
  if (profileId === 'npm-script-quick-v1') return validateNpmScriptArgs(args, QUICK_NPM_SCRIPTS);
  if (profileId === 'npm-script-standard-v1')
    return validateNpmScriptArgs(args, STANDARD_NPM_SCRIPTS);
  if (profileId === 'npm-script-build-v1') return validateNpmScriptArgs(args, BUILD_NPM_SCRIPTS);
  if (profileId === 'npm-script-browser-v1')
    return validateNpmScriptArgs(args, BROWSER_NPM_SCRIPTS);
  if (
    profileId === 'playwright-install-v1' &&
    (args.length !== 1 || !['chromium-with-deps', 'firefox-with-deps'].includes(args[0]))
  )
    invalid('PLAYWRIGHT_INSTALL_ARGUMENTS_INVALID');
  if (profileId === 'playwright-v1') {
    if (args[0] !== 'test') invalid('PLAYWRIGHT_ARGUMENTS_INVALID');
    for (const item of args.slice(1)) {
      if (item.startsWith('--config=') || item.startsWith('--project=')) boundedToken(item);
      else boundedToken(item, { path: true, glob: true });
    }
  }
  if (profileId === 'node-script-standard-v1') {
    if (args.length < 1) invalid('NODE_SCRIPT_ARGUMENTS_INVALID');
    const script = boundedToken(args[0], { path: true });
    if (
      !script.endsWith('.mjs') ||
      (!script.startsWith('scripts/') && !script.startsWith('tools/'))
    )
      invalid('NODE_SCRIPT_ARGUMENTS_INVALID');
  }
  if (
    profileId === 'generated-artifact-check-v1' &&
    (args.length !== 1 || !['locales', 'manifests'].includes(args[0]))
  )
    invalid('GENERATED_ARTIFACT_ARGUMENTS_INVALID');
  if (profileId === 'fixture-v1') {
    const [mode, first, second, extra] = args;
    if (extra !== undefined) invalid('FIXTURE_ARGUMENTS_INVALID');
    if (mode === 'success' && second === undefined) return args;
    if (['descriptors', 'close-extra'].includes(mode) && first === undefined) return args;
    if (mode === 'exit' && /^\d{1,3}$/u.test(first ?? '')) return args;
    if (mode === 'signal' && ['SIGINT', 'SIGTERM'].includes(first)) return args;
    if (
      ['delay', 'ignore-term', 'hold-pipe'].includes(mode) &&
      (first === undefined || /^\d{1,5}$/u.test(first))
    )
      return args;
    if (
      mode === 'overflow' &&
      ['o', 'e', '4', '5'].includes(first) &&
      /^\d{1,7}$/u.test(second ?? '')
    )
      return args;
    invalid('FIXTURE_ARGUMENTS_INVALID');
  }
  return args;
}

export function parseManagedCommandInvocationArgv(argv) {
  if (!Array.isArray(argv) || argv[0] !== 'node') invalid('LAUNCHER_INVALID');
  const launcher = argv[1]?.replaceAll('\\', '/');
  if (launcher === 'scripts/run-bounded-command.mjs') {
    if (argv[2] !== '--profile' || typeof argv[3] !== 'string') invalid('CONTROL_ARGUMENT_INVALID');
    const separatorPresent = argv[4] === '--';
    if (argv.length > 4 && !separatorPresent) invalid('SEPARATOR_INVALID');
    const argumentsList = separatorPresent ? argv.slice(5) : [];
    validateProfileArguments(argv[3], argumentsList);
    return deepFreeze({
      kind: 'profile',
      profileId: argv[3],
      arguments: [...argumentsList],
      separatorPresent
    });
  }
  const row = DIRECT_ROOT_COORDINATOR_GRAMMARS.find((entry) => entry.path === launcher);
  if (!row) invalid('LAUNCHER_INVALID');
  const args = argv.slice(2);
  if (row.grammar === 'none' && args.length !== 0) invalid('COORDINATOR_ARGUMENTS_INVALID');
  if (
    row.grammar === 'browser-shards-v1' &&
    (args.length !== 1 || !['e2e', 'visual'].includes(args[0]))
  )
    invalid('COORDINATOR_ARGUMENTS_INVALID');
  if (row.grammar === 'test-shards-v1') {
    const [suite, shard, extra] = args;
    if (!['unit', 'e2e'].includes(suite) || extra !== undefined)
      invalid('COORDINATOR_ARGUMENTS_INVALID');
    if (shard && !(suite === 'unit' ? UNIT_SHARDS : E2E_SHARDS).has(shard))
      invalid('COORDINATOR_ARGUMENTS_INVALID');
  }
  return deepFreeze({ kind: 'coordinator', coordinatorId: launcher, arguments: [...args] });
}

function contained(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function regularFile(path, root = REPOSITORY_ROOT) {
  const absolute = resolve(root, path);
  const canonical = realpathSync(absolute);
  const stats = lstatSync(absolute);
  if (
    !contained(realpathSync(root), canonical) ||
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.nlink !== 1 ||
    stats.uid !== process.getuid()
  )
    invalid('EXECUTABLE_IDENTITY_INVALID');
  return canonical;
}

function trackedOrStaged(relativePath) {
  try {
    execFileSync('/usr/bin/git', ['ls-files', '--error-unmatch', '--', relativePath], {
      cwd: REPOSITORY_ROOT,
      stdio: 'ignore',
      env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' }
    });
  } catch {
    invalid('SOURCE_NOT_TRACKED');
  }
}

function lintStagedPath() {
  const directory = resolve(REPOSITORY_ROOT, 'node_modules/.bin');
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink() || stats.uid !== process.getuid()) {
    invalid('LINT_STAGED_BIN_DIRECTORY_INVALID');
  }
  return `${dirname(process.execPath)}:${realpathSync(directory)}:/usr/bin:/bin`;
}

function packageProjection() {
  const packageJson = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, 'package.json'), 'utf8'));
  const lockJson = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, 'package-lock.json'), 'utf8'));
  return { packageJson, lockJson };
}

function resolveLockedBin(name) {
  const identity = LOCKED_PACKAGES[name];
  const { packageJson, lockJson } = packageProjection();
  const lockRow = lockJson.packages?.[`node_modules/${name}`];
  const installedPackagePath = resolve(REPOSITORY_ROOT, `node_modules/${name}/package.json`);
  const installedPackageBytes = readFileSync(installedPackagePath);
  const installedPackage = JSON.parse(installedPackageBytes);
  if (
    packageJson.devDependencies?.[name] !== identity.rootSpec ||
    lockJson.packages?.['']?.devDependencies?.[name] !== identity.rootSpec ||
    lockRow?.version !== identity.version ||
    installedPackage.version !== identity.version
  )
    invalid('LOCK_IDENTITY_INVALID');
  const binRelative = (
    typeof installedPackage.bin === 'string'
      ? installedPackage.bin
      : installedPackage.bin?.[identity.binName]
  )?.replace(/^\.\//u, '');
  const lockBinRelative = (
    typeof lockRow.bin === 'string' ? lockRow.bin : lockRow.bin?.[identity.binName]
  )?.replace(/^\.\//u, '');
  if (typeof binRelative !== 'string' || lockBinRelative !== binRelative)
    invalid('BIN_METADATA_INVALID');
  const binPath = regularFile(`node_modules/${name}/${binRelative}`);
  if (identity.packageSha256 && sha256Buffer(installedPackageBytes) !== identity.packageSha256)
    invalid('PACKAGE_DIGEST_INVALID');
  if (identity.binSha256 && sha256Buffer(readFileSync(binPath)) !== identity.binSha256)
    invalid('BIN_DIGEST_INVALID');
  return binPath;
}

const PASS_ENV = new Set([
  'CI',
  'GITHUB_ACTIONS',
  'GITHUB_EVENT_NAME',
  'GITHUB_JOB',
  'GITHUB_REF',
  'GITHUB_RUN_ATTEMPT',
  'GITHUB_RUN_ID',
  'GITHUB_SHA',
  'PLAYWRIGHT_BROWSERS_PATH',
  'PLAYWRIGHT_DIST_DIR',
  'PLAYWRIGHT_HTML_REPORT_DIR',
  'PLAYWRIGHT_OUTPUT_DIR',
  'PLAYWRIGHT_SKIP_WEB_SERVER_BUILD',
  'PLAYWRIGHT_WEB_SERVER_PORT',
  'RUNNER_ARCH',
  'RUNNER_OS',
  'RUNNER_TEMP'
]);

export function buildClosedCommandEnvironment(environment = process.env, additions = {}) {
  for (const key of Object.keys(environment)) {
    const lower = key.toLowerCase();
    if (
      [
        'node_options',
        'husky',
        'quality_concurrency',
        'test_shard_concurrency',
        'browser_test_concurrency'
      ].includes(lower) ||
      lower.includes('preload') ||
      lower.includes('loader') ||
      lower.includes('proxy') ||
      lower.includes('certificate') ||
      lower === 'node_extra_ca_certs' ||
      lower === 'ssl_cert_file'
    )
      invalid('ENVIRONMENT_FORBIDDEN');
  }
  const result = {
    HOME: typeof environment.HOME === 'string' ? environment.HOME : dirname(process.execPath),
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`
  };
  if (typeof environment.TMPDIR === 'string') result.TMPDIR = environment.TMPDIR;
  for (const key of PASS_ENV)
    if (typeof environment[key] === 'string') result[key] = environment[key];
  return Object.freeze({ ...result, ...additions });
}

function npmInvocation(args, limits) {
  const npm = detectNpmCommand({ repositoryRoot: REPOSITORY_ROOT, environment: {} });
  return { executable: npm.nodePath, argv: [npm.cliPath, ...args], limits };
}

function npmScriptInvocation(args, accepted, limits) {
  validateNpmScriptArgs(args, accepted);
  const [name, separator, ...forwarded] = args;
  return npmInvocation(['run', name, ...(separator ? ['--', ...forwarded] : [])], limits);
}

export function resolveCommandProfile(profileId, args, { environment = process.env } = {}) {
  validateProfileArguments(profileId, args);
  let command;
  if (profileId === 'vitest-v1')
    command = {
      executable: process.execPath,
      argv: [resolveLockedBin('vitest'), ...args],
      limits: COMMAND_LIMITS.vitest
    };
  else if (profileId === 'prettier-v1')
    command = {
      executable: process.execPath,
      argv: [resolveLockedBin('prettier'), ...args],
      limits: COMMAND_LIMITS.standard
    };
  else if (profileId === 'stylelint-v1')
    command = {
      executable: process.execPath,
      argv: [resolveLockedBin('stylelint'), ...args],
      limits: COMMAND_LIMITS.quick
    };
  else if (profileId === 'lint-staged-hook-v1' || profileId === 'lint-staged-prepare-v1')
    command = {
      executable: process.execPath,
      argv: [resolveLockedBin('lint-staged'), '--no-stash'],
      limits: COMMAND_LIMITS.standard
    };
  else if (profileId === 'husky-provision-v1')
    command = {
      executable: process.execPath,
      argv: [resolveLockedBin('husky')],
      limits: COMMAND_LIMITS.quick
    };
  else if (profileId === 'npm-ci-v1')
    command = npmInvocation(
      ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
      COMMAND_LIMITS.build
    );
  else if (profileId === 'npm-script-quick-v1')
    command = npmScriptInvocation(args, QUICK_NPM_SCRIPTS, COMMAND_LIMITS.quick);
  else if (profileId === 'npm-script-standard-v1')
    command = npmScriptInvocation(args, STANDARD_NPM_SCRIPTS, COMMAND_LIMITS.standard);
  else if (profileId === 'npm-script-build-v1')
    command = npmScriptInvocation(args, BUILD_NPM_SCRIPTS, COMMAND_LIMITS.build);
  else if (profileId === 'npm-script-browser-v1')
    command = npmScriptInvocation(args, BROWSER_NPM_SCRIPTS, COMMAND_LIMITS.browser);
  else if (profileId === 'node-script-standard-v1') {
    trackedOrStaged(args[0]);
    command = {
      executable: process.execPath,
      argv: [regularFile(args[0]), ...args.slice(1)],
      limits: COMMAND_LIMITS.standard
    };
  } else if (profileId === 'playwright-v1')
    command = {
      executable: process.execPath,
      argv: [regularFile('scripts/run-playwright.mjs'), ...args],
      limits: COMMAND_LIMITS.browser
    };
  else if (profileId === 'playwright-install-v1')
    command = {
      executable: process.execPath,
      argv: [
        resolveLockedBin('playwright'),
        'install',
        '--with-deps',
        args[0].startsWith('firefox') ? 'firefox' : 'chromium'
      ],
      limits: COMMAND_LIMITS.browser
    };
  else if (profileId === 'fixture-v1')
    command = {
      executable: process.execPath,
      argv: [regularFile('tests/fixtures/bounded-command/child.mjs'), ...args],
      limits: COMMAND_LIMITS.fixture,
      fd3Input: args[0] === 'descriptors' ? 'fd3-input' : undefined
    };
  else if (profileId === 'dependency-cruiser-v1')
    command = {
      executable: process.execPath,
      argv: [
        regularFile('node_modules/dependency-cruiser/bin/dependency-cruise.mjs'),
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'json',
        'src/**/*.ts',
        'src/**/*.tsx',
        'src/**/*.js'
      ],
      limits: COMMAND_LIMITS.build
    };
  else
    command = {
      composite: profileId,
      argv: [...args],
      limits: profileId === 'stitch-secondary-v1' ? COMMAND_LIMITS.browser : COMMAND_LIMITS.standard
    };
  const environmentAdditions =
    profileId === 'lint-staged-hook-v1' || profileId === 'lint-staged-prepare-v1'
      ? { PATH: lintStagedPath() }
      : {};
  return deepFreeze({
    profileId,
    version: COMMAND_BOUNDARY_VERSION,
    cwd: realpathSync(REPOSITORY_ROOT),
    env: buildClosedCommandEnvironment(environment, environmentAdditions),
    shell: false,
    tty: false,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe', command.fd3Input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    ...command
  });
}
