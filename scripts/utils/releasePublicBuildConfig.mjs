import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_PUBLIC_CONFIG_KEYS = Object.freeze([
  'ZENDIO_GA_MEASUREMENT_ID',
  'ZENDIO_GA_TRANSPORT_MODE',
  'ZENDIO_GA_PROXY_ENDPOINT'
]);

export const RELEASE_PUBLIC_CONFIG_MODES = Object.freeze([
  'standalone-synthetic',
  'owner-public-vars'
]);

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

export function validateReleasePublicBuildConfig({ configMode, environment }) {
  if (!RELEASE_PUBLIC_CONFIG_MODES.includes(configMode)) {
    fail('RELEASE_PUBLIC_CONFIG_MODE_INVALID');
  }
  if (!environment || typeof environment !== 'object') fail('RELEASE_PUBLIC_ENV_INVALID');
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
  return Object.freeze({
    configMode,
    values: canonical,
    fingerprint: sha256(Buffer.from(canonicalJson(canonical))),
    artifactConfigEligible: configMode === 'owner-public-vars'
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
    if (flag === '--check') {
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
  if (parsed.size !== 2 || parsed.get('--check') !== true || !parsed.has('--config-mode')) {
    fail('RELEASE_PUBLIC_ARGUMENT_SET_INVALID');
  }
  const result = validateReleasePublicBuildConfig({
    configMode: parsed.get('--config-mode'),
    environment:
      parsed.get('--config-mode') === 'standalone-synthetic'
        ? {
            ZENDIO_GA_MEASUREMENT_ID: STANDALONE_SYNTHETIC_CONFIG.measurementId,
            ZENDIO_GA_TRANSPORT_MODE: STANDALONE_SYNTHETIC_CONFIG.transportMode,
            ZENDIO_GA_PROXY_ENDPOINT: STANDALONE_SYNTHETIC_CONFIG.proxyEndpoint
          }
        : process.env
  });
  console.log(
    `RELEASE_PUBLIC_CONFIG_OK mode=${result.configMode} artifactConfigEligible=${String(result.artifactConfigEligible)}`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
