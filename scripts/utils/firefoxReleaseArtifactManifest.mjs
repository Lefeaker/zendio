import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryBoundedZip } from './boundedZipArchive.mjs';
import { resolveReleaseEsbuildIdentity } from './releasePublicBuildConfig.mjs';

export const FIREFOX_RELEASE_ARTIFACT_SCHEMA = 'portable-release-artifact-v1';
export const FIREFOX_RELEASE_TRANSPORT_MODES = Object.freeze([
  'local-private-v1',
  'github-artifact-v1'
]);
export const FIREFOX_RELEASE_AUTHORIZATION_MODES = Object.freeze([
  'standalone-unproven',
  'attached-ci-provenance-v1'
]);
export const FIREFOX_RELEASE_ARTIFACT_LIMITS = Object.freeze({
  authorizationBytes: 256 * 1024,
  manifestBytes: 16 * 1024 * 1024,
  artifactBytes: 256 * 1024 * 1024,
  resultBytes: 64 * 1024,
  maximumDepth: 32,
  maximumRows: 4096,
  maximumPathBytes: 1024,
  maximumStringBytes: 4096
});

const verifiedBindings = new WeakSet();
const consumedBindings = new WeakSet();
const bindingContexts = new WeakMap();
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function canonicalArtifactJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertClosedKeys(value, expected, code) {
  if (!isPlainObject(value)) fail(code);
  const keys = Object.keys(value).sort();
  const accepted = [...expected].sort();
  if (canonicalArtifactJson(keys) !== canonicalArtifactJson(accepted)) fail(code);
}

function assertBoundedValue(value, depth = 0) {
  if (depth > FIREFOX_RELEASE_ARTIFACT_LIMITS.maximumDepth) fail('FIREFOX_RELEASE_VALUE_DEPTH');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > FIREFOX_RELEASE_ARTIFACT_LIMITS.maximumStringBytes)
      fail('FIREFOX_RELEASE_STRING_LIMIT');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > FIREFOX_RELEASE_ARTIFACT_LIMITS.maximumRows)
      fail('FIREFOX_RELEASE_ROW_LIMIT');
    for (const item of value) assertBoundedValue(item, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    if (!isPlainObject(value)) fail('FIREFOX_RELEASE_VALUE_INVALID');
    if (Object.keys(value).length > 512) fail('FIREFOX_RELEASE_ROW_LIMIT');
    for (const [key, item] of Object.entries(value)) {
      if (Buffer.byteLength(key, 'utf8') > 512) fail('FIREFOX_RELEASE_KEY_LIMIT');
      assertBoundedValue(item, depth + 1);
    }
  }
}

function assertSafeRelativePath(value, code) {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') > FIREFOX_RELEASE_ARTIFACT_LIMITS.maximumPathBytes ||
    value.length === 0 ||
    value !== value.normalize('NFC') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    fail(code);
  return value;
}

function assertCanonicalGeckoId(value) {
  const email =
    /^[A-Za-z0-9][A-Za-z0-9._%+-]{0,127}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,126}[A-Za-z0-9])?$/u;
  const uuid = /^\{[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\}$/u;
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value) > 256 ||
    (!email.test(value) && !uuid.test(value))
  )
    fail('FIREFOX_RELEASE_GECKO_ID');
  return value;
}

function validateInventoryRows(rows, { zip = false } = {}) {
  if (!Array.isArray(rows) || rows.length > FIREFOX_RELEASE_ARTIFACT_LIMITS.maximumRows)
    fail('FIREFOX_RELEASE_INVENTORY_INVALID');
  const paths = new Set();
  for (const row of rows) {
    assertClosedKeys(
      row,
      zip
        ? ['crc32', 'directory', 'path', 'sha256', 'size']
        : ['directory', 'path', 'sha256', 'size'],
      'FIREFOX_RELEASE_INVENTORY_INVALID'
    );
    assertSafeRelativePath(row.path.replace(/\/$/u, ''), 'FIREFOX_RELEASE_INVENTORY_PATH');
    if (paths.has(row.path)) fail('FIREFOX_RELEASE_INVENTORY_DUPLICATE');
    paths.add(row.path);
    if (
      typeof row.directory !== 'boolean' ||
      row.directory !== row.path.endsWith('/') ||
      !Number.isSafeInteger(row.size) ||
      row.size < 0 ||
      (row.directory && row.size !== 0) ||
      (row.directory ? row.sha256 !== null : !/^[0-9a-f]{64}$/u.test(row.sha256 ?? '')) ||
      (zip && (!Number.isInteger(row.crc32) || row.crc32 < -2147483648 || row.crc32 > 0xffffffff))
    )
      fail('FIREFOX_RELEASE_INVENTORY_INVALID');
  }
}

function validateAuthorization(authorization, releaseSha, configMode) {
  if (
    Buffer.byteLength(canonicalArtifactJson(authorization), 'utf8') >
    FIREFOX_RELEASE_ARTIFACT_LIMITS.authorizationBytes
  )
    fail('FIREFOX_RELEASE_AUTHORIZATION_LIMIT');
  if (!['standalone-synthetic', 'owner-public-vars'].includes(configMode)) {
    fail('FIREFOX_RELEASE_CONFIG_MODE');
  }
  if (authorization?.authorizationMode === 'standalone-unproven') {
    assertClosedKeys(
      authorization,
      ['authorizationMode', 'provenance', 'releaseEligible'],
      'FIREFOX_RELEASE_AUTHORIZATION_INVALID'
    );
    if (authorization.provenance !== null || authorization.releaseEligible !== false) {
      fail('FIREFOX_RELEASE_AUTHORIZATION_INVALID');
    }
    if (configMode !== 'standalone-synthetic') fail('FIREFOX_RELEASE_AUTHORIZATION_MODE');
    return canonicalize(authorization);
  }
  if (authorization?.authorizationMode === 'attached-ci-provenance-v1') {
    assertClosedKeys(
      authorization,
      [
        'authorizationMode',
        'provenance',
        'provenanceRelativePath',
        'provenanceSha256',
        'releaseEligible'
      ],
      'FIREFOX_RELEASE_AUTHORIZATION_INVALID'
    );
    if (
      !isPlainObject(authorization.provenance) ||
      !/^[0-9a-f]{64}$/u.test(authorization.provenanceSha256 ?? '') ||
      sha256Bytes(Buffer.from(canonicalArtifactJson(authorization.provenance), 'utf8')) !==
        authorization.provenanceSha256 ||
      authorization.provenanceRelativePath !== 'ci-provenance.json' ||
      authorization.provenance.releaseSha !== releaseSha ||
      authorization.releaseEligible !== false
    ) {
      fail('FIREFOX_RELEASE_AUTHORIZATION_INVALID');
    }
    if (configMode !== 'owner-public-vars') fail('FIREFOX_RELEASE_AUTHORIZATION_MODE');
    return canonicalize(authorization);
  }
  fail('FIREFOX_RELEASE_AUTHORIZATION_INVALID');
}

function readStableRegularFile(
  path,
  expectedMode,
  maximumBytes = FIREFOX_RELEASE_ARTIFACT_LIMITS.artifactBytes
) {
  const before = lstatSync(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.uid !== process.getuid?.() ||
    before.size > maximumBytes
  ) {
    fail('FIREFOX_RELEASE_MEMBER_NOT_PRIVATE_REGULAR', path);
  }
  if ((before.mode & 0o777) !== expectedMode) fail('FIREFOX_RELEASE_MEMBER_MODE', path);
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const fd = openSync(path, flags);
  try {
    const opened = fstatSync(fd);
    const same = (left, right) =>
      left.dev === right.dev &&
      left.ino === right.ino &&
      left.mode === right.mode &&
      left.uid === right.uid &&
      left.nlink === right.nlink &&
      left.size === right.size &&
      left.mtimeMs === right.mtimeMs &&
      left.ctimeMs === right.ctimeMs;
    if (!same(opened, before)) {
      fail('FIREFOX_RELEASE_MEMBER_IDENTITY_CHANGED', path);
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const live = lstatSync(path);
    if (!same(opened, after) || !same(after, live) || realpathSync(path) !== path) {
      fail('FIREFOX_RELEASE_MEMBER_IDENTITY_CHANGED', path);
    }
    return {
      bytes,
      stat: {
        dev: opened.dev,
        ino: opened.ino,
        uid: opened.uid,
        nlink: opened.nlink,
        size: opened.size,
        mode: opened.mode & 0o777,
        mtimeMs: opened.mtimeMs,
        ctimeMs: opened.ctimeMs
      }
    };
  } finally {
    closeSync(fd);
  }
}

function assertStableSnapshot(left, right, code) {
  if (
    left.stat.dev !== right.stat.dev ||
    left.stat.ino !== right.stat.ino ||
    left.stat.size !== right.stat.size ||
    sha256Bytes(left.bytes) !== sha256Bytes(right.bytes)
  )
    fail(code);
}

function assertContained(root, path) {
  const resolvedRoot = realpathSync(resolve(root));
  const resolvedPath = realpathSync(resolve(path));
  const prefix = `${resolvedRoot}${sep}`;
  if (!resolvedPath.startsWith(prefix)) fail('FIREFOX_RELEASE_PATH_ESCAPE', resolvedPath);
  return resolvedPath;
}

function expectedModes(transportMode) {
  if (!FIREFOX_RELEASE_TRANSPORT_MODES.includes(transportMode)) {
    fail('FIREFOX_RELEASE_TRANSPORT_MODE');
  }
  return transportMode === 'local-private-v1'
    ? { directory: 0o700, file: 0o600 }
    : { directory: 0o755, file: 0o644 };
}

function assertDirectoryTree(root, transportMode) {
  const modes = expectedModes(transportMode);
  const rootStat = lstatSync(root);
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    rootStat.uid !== process.getuid?.() ||
    realpathSync(root) !== root
  )
    fail('FIREFOX_RELEASE_ROOT_TYPE');
  if ((rootStat.mode & 0o777) !== modes.directory) fail('FIREFOX_RELEASE_ROOT_MODE');
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) fail('FIREFOX_RELEASE_SYMLINK', path);
      if (entry.isDirectory()) {
        if (
          stat.uid !== process.getuid?.() ||
          (stat.mode & 0o777) !== modes.directory ||
          realpathSync(path) !== path
        )
          fail('FIREFOX_RELEASE_DIRECTORY_MODE', path);
        visit(path);
      } else if (!entry.isFile()) {
        fail('FIREFOX_RELEASE_SPECIAL_ENTRY', path);
      } else if (stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== modes.file) {
        fail('FIREFOX_RELEASE_MEMBER_MODE', path);
      }
    }
  };
  visit(root);
  return modes;
}

async function zipInventory(path, { xpi = false } = {}) {
  const inventory = await inventoryBoundedZip(path);
  const rows = inventory.entries.map((entry) => ({
    path: entry.path,
    directory: entry.directory,
    size: entry.uncompressedSize,
    crc32: entry.crc32,
    sha256: entry.directory ? null : sha256Bytes(entry.content)
  }));
  validateInventoryRows(rows, { zip: true });
  if (!xpi) return { rows };
  const manifestEntries = inventory.entries.filter(
    (entry) => !entry.directory && entry.path === 'manifest.json'
  );
  if (manifestEntries.length !== 1) fail('FIREFOX_RELEASE_XPI_MANIFEST');
  let extensionManifest;
  try {
    extensionManifest = JSON.parse(manifestEntries[0].content.toString('utf8'));
  } catch {
    fail('FIREFOX_RELEASE_XPI_MANIFEST');
  }
  const geckoId =
    extensionManifest.browser_specific_settings?.gecko?.id ??
    extensionManifest.applications?.gecko?.id;
  assertCanonicalGeckoId(geckoId);
  if (typeof extensionManifest.version !== 'string' || extensionManifest.version.length === 0)
    fail('FIREFOX_RELEASE_XPI_MANIFEST');
  return { rows, geckoId, manifestVersion: extensionManifest.version };
}

function distInventory(root) {
  root = realpathSync(root);
  const rows = [];
  const visit = (dir) => {
    const directory = lstatSync(dir);
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      directory.uid !== process.getuid?.() ||
      realpathSync(dir) !== dir
    )
      fail('FIREFOX_RELEASE_DIST_DIRECTORY', dir);
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const path = join(dir, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) fail('FIREFOX_RELEASE_DIST_SYMLINK', path);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        const relativePath = relative(root, path).split(sep).join('/');
        if (relativePath.endsWith('.map') || basename(relativePath) === '.DS_Store') continue;
        if (rows.length >= FIREFOX_RELEASE_ARTIFACT_LIMITS.maximumRows)
          fail('FIREFOX_RELEASE_ROW_LIMIT');
        const snapshot = readStableRegularFile(path, stat.mode & 0o777);
        rows.push({
          path: relativePath,
          directory: false,
          size: snapshot.bytes.length,
          sha256: sha256Bytes(snapshot.bytes)
        });
      } else fail('FIREFOX_RELEASE_DIST_SPECIAL_ENTRY', path);
    }
  };
  visit(root);
  validateInventoryRows(rows);
  return rows;
}

function sameInventory(left, right) {
  const normalize = (rows) =>
    rows
      .filter((row) => !row.directory)
      .map(({ path, size, sha256 }) => ({ path, size, sha256 }))
      .sort((a, b) => a.path.localeCompare(b.path));
  return canonicalArtifactJson(normalize(left)) === canonicalArtifactJson(normalize(right));
}

function validateManifestShape(manifest) {
  assertBoundedValue(manifest);
  assertClosedKeys(
    manifest,
    [
      'authorization',
      'buildEnvironment',
      'distInventory',
      'gaConfig',
      'git',
      'members',
      'package',
      'schema',
      'toolchain'
    ],
    'FIREFOX_RELEASE_MANIFEST_SCHEMA'
  );
  assertClosedKeys(manifest.git, ['head', 'tree'], 'FIREFOX_RELEASE_GIT_IDENTITY');
  if (
    !/^[0-9a-f]{40}$/u.test(manifest.git.head ?? '') ||
    !/^[0-9a-f]{40}$/u.test(manifest.git.tree ?? '')
  )
    fail('FIREFOX_RELEASE_GIT_IDENTITY');
  assertClosedKeys(
    manifest.package,
    ['geckoId', 'manifestVersion', 'version'],
    'FIREFOX_RELEASE_PACKAGE_IDENTITY'
  );
  assertCanonicalGeckoId(manifest.package.geckoId);
  for (const value of [manifest.package.version, manifest.package.manifestVersion]) {
    if (typeof value !== 'string' || value.length === 0) fail('FIREFOX_RELEASE_PACKAGE_IDENTITY');
  }
  const currentPackage = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'package.json'), 'utf8'));
  if (
    manifest.package.version !== currentPackage.version ||
    manifest.package.manifestVersion !== currentPackage.version
  )
    fail('FIREFOX_RELEASE_PACKAGE_IDENTITY');
  assertClosedKeys(
    manifest.toolchain,
    ['esbuild', 'lockSha256', 'node', 'npm', 'webExt'],
    'FIREFOX_RELEASE_TOOLCHAIN_IDENTITY'
  );
  if (
    manifest.toolchain.node !== 'v20.20.2' ||
    manifest.toolchain.npm !== '10.8.2' ||
    manifest.toolchain.webExt !== '10.4.0' ||
    !/^[0-9a-f]{64}$/u.test(manifest.toolchain.lockSha256 ?? '')
  )
    fail('FIREFOX_RELEASE_TOOLCHAIN_IDENTITY');
  assertClosedKeys(
    manifest.toolchain.esbuild,
    ['architecture', 'jsPackage', 'lockSha256', 'platform', 'platformPackage'],
    'FIREFOX_RELEASE_ESBUILD_IDENTITY'
  );
  assertClosedKeys(
    manifest.toolchain.esbuild.jsPackage,
    ['name', 'packageJsonSha256', 'version'],
    'FIREFOX_RELEASE_ESBUILD_IDENTITY'
  );
  assertClosedKeys(
    manifest.toolchain.esbuild.platformPackage,
    [
      'executableRelativePath',
      'executableSha256',
      'executableSize',
      'name',
      'packageJsonSha256',
      'version'
    ],
    'FIREFOX_RELEASE_ESBUILD_IDENTITY'
  );
  const esbuild = manifest.toolchain.esbuild;
  const expectedPlatformPackage = `@esbuild/${esbuild.platform === 'win32' ? 'win32' : esbuild.platform}-${esbuild.architecture}`;
  if (
    esbuild.jsPackage.name !== 'esbuild' ||
    esbuild.jsPackage.version !== '0.28.1' ||
    esbuild.platformPackage.version !== '0.28.1' ||
    esbuild.platformPackage.name !== expectedPlatformPackage ||
    esbuild.platformPackage.executableRelativePath !==
      `node_modules/${expectedPlatformPackage}/bin/esbuild` ||
    typeof esbuild.platform !== 'string' ||
    typeof esbuild.architecture !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(esbuild.lockSha256 ?? '') ||
    !/^[0-9a-f]{64}$/u.test(esbuild.jsPackage.packageJsonSha256 ?? '') ||
    !/^[0-9a-f]{64}$/u.test(esbuild.platformPackage.packageJsonSha256 ?? '') ||
    !/^[0-9a-f]{64}$/u.test(esbuild.platformPackage.executableSha256 ?? '') ||
    !Number.isSafeInteger(esbuild.platformPackage.executableSize) ||
    esbuild.platformPackage.executableSize <= 0
  )
    fail('FIREFOX_RELEASE_ESBUILD_IDENTITY');
  const currentEsbuild = resolveReleaseEsbuildIdentity(REPOSITORY_ROOT);
  if (
    canonicalArtifactJson(esbuild) !== canonicalArtifactJson(currentEsbuild) ||
    manifest.toolchain.lockSha256 !== currentEsbuild.lockSha256
  )
    fail('FIREFOX_RELEASE_ESBUILD_IDENTITY');
  assertClosedKeys(
    manifest.gaConfig,
    ['aggregateSha256', 'fingerprints', 'raw'],
    'FIREFOX_RELEASE_GA_IDENTITY'
  );
  const gaKeys = [
    'ZENDIO_GA_MEASUREMENT_ID',
    'ZENDIO_GA_PROXY_ENDPOINT',
    'ZENDIO_GA_TRANSPORT_MODE'
  ];
  assertClosedKeys(manifest.gaConfig.raw, gaKeys, 'FIREFOX_RELEASE_GA_IDENTITY');
  assertClosedKeys(manifest.gaConfig.fingerprints, gaKeys, 'FIREFOX_RELEASE_GA_IDENTITY');
  for (const key of gaKeys) {
    if (
      typeof manifest.gaConfig.raw[key] !== 'string' ||
      sha256Bytes(manifest.gaConfig.raw[key]) !== manifest.gaConfig.fingerprints[key]
    )
      fail('FIREFOX_RELEASE_GA_IDENTITY');
  }
  if (
    sha256Bytes(
      Buffer.from(
        JSON.stringify(
          canonicalize({
            measurementId: manifest.gaConfig.raw.ZENDIO_GA_MEASUREMENT_ID,
            proxyEndpoint: manifest.gaConfig.raw.ZENDIO_GA_PROXY_ENDPOINT,
            transportMode: manifest.gaConfig.raw.ZENDIO_GA_TRANSPORT_MODE
          })
        )
      )
    ) !== manifest.gaConfig.aggregateSha256
  )
    fail('FIREFOX_RELEASE_GA_IDENTITY');
  assertClosedKeys(
    manifest.buildEnvironment,
    ['configMode', 'defaults', 'policy', 'policyDigest'],
    'FIREFOX_RELEASE_BUILD_POLICY'
  );
  if (
    manifest.buildEnvironment.policy !== 'release-build-env-v1' ||
    !/^[0-9a-f]{64}$/u.test(manifest.buildEnvironment.policyDigest ?? '') ||
    sha256Bytes(Buffer.from(JSON.stringify(canonicalize(manifest.buildEnvironment.defaults)))) !==
      manifest.buildEnvironment.policyDigest
  )
    fail('FIREFOX_RELEASE_BUILD_POLICY');
  const defaults = manifest.buildEnvironment.defaults;
  if (
    defaults?.id !== 'release-build-env-v1' ||
    canonicalArtifactJson(defaults.hostPermissions) !==
      canonicalArtifactJson([
        '<all_urls>',
        'http://127.0.0.1/*',
        'https://127.0.0.1/*',
        'https://127.0.0.1:27124/*',
        'http://127.0.0.1:27123/*'
      ]) ||
    canonicalArtifactJson(defaults.sentry) !==
      canonicalArtifactJson({
        dsn: '',
        enabled: false,
        environment: 'production',
        release: manifest.package.version
      })
  )
    fail('FIREFOX_RELEASE_BUILD_POLICY');
  validateInventoryRows(manifest.distInventory);
  if (!Array.isArray(manifest.members) || manifest.members.length !== 2)
    fail('FIREFOX_RELEASE_MEMBER_SET');
  for (const member of manifest.members) {
    assertClosedKeys(
      member,
      ['relativePath', 'role', 'sha256', 'size', 'type', 'zipInventory'],
      'FIREFOX_RELEASE_MEMBER_SCHEMA'
    );
    assertSafeRelativePath(member.relativePath, 'FIREFOX_RELEASE_MEMBER_PATH');
    if (
      !['unsigned-xpi', 'amo-source'].includes(member.role) ||
      member.type !== 'regular' ||
      !Number.isSafeInteger(member.size) ||
      member.size <= 0 ||
      !/^[0-9a-f]{64}$/u.test(member.sha256 ?? '')
    )
      fail('FIREFOX_RELEASE_MEMBER_SCHEMA');
    validateInventoryRows(member.zipInventory, { zip: true });
  }
}

export async function createFirefoxReleaseArtifactManifest({
  releaseDir,
  distDir,
  xpiPath,
  sourceArchivePath,
  git,
  packageMetadata,
  toolchain,
  gaConfig,
  buildEnvironment,
  authorization = {
    authorizationMode: 'standalone-unproven',
    provenance: null,
    releaseEligible: false
  }
}) {
  const configMode = buildEnvironment?.configMode ?? 'standalone-synthetic';
  const normalizedBuildEnvironment = canonicalize({ ...(buildEnvironment ?? {}), configMode });
  const root = realpathSync(resolve(releaseDir));
  const xpi = assertContained(root, xpiPath);
  const source = assertContained(root, sourceArchivePath);
  const xpiBefore = readStableRegularFile(xpi, 0o600);
  const sourceBefore = readStableRegularFile(source, 0o600);
  const [xpiInventory, sourceInventory] = await Promise.all([
    zipInventory(xpi, { xpi: true }),
    zipInventory(source)
  ]);
  const xpiEntries = xpiInventory.rows;
  const sourceEntries = sourceInventory.rows;
  const xpiAfter = readStableRegularFile(xpi, 0o600);
  const sourceAfter = readStableRegularFile(source, 0o600);
  assertStableSnapshot(xpiBefore, xpiAfter, 'FIREFOX_RELEASE_XPI_CHANGED');
  assertStableSnapshot(sourceBefore, sourceAfter, 'FIREFOX_RELEASE_SOURCE_CHANGED');
  if (xpiBefore.stat.dev === sourceBefore.stat.dev && xpiBefore.stat.ino === sourceBefore.stat.ino)
    fail('FIREFOX_RELEASE_MEMBER_ALIAS');
  const distEntries = distInventory(resolve(distDir));
  if (authorization?.authorizationMode === 'attached-ci-provenance-v1') {
    const provenancePath = assertContained(root, join(root, authorization.provenanceRelativePath));
    const provenance = readStableRegularFile(
      provenancePath,
      0o600,
      FIREFOX_RELEASE_ARTIFACT_LIMITS.authorizationBytes
    );
    if (
      !provenance.bytes.equals(
        Buffer.from(canonicalArtifactJson(authorization.provenance), 'utf8')
      ) ||
      sha256Bytes(provenance.bytes) !== authorization.provenanceSha256
    )
      fail('FIREFOX_RELEASE_AUTHORIZATION_FILE');
  }
  if (!sameInventory(xpiEntries, distEntries)) fail('FIREFOX_RELEASE_XPI_DIST_MISMATCH');
  if (
    xpiInventory.geckoId !== packageMetadata?.geckoId ||
    xpiInventory.manifestVersion !== packageMetadata?.manifestVersion
  )
    fail('FIREFOX_RELEASE_XPI_MANIFEST');
  const members = [
    {
      role: 'unsigned-xpi',
      relativePath: basename(xpi),
      type: 'regular',
      size: xpiBefore.bytes.length,
      sha256: sha256Bytes(xpiBefore.bytes),
      zipInventory: xpiEntries
    },
    {
      role: 'amo-source',
      relativePath: basename(source),
      type: 'regular',
      size: sourceBefore.bytes.length,
      sha256: sha256Bytes(sourceBefore.bytes),
      zipInventory: sourceEntries
    }
  ];
  const manifest = canonicalize({
    schema: FIREFOX_RELEASE_ARTIFACT_SCHEMA,
    git,
    package: packageMetadata,
    toolchain,
    gaConfig,
    buildEnvironment: normalizedBuildEnvironment,
    distInventory: distEntries,
    members,
    authorization: validateAuthorization(authorization, git?.head, configMode)
  });
  validateManifestShape(manifest);
  const bytes = Buffer.byteLength(canonicalArtifactJson(manifest));
  if (bytes > FIREFOX_RELEASE_ARTIFACT_LIMITS.manifestBytes) fail('FIREFOX_RELEASE_MANIFEST_LIMIT');
  return deepFreeze(manifest);
}

export async function verifyFirefoxReleaseArtifactManifest({
  manifestPath,
  transportMode,
  expectedAttemptRoot
}) {
  const path = realpathSync(resolve(manifestPath));
  const releaseDir = realpathSync(dirname(path));
  if (expectedAttemptRoot) assertContained(realpathSync(resolve(expectedAttemptRoot)), releaseDir);
  const modes = assertDirectoryTree(releaseDir, transportMode);
  const manifestSnapshot = readStableRegularFile(
    path,
    modes.file,
    FIREFOX_RELEASE_ARTIFACT_LIMITS.manifestBytes
  );
  let manifest;
  try {
    manifest = JSON.parse(manifestSnapshot.bytes.toString('utf8'));
  } catch {
    fail('FIREFOX_RELEASE_MANIFEST_JSON');
  }
  if (canonicalArtifactJson(manifest) !== manifestSnapshot.bytes.toString('utf8')) {
    fail('FIREFOX_RELEASE_MANIFEST_NOT_CANONICAL');
  }
  if (manifest.schema !== FIREFOX_RELEASE_ARTIFACT_SCHEMA) fail('FIREFOX_RELEASE_SCHEMA');
  validateManifestShape(manifest);
  manifest = deepFreeze(canonicalize(manifest));
  validateAuthorization(
    manifest.authorization,
    manifest.git?.head,
    manifest.buildEnvironment?.configMode
  );
  if (!Array.isArray(manifest.members) || manifest.members.length !== 2) {
    fail('FIREFOX_RELEASE_MEMBER_SET');
  }
  const xpiMembers = manifest.members.filter((member) => member?.role === 'unsigned-xpi');
  const sourceMembers = manifest.members.filter((member) => member?.role === 'amo-source');
  if (xpiMembers.length !== 1 || sourceMembers.length !== 1) {
    fail('FIREFOX_RELEASE_MEMBER_ROLE_SET');
  }
  const expectedNames = new Set([
    'manifest.json',
    ...manifest.members.map((row) => row.relativePath),
    ...(manifest.authorization.authorizationMode === 'attached-ci-provenance-v1'
      ? [manifest.authorization.provenanceRelativePath]
      : [])
  ]);
  const actualNames = new Set(readdirSync(releaseDir));
  if (
    actualNames.size !== expectedNames.size ||
    [...expectedNames].some((name) => !actualNames.has(name))
  ) {
    fail('FIREFOX_RELEASE_DIRECTORY_ROSTER');
  }
  const contexts = [];
  for (const member of manifest.members) {
    if (basename(member.relativePath) !== member.relativePath) fail('FIREFOX_RELEASE_MEMBER_PATH');
    const memberPath = assertContained(releaseDir, join(releaseDir, member.relativePath));
    const snapshot = readStableRegularFile(memberPath, modes.file);
    if (snapshot.bytes.length !== member.size || sha256Bytes(snapshot.bytes) !== member.sha256) {
      fail('FIREFOX_RELEASE_MEMBER_DIGEST', member.relativePath);
    }
    const inventoryResult = await zipInventory(memberPath, {
      xpi: member.role === 'unsigned-xpi'
    });
    const inventory = inventoryResult.rows;
    const after = readStableRegularFile(memberPath, modes.file);
    assertStableSnapshot(snapshot, after, 'FIREFOX_RELEASE_MEMBER_IDENTITY_CHANGED');
    if (canonicalArtifactJson(inventory) !== canonicalArtifactJson(member.zipInventory)) {
      fail('FIREFOX_RELEASE_ZIP_INVENTORY', member.relativePath);
    }
    if (
      member.role === 'unsigned-xpi' &&
      (inventoryResult.geckoId !== manifest.package.geckoId ||
        inventoryResult.manifestVersion !== manifest.package.manifestVersion)
    )
      fail('FIREFOX_RELEASE_XPI_MANIFEST');
    contexts.push({ member, memberPath, ...snapshot });
  }
  let provenanceContext;
  if (manifest.authorization.authorizationMode === 'attached-ci-provenance-v1') {
    const provenancePath = join(releaseDir, manifest.authorization.provenanceRelativePath);
    const snapshot = readStableRegularFile(
      provenancePath,
      modes.file,
      FIREFOX_RELEASE_ARTIFACT_LIMITS.authorizationBytes
    );
    if (
      !snapshot.bytes.equals(
        Buffer.from(canonicalArtifactJson(manifest.authorization.provenance), 'utf8')
      ) ||
      sha256Bytes(snapshot.bytes) !== manifest.authorization.provenanceSha256
    )
      fail('FIREFOX_RELEASE_AUTHORIZATION_FILE');
    provenanceContext = { memberPath: provenancePath, ...snapshot };
  }
  const identities = [
    manifestSnapshot,
    ...contexts,
    ...(provenanceContext ? [provenanceContext] : [])
  ].map((entry) => `${entry.stat.dev}:${entry.stat.ino}`);
  if (new Set(identities).size !== identities.length) fail('FIREFOX_RELEASE_MEMBER_ALIAS');
  const xpiContext = contexts.find(({ member }) => member.role === 'unsigned-xpi');
  const sourceContext = contexts.find(({ member }) => member.role === 'amo-source');
  if (
    !xpiContext ||
    !sourceContext ||
    !sameInventory(xpiContext.member.zipInventory, manifest.distInventory)
  ) {
    fail('FIREFOX_RELEASE_XPI_DIST_MISMATCH');
  }
  const manifestAfter = readStableRegularFile(
    path,
    modes.file,
    FIREFOX_RELEASE_ARTIFACT_LIMITS.manifestBytes
  );
  assertStableSnapshot(manifestSnapshot, manifestAfter, 'FIREFOX_RELEASE_MANIFEST_CHANGED');
  const binding = Object.freeze({
    schema: FIREFOX_RELEASE_ARTIFACT_SCHEMA,
    transportMode,
    attemptRoot: expectedAttemptRoot ? realpathSync(resolve(expectedAttemptRoot)) : releaseDir,
    releaseDir,
    geckoId: manifest.package.geckoId,
    xpiPath: xpiContext.memberPath,
    sourceArchivePath: sourceContext.memberPath
  });
  verifiedBindings.add(binding);
  bindingContexts.set(binding, { manifestPath: path, manifestSnapshot, contexts, manifest, modes });
  return binding;
}

export function assertVerifiedFirefoxArtifactBinding(binding) {
  if (!binding || !verifiedBindings.has(binding)) fail('FIREFOX_RELEASE_BINDING_INVALID');
  return binding;
}

export function consumeVerifiedFirefoxArtifactBinding(binding, transportMode) {
  assertVerifiedFirefoxArtifactBinding(binding);
  if (binding.transportMode !== transportMode) fail('FIREFOX_RELEASE_BINDING_MODE');
  if (consumedBindings.has(binding)) fail('FIREFOX_RELEASE_BINDING_CONSUMED');
  const context = bindingContexts.get(binding);
  const manifestLive = readStableRegularFile(context.manifestPath, context.modes.file);
  if (sha256Bytes(manifestLive.bytes) !== sha256Bytes(context.manifestSnapshot.bytes)) {
    fail('FIREFOX_RELEASE_BINDING_DRIFT');
  }
  for (const entry of context.contexts) {
    const live = readStableRegularFile(entry.memberPath, context.modes.file);
    if (
      live.stat.dev !== entry.stat.dev ||
      live.stat.ino !== entry.stat.ino ||
      sha256Bytes(live.bytes) !== entry.member.sha256
    ) {
      fail('FIREFOX_RELEASE_BINDING_DRIFT');
    }
  }
  consumedBindings.add(binding);
  return Object.freeze({
    xpiPath: binding.xpiPath,
    sourceArchivePath: binding.sourceArchivePath,
    geckoId: binding.geckoId,
    transportMode,
    manifest: context.manifest
  });
}

export function getVerifiedFirefoxArtifactSnapshot(binding) {
  assertVerifiedFirefoxArtifactBinding(binding);
  const context = bindingContexts.get(binding);
  const xpi = context.contexts.find(({ member }) => member.role === 'unsigned-xpi');
  return Object.freeze({
    path: xpi.memberPath,
    bytes: Buffer.from(xpi.bytes),
    inventory: xpi.member.zipInventory
  });
}

export function getVerifiedFirefoxArtifactSnapshots(binding) {
  assertVerifiedFirefoxArtifactBinding(binding);
  const context = bindingContexts.get(binding);
  const snapshots = {};
  for (const entry of context.contexts) {
    snapshots[entry.member.role] = Object.freeze({
      path: entry.memberPath,
      bytes: Buffer.from(entry.bytes),
      sha256: entry.member.sha256,
      size: entry.member.size,
      inventory: entry.member.zipInventory,
      device: entry.stat.dev,
      inode: entry.stat.ino,
      uid: entry.stat.uid,
      nlink: entry.stat.nlink,
      mode: entry.stat.mode,
      mtimeMs: entry.stat.mtimeMs,
      ctimeMs: entry.stat.ctimeMs
    });
  }
  snapshots.geckoId = context.manifest.package.geckoId;
  snapshots.manifestVersion = context.manifest.package.manifestVersion;
  return Object.freeze(snapshots);
}
