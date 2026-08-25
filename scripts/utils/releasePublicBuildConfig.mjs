import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT_FOR_BUILD = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const RELEASE_PUBLIC_CONFIG_KEYS = Object.freeze([
  'ZENDIO_GA_MEASUREMENT_ID',
  'ZENDIO_GA_TRANSPORT_MODE',
  'ZENDIO_GA_PROXY_ENDPOINT'
]);

export const RELEASE_PUBLIC_CONFIG_MODES = Object.freeze([
  'standalone-synthetic',
  'owner-public-vars'
]);

export const RELEASE_BUILD_FORBIDDEN_KEYS = Object.freeze([
  'AIIINOB_GA_MEASUREMENT_ID',
  'AIIINOB_GA_TRANSPORT_MODE',
  'AIIINOB_GA_PROXY_ENDPOINT',
  'ZENDIO_SENTRY_DSN',
  'ZENDIO_SENTRY_ENVIRONMENT',
  'ZENDIO_SENTRY_RELEASE',
  'ZENDIO_SENTRY_ENABLED',
  'AIIINOB_SENTRY_DSN',
  'AIIINOB_SENTRY_ENVIRONMENT',
  'AIIINOB_SENTRY_RELEASE',
  'AIIINOB_SENTRY_ENABLED',
  'ZENDIO_REST_HTTPS_HOST',
  'ZENDIO_REST_HTTPS_PORT',
  'ZENDIO_REST_HTTP_HOST',
  'ZENDIO_REST_HTTP_PORT',
  'AIIINOB_REST_HTTPS_HOST',
  'AIIINOB_REST_HTTPS_PORT',
  'AIIINOB_REST_HTTP_HOST',
  'AIIINOB_REST_HTTP_PORT',
  'BUILD_DIST_DIR',
  'ESBUILD_BINARY_PATH',
  'ESBUILD_WORKER_THREADS',
  'ESBUILD_MAX_BUFFER',
  'NODE_OPTIONS'
]);

export const RELEASE_BUILD_ENVIRONMENT_POLICY = Object.freeze({
  id: 'release-build-env-v1',
  sentry: Object.freeze({
    dsn: '',
    enabled: false,
    environment: 'production',
    release: 'package-version'
  }),
  hostPermissions: Object.freeze([
    '<all_urls>',
    'http://127.0.0.1/*',
    'https://127.0.0.1/*',
    'https://127.0.0.1:27124/*',
    'http://127.0.0.1:27123/*'
  ])
});

export const STANDALONE_SYNTHETIC_CONFIG = Object.freeze({
  measurementId: 'G-ZENDIOFIXTURE1',
  transportMode: 'proxy',
  proxyEndpoint: 'https://zendio-ga-fixture.invalid/collect'
});

export const LOCKED_DEPENDENCY_CRUISER = Object.freeze({
  packageName: 'dependency-cruiser',
  version: '16.10.4',
  packageRelativeCli: 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
  configRelativePath: '.dependency-cruiser.cjs',
  argv: Object.freeze([
    '--config',
    '.dependency-cruiser.cjs',
    '--output-type',
    'json',
    'src/**/*.ts',
    'src/**/*.tsx',
    'src/**/*.js'
  ]),
  timeoutMs: 300_000,
  stdoutBytes: 50 * 1024 * 1024,
  stderrBytes: 1024 * 1024
});

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function readJson(path, code) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(code, error instanceof Error ? error.message : String(error));
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value;
}

function readPublicEnvironment(environment) {
  const values = new Map();
  for (const key of RELEASE_PUBLIC_CONFIG_KEYS) values.set(key, environment[key]);
  return Object.freeze({
    measurementId: values.get('ZENDIO_GA_MEASUREMENT_ID'),
    transportMode: values.get('ZENDIO_GA_TRANSPORT_MODE'),
    proxyEndpoint: values.get('ZENDIO_GA_PROXY_ENDPOINT')
  });
}

function assertClosedReleaseEnvironment(environment) {
  for (const key of RELEASE_BUILD_FORBIDDEN_KEYS) {
    if (Object.hasOwn(environment, key)) fail('RELEASE_BUILD_ENVIRONMENT_FORBIDDEN', key);
  }
  for (const key of Object.keys(environment)) {
    const lower = key.toLowerCase();
    if (lower.startsWith('npm_config_')) {
      if (
        !['npm_config_userconfig', 'npm_config_globalconfig'].includes(lower) ||
        (lower === 'npm_config_userconfig' && key !== 'NPM_CONFIG_USERCONFIG') ||
        (lower === 'npm_config_globalconfig' && key !== 'NPM_CONFIG_GLOBALCONFIG')
      )
        fail('RELEASE_BUILD_NPM_CONFIG_FORBIDDEN', key);
    }
  }
}

function platformPackageName(platform = process.platform, architecture = process.arch) {
  const platformName = platform === 'win32' ? 'win32' : platform;
  const architectureName =
    architecture === 'x64' || architecture === 'arm64' ? architecture : architecture;
  return `@esbuild/${platformName}-${architectureName}`;
}

export function resolveReleaseEsbuildIdentity(repoRoot = REPOSITORY_ROOT_FOR_BUILD) {
  const root = realpathSync(repoRoot);
  const lockBytes = readFileSync(join(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const jsBytes = readFileSync(join(root, 'node_modules/esbuild/package.json'));
  const jsPackage = JSON.parse(jsBytes.toString('utf8'));
  const platformName = platformPackageName();
  const platformRelative = `node_modules/${platformName}`;
  const platformBytes = readFileSync(join(root, platformRelative, 'package.json'));
  const platformPackage = JSON.parse(platformBytes.toString('utf8'));
  const lockJs = lock.packages?.['node_modules/esbuild'];
  const lockPlatform = lock.packages?.[platformRelative];
  if (
    jsPackage.name !== 'esbuild' ||
    jsPackage.version !== '0.28.1' ||
    lockJs?.version !== jsPackage.version ||
    lockJs?.optionalDependencies?.[platformName] !== jsPackage.version ||
    platformPackage.name !== platformName ||
    platformPackage.version !== jsPackage.version ||
    lockPlatform?.version !== jsPackage.version ||
    lockPlatform?.optional !== true
  )
    fail('RELEASE_ESBUILD_IDENTITY_INVALID');
  const packageRoot = realpathSync(join(root, platformRelative));
  const executablePath = join(packageRoot, 'bin/esbuild');
  const executableStat = lstatSync(executablePath);
  if (
    !executableStat.isFile() ||
    executableStat.isSymbolicLink() ||
    (executableStat.mode & 0o111) === 0 ||
    realpathSync(executablePath) !== executablePath
  )
    fail('RELEASE_ESBUILD_EXECUTABLE_INVALID');
  const executableBytes = readFileSync(executablePath);
  return Object.freeze({
    platform: process.platform,
    architecture: process.arch,
    jsPackage: Object.freeze({
      name: 'esbuild',
      version: jsPackage.version,
      packageJsonSha256: sha256(jsBytes)
    }),
    platformPackage: Object.freeze({
      name: platformName,
      version: platformPackage.version,
      packageJsonSha256: sha256(platformBytes),
      executableRelativePath: `${platformRelative}/bin/esbuild`,
      executableSize: executableBytes.length,
      executableSha256: sha256(executableBytes)
    }),
    lockSha256: sha256(lockBytes)
  });
}

function validateProxyEndpoint(raw, { allowInvalidHost }) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) {
    fail('RELEASE_PUBLIC_PROXY_ENDPOINT_INVALID');
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('RELEASE_PUBLIC_PROXY_ENDPOINT_INVALID');
  }
  if (
    url.protocol !== 'https:' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.hostname.length === 0 ||
    url.pathname === '' ||
    url.pathname === '/'
  ) {
    fail('RELEASE_PUBLIC_PROXY_ENDPOINT_INVALID');
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/u, '');
  if (!allowInvalidHost && (host === 'invalid' || host.endsWith('.invalid'))) {
    fail('RELEASE_PUBLIC_PROXY_ENDPOINT_INVALID');
  }
  return url.href;
}

export function validateReleasePublicBuildConfig({
  configMode,
  environment,
  repoRoot = process.cwd()
}) {
  if (!RELEASE_PUBLIC_CONFIG_MODES.includes(configMode)) {
    fail('RELEASE_PUBLIC_CONFIG_MODE_INVALID');
  }
  if (!environment || typeof environment !== 'object') fail('RELEASE_PUBLIC_ENV_INVALID');
  if (realpathSync(repoRoot) !== realpathSync(REPOSITORY_ROOT_FOR_BUILD))
    fail('RELEASE_PUBLIC_REPOSITORY_ROOT_INVALID');
  assertClosedReleaseEnvironment(environment);
  const raw = readPublicEnvironment(environment);
  if (raw.transportMode !== 'proxy') fail('RELEASE_PUBLIC_TRANSPORT_MODE_INVALID');
  if (typeof raw.measurementId !== 'string' || !/^G-[A-Z0-9]{6,32}$/u.test(raw.measurementId)) {
    fail('RELEASE_PUBLIC_MEASUREMENT_ID_INVALID');
  }
  const proxyEndpoint = validateProxyEndpoint(raw.proxyEndpoint, {
    allowInvalidHost: configMode === 'standalone-synthetic'
  });
  if (configMode === 'standalone-synthetic') {
    if (
      raw.measurementId !== STANDALONE_SYNTHETIC_CONFIG.measurementId ||
      raw.transportMode !== STANDALONE_SYNTHETIC_CONFIG.transportMode ||
      proxyEndpoint !== STANDALONE_SYNTHETIC_CONFIG.proxyEndpoint
    ) {
      fail('RELEASE_PUBLIC_SYNTHETIC_CONFIG_MISMATCH');
    }
  } else if (
    raw.measurementId === STANDALONE_SYNTHETIC_CONFIG.measurementId ||
    proxyEndpoint === STANDALONE_SYNTHETIC_CONFIG.proxyEndpoint
  ) {
    fail('RELEASE_PUBLIC_FIXTURE_CONFIG_FORBIDDEN');
  }
  const canonical = Object.freeze({
    measurementId: raw.measurementId,
    transportMode: raw.transportMode,
    proxyEndpoint
  });
  const rawValues = Object.freeze({
    ZENDIO_GA_MEASUREMENT_ID: raw.measurementId,
    ZENDIO_GA_TRANSPORT_MODE: raw.transportMode,
    ZENDIO_GA_PROXY_ENDPOINT: raw.proxyEndpoint
  });
  const policy = Object.freeze({
    ...RELEASE_BUILD_ENVIRONMENT_POLICY,
    sentry: Object.freeze({
      ...RELEASE_BUILD_ENVIRONMENT_POLICY.sentry,
      release: JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version
    })
  });
  return Object.freeze({
    configMode,
    values: canonical,
    fingerprint: sha256(Buffer.from(canonicalJson(canonical))),
    rawValues,
    rawFingerprints: Object.freeze(
      Object.fromEntries(Object.entries(rawValues).map(([key, value]) => [key, sha256(value)]))
    ),
    artifactConfigEligible: configMode === 'owner-public-vars',
    policy,
    policyDigest: sha256(Buffer.from(canonicalJson(policy))),
    esbuild: resolveReleaseEsbuildIdentity(repoRoot)
  });
}

function dependencyProjection(packageJson) {
  return {
    dependencies: packageJson.dependencies ?? {},
    devDependencies: packageJson.devDependencies ?? {},
    optionalDependencies: packageJson.optionalDependencies ?? {},
    peerDependencies: packageJson.peerDependencies ?? {},
    overrides: packageJson.overrides ?? {},
    engines: packageJson.engines ?? {}
  };
}

function defaultReadHeadFile(repoRoot, relativePath) {
  return execFileSync('git', ['show', `HEAD:${relativePath}`], {
    cwd: repoRoot,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    env: { PATH: '/usr/bin:/bin' }
  });
}

function assertContainedRegular(root, path, code) {
  const absolute = resolve(path);
  const canonical = realpathSync(absolute);
  const rootPrefix = `${root}${sep}`;
  if (!canonical.startsWith(rootPrefix)) fail(code, 'outside-root');
  const stats = lstatSync(absolute);
  if (!stats.isFile() || stats.isSymbolicLink()) fail(code, 'not-regular');
  return { absolute, canonical, stats };
}

function validateLockedCruiserRepository(repoRoot, dependencies) {
  const root = realpathSync(repoRoot);
  const packagePath = join(root, 'package.json');
  const lockPath = join(root, 'package-lock.json');
  const configPath = join(root, LOCKED_DEPENDENCY_CRUISER.configRelativePath);
  const packageBytes = readFileSync(packagePath);
  const lockBytes = readFileSync(lockPath);
  const configBytes = readFileSync(configPath);
  const packageJson = JSON.parse(packageBytes);
  const lockJson = JSON.parse(lockBytes);
  const readHeadFile = dependencies.readHeadFile ?? defaultReadHeadFile;
  const headPackageBytes = Buffer.from(readHeadFile(root, 'package.json'));
  const headLockBytes = Buffer.from(readHeadFile(root, 'package-lock.json'));
  const headConfigBytes = Buffer.from(
    readHeadFile(root, LOCKED_DEPENDENCY_CRUISER.configRelativePath)
  );
  if (
    canonicalJson(dependencyProjection(packageJson)) !==
    canonicalJson(dependencyProjection(JSON.parse(headPackageBytes)))
  ) {
    fail('DEPENDENCY_CRUISER_PACKAGE_PROJECTION_DIRTY');
  }
  if (!lockBytes.equals(headLockBytes)) fail('DEPENDENCY_CRUISER_LOCK_DIRTY');
  if (!configBytes.equals(headConfigBytes)) fail('DEPENDENCY_CRUISER_CONFIG_DIRTY');
  if (packageJson.devDependencies?.['dependency-cruiser'] !== LOCKED_DEPENDENCY_CRUISER.version) {
    fail('DEPENDENCY_CRUISER_ROOT_EDGE_INVALID');
  }
  if (
    lockJson.lockfileVersion !== 3 ||
    lockJson.packages?.['']?.devDependencies?.['dependency-cruiser'] !==
      LOCKED_DEPENDENCY_CRUISER.version ||
    lockJson.packages?.['node_modules/dependency-cruiser']?.version !==
      LOCKED_DEPENDENCY_CRUISER.version
  ) {
    fail('DEPENDENCY_CRUISER_LOCK_EDGE_INVALID');
  }
  const installedPackagePath = join(root, 'node_modules/dependency-cruiser/package.json');
  const installedPackage = readJson(installedPackagePath, 'DEPENDENCY_CRUISER_PACKAGE_INVALID');
  if (
    installedPackage.version !== LOCKED_DEPENDENCY_CRUISER.version ||
    installedPackage.bin?.['dependency-cruiser'] !== 'bin/dependency-cruise.mjs'
  ) {
    fail('DEPENDENCY_CRUISER_PACKAGE_INVALID');
  }
  const cli = assertContainedRegular(
    root,
    join(root, LOCKED_DEPENDENCY_CRUISER.packageRelativeCli),
    'DEPENDENCY_CRUISER_CLI_INVALID'
  );
  return Object.freeze({
    repoRoot: root,
    cliPath: cli.canonical,
    packageDigest: sha256(packageBytes),
    dependencyProjectionDigest: sha256(
      Buffer.from(canonicalJson(dependencyProjection(packageJson)))
    ),
    lockDigest: sha256(lockBytes),
    configDigest: sha256(configBytes),
    cliDigest: sha256(readFileSync(cli.canonical))
  });
}

function closedChildEnvironment(environment = process.env) {
  const result = {};
  if (typeof environment.HOME === 'string') result.HOME = environment.HOME;
  if (typeof environment.TMPDIR === 'string') result.TMPDIR = environment.TMPDIR;
  result.PATH = dirname(process.execPath);
  result.LANG = 'C';
  return result;
}

function assertPrivateDirectory(path, code) {
  const stats = lstatSync(path);
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    stats.uid !== process.getuid?.() ||
    (stats.mode & 0o777) !== 0o700 ||
    realpathSync(path) !== path
  )
    fail(code);
  return path;
}

function releaseAttemptFromNpmConfigs(environment) {
  const userconfig = environment.NPM_CONFIG_USERCONFIG;
  const globalconfig = environment.NPM_CONFIG_GLOBALCONFIG;
  if (
    typeof userconfig !== 'string' ||
    typeof globalconfig !== 'string' ||
    !isAbsolute(userconfig) ||
    !isAbsolute(globalconfig) ||
    resolve(userconfig) !== userconfig ||
    resolve(globalconfig) !== globalconfig ||
    dirname(userconfig) !== dirname(globalconfig) ||
    userconfig !== join(dirname(userconfig), 'npm-userconfig') ||
    globalconfig !== join(dirname(globalconfig), 'npm-globalconfig') ||
    dirname(userconfig) !== join(dirname(dirname(userconfig)), 'install')
  )
    fail('RELEASE_BUILD_ATTEMPT_AUTHORITY_INVALID');
  const root = assertPrivateDirectory(
    dirname(dirname(userconfig)),
    'RELEASE_BUILD_ATTEMPT_INVALID'
  );
  assertPrivateDirectory(dirname(userconfig), 'RELEASE_BUILD_INSTALL_ROOT_INVALID');
  for (const path of [userconfig, globalconfig]) {
    const stat = lstatSync(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o777) !== 0o600 ||
      readFileSync(path).length !== 0 ||
      realpathSync(path) !== path
    )
      fail('RELEASE_BUILD_ATTEMPT_AUTHORITY_INVALID');
  }
  return root;
}

function requireExactBuildChild(root, path, browser, prefix, code) {
  const buildRoot = join(root, 'build');
  assertPrivateDirectory(buildRoot, 'RELEASE_BUILD_ROOT_INVALID');
  if (
    typeof path !== 'string' ||
    !isAbsolute(path) ||
    resolve(path) !== path ||
    path !== join(buildRoot, `${prefix}-${browser}`)
  )
    fail(code);
  return { buildRoot, path };
}

function requireAbsentBuildChild(root, path, browser, prefix, code) {
  const validated = requireExactBuildChild(root, path, browser, prefix, code);
  try {
    lstatSync(path);
    fail(code, 'preexists');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return validated;
}

function requirePrivateEmptyBuildChild(root, path, browser, prefix, code) {
  const validated = requireExactBuildChild(root, path, browser, prefix, code);
  assertPrivateDirectory(path, code);
  if (readdirSync(path).length !== 0) fail(code, 'not-empty');
  return validated;
}

function assertClosedOwnedTree(root) {
  assertPrivateDirectory(root, 'RELEASE_BUILD_OUTPUT_INVALID');
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || stat.uid !== process.getuid?.())
        fail('RELEASE_BUILD_OUTPUT_INVALID');
      if (entry.isDirectory()) visit(path);
      else if (!entry.isFile()) fail('RELEASE_BUILD_OUTPUT_INVALID');
    }
  };
  visit(root);
}

export function runIsolatedReleaseBuild(options, dependencies = {}) {
  const environment = options?.environment ?? process.env;
  const configMode = options?.configMode;
  const browser = options?.browser;
  if (!['chrome', 'firefox'].includes(browser)) fail('RELEASE_BUILD_BROWSER_INVALID');
  const attemptRoot = releaseAttemptFromNpmConfigs(environment);
  const dist = requireAbsentBuildChild(
    attemptRoot,
    options?.distDir,
    browser,
    'dist',
    'RELEASE_BUILD_DIST_INVALID'
  );
  const temp = requirePrivateEmptyBuildChild(
    attemptRoot,
    options?.tempDir,
    browser,
    'tmp',
    'RELEASE_BUILD_TEMP_INVALID'
  );
  const distDir = dist.path;
  const tempDir = temp.path;
  if (dist.buildRoot !== temp.buildRoot) fail('RELEASE_BUILD_PATH_ALIAS');
  if (distDir === tempDir) fail('RELEASE_BUILD_PATH_ALIAS');
  const effectiveEnvironment =
    configMode === 'standalone-synthetic'
      ? {
          ...environment,
          ...Object.fromEntries(RELEASE_PUBLIC_CONFIG_KEYS.map((key) => [key, undefined])),
          ZENDIO_GA_MEASUREMENT_ID: STANDALONE_SYNTHETIC_CONFIG.measurementId,
          ZENDIO_GA_TRANSPORT_MODE: STANDALONE_SYNTHETIC_CONFIG.transportMode,
          ZENDIO_GA_PROXY_ENDPOINT: STANDALONE_SYNTHETIC_CONFIG.proxyEndpoint
        }
      : environment;
  const config = validateReleasePublicBuildConfig({
    configMode,
    environment: effectiveEnvironment,
    repoRoot: REPOSITORY_ROOT_FOR_BUILD
  });
  const repositoryStatus =
    dependencies.repositoryStatusOperation?.(REPOSITORY_ROOT_FOR_BUILD) ??
    execFileSync('/usr/bin/git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: REPOSITORY_ROOT_FOR_BUILD,
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' }
    });
  if (repositoryStatus !== '') fail('RELEASE_BUILD_REPOSITORY_DIRTY');
  mkdirSync(distDir, { mode: 0o700 });
  chmodSync(distDir, 0o700);
  assertPrivateDirectory(distDir, 'RELEASE_BUILD_DIST_INVALID');
  if (readdirSync(distDir).length !== 0) fail('RELEASE_BUILD_DIST_INVALID', 'not-empty');
  requirePrivateEmptyBuildChild(attemptRoot, tempDir, browser, 'tmp', 'RELEASE_BUILD_TEMP_INVALID');
  assertPrivateDirectory(dist.buildRoot, 'RELEASE_BUILD_ROOT_INVALID');
  if (releaseAttemptFromNpmConfigs(environment) !== attemptRoot)
    fail('RELEASE_BUILD_ATTEMPT_AUTHORITY_INVALID');
  const buildScript = join(REPOSITORY_ROOT_FOR_BUILD, 'scripts/build.mjs');
  const scriptStat = lstatSync(buildScript);
  if (
    !scriptStat.isFile() ||
    scriptStat.isSymbolicLink() ||
    realpathSync(buildScript) !== buildScript
  )
    fail('RELEASE_BUILD_SCRIPT_INVALID');
  const argv = [
    buildScript,
    '--mode=prod',
    '--skip-checks',
    ...(browser === 'firefox' ? ['--firefox'] : []),
    '--outdir',
    distDir
  ];
  const childEnvironment = Object.freeze({
    HOME: tempDir,
    TMPDIR: tempDir,
    TMP: tempDir,
    TEMP: tempDir,
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    CI: '1',
    ...config.rawValues
  });
  const spawn = dependencies.spawnSync ?? spawnSync;
  const result = spawn(process.execPath, argv, {
    cwd: REPOSITORY_ROOT_FOR_BUILD,
    env: childEnvironment,
    encoding: null,
    shell: false,
    timeout: 630_000,
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) fail('RELEASE_BUILD_SPAWN_FAILED', result.error.message);
  if (result.signal) fail('RELEASE_BUILD_SIGNAL', result.signal);
  if (result.status !== 0) fail('RELEASE_BUILD_EXIT', String(result.status));
  chmodSync(distDir, 0o700);
  assertClosedOwnedTree(distDir);
  if (readdirSync(distDir).length === 0) fail('RELEASE_BUILD_OUTPUT_EMPTY');
  assertPrivateDirectory(tempDir, 'RELEASE_BUILD_TEMP_INVALID');
  return Object.freeze({ browser, attemptRoot, distDir, tempDir, config, argv, childEnvironment });
}

export function runLockedDependencyCruiser(options = {}, dependencies = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  if (!isAbsolute(repoRoot)) fail('DEPENDENCY_CRUISER_ROOT_NOT_ABSOLUTE');
  const binding = validateLockedCruiserRepository(repoRoot, dependencies);
  const spawn = dependencies.spawnSync ?? spawnSync;
  const result = spawn(process.execPath, [binding.cliPath, ...LOCKED_DEPENDENCY_CRUISER.argv], {
    cwd: binding.repoRoot,
    env: closedChildEnvironment(options.environment),
    encoding: null,
    shell: false,
    timeout: LOCKED_DEPENDENCY_CRUISER.timeoutMs,
    maxBuffer: LOCKED_DEPENDENCY_CRUISER.stdoutBytes
  });
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') fail('DEPENDENCY_CRUISER_TIMEOUT');
    fail('DEPENDENCY_CRUISER_SPAWN_FAILED', result.error.message);
  }
  const stdout = Buffer.from(result.stdout ?? Buffer.alloc(0));
  const stderr = Buffer.from(result.stderr ?? Buffer.alloc(0));
  if (stdout.length > LOCKED_DEPENDENCY_CRUISER.stdoutBytes)
    fail('DEPENDENCY_CRUISER_STDOUT_LIMIT');
  if (stderr.length > LOCKED_DEPENDENCY_CRUISER.stderrBytes)
    fail('DEPENDENCY_CRUISER_STDERR_LIMIT');
  if (result.signal) fail('DEPENDENCY_CRUISER_SIGNAL', result.signal);
  if (result.status !== 0) fail('DEPENDENCY_CRUISER_EXIT', String(result.status));
  if (stdout.length === 0) fail('DEPENDENCY_CRUISER_EMPTY_OUTPUT');
  const after = validateLockedCruiserRepository(repoRoot, dependencies);
  for (const key of ['dependencyProjectionDigest', 'lockDigest', 'configDigest', 'cliDigest']) {
    if (binding[key] !== after[key]) fail('DEPENDENCY_CRUISER_IDENTITY_CHANGED', key);
  }
  return Object.freeze({ stdout, stderr, binding });
}

function parseClosedArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!flag.startsWith('--') || values.has(flag)) fail('RELEASE_PUBLIC_ARGUMENT_INVALID', flag);
    if (flag === '--check' || flag === '--run-isolated-build') {
      values.set(flag, true);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail('RELEASE_PUBLIC_ARGUMENT_MISSING', flag);
    values.set(flag, value);
    index += 1;
  }
  return values;
}

async function main(args = process.argv.slice(2)) {
  const parsed = parseClosedArgs(args);
  if (parsed.get('--run-isolated-build') === true) {
    if (
      parsed.size !== 5 ||
      !parsed.has('--config-mode') ||
      !parsed.has('--browser') ||
      !parsed.has('--dist-dir') ||
      !parsed.has('--temp-dir')
    )
      fail('RELEASE_PUBLIC_ARGUMENT_SET_INVALID');
    const result = runIsolatedReleaseBuild({
      configMode: parsed.get('--config-mode'),
      browser: parsed.get('--browser'),
      distDir: parsed.get('--dist-dir'),
      tempDir: parsed.get('--temp-dir'),
      environment: process.env
    });
    console.log(`RELEASE_ISOLATED_BUILD_OK browser=${result.browser} dist=${result.distDir}`);
    return;
  }
  if (parsed.size !== 2 || parsed.get('--check') !== true || !parsed.has('--config-mode'))
    fail('RELEASE_PUBLIC_ARGUMENT_SET_INVALID');
  const configMode = parsed.get('--config-mode');
  const result = validateReleasePublicBuildConfig({
    configMode,
    environment:
      configMode === 'standalone-synthetic'
        ? {
            ...process.env,
            ZENDIO_GA_MEASUREMENT_ID: STANDALONE_SYNTHETIC_CONFIG.measurementId,
            ZENDIO_GA_TRANSPORT_MODE: STANDALONE_SYNTHETIC_CONFIG.transportMode,
            ZENDIO_GA_PROXY_ENDPOINT: STANDALONE_SYNTHETIC_CONFIG.proxyEndpoint
          }
        : process.env,
    repoRoot: REPOSITORY_ROOT_FOR_BUILD
  });
  console.log(
    `RELEASE_PUBLIC_CONFIG_OK mode=${result.configMode} artifactConfigEligible=${String(result.artifactConfigEligible)}`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
