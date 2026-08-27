import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync
} from 'node:fs';
import { appendFile, open, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inventoryBoundedZip } from './boundedZipArchive.mjs';
import { canonicalReleaseProvenanceJson, releaseProvenanceSha256 } from './releaseCiProvenance.mjs';

export const RELEASE_ARTIFACT_SCHEMA = 'portable-release-artifact-v1';
export const RELEASE_ARTIFACT_TRANSPORT_MODES = Object.freeze([
  'local-private-v1',
  'github-artifact-v1'
]);
export const RELEASE_ARTIFACT_LIMITS = Object.freeze({
  authorizationBytes: 256 * 1024,
  manifestBytes: 16 * 1024 * 1024,
  resultBytes: 64 * 1024,
  artifactBytes: 64 * 1024 * 1024,
  maximumDepth: 32,
  maximumRows: 4_096,
  maximumPathBytes: 1_024,
  maximumStringBytes: 4_096
});

const verifiedBindings = new WeakSet();
const consumedBindings = new WeakSet();
const bindingSnapshots = new WeakMap();

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function validateValue(value, depth = 0) {
  if (depth > RELEASE_ARTIFACT_LIMITS.maximumDepth) fail('RELEASE_ARTIFACT_DEPTH');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > RELEASE_ARTIFACT_LIMITS.maximumStringBytes) {
      fail('RELEASE_ARTIFACT_STRING_LIMIT');
    }
  } else if (Array.isArray(value)) {
    if (value.length > RELEASE_ARTIFACT_LIMITS.maximumRows) fail('RELEASE_ARTIFACT_ROW_LIMIT');
    for (const entry of value) validateValue(entry, depth + 1);
  } else if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      validateValue(key, depth + 1);
      validateValue(entry, depth + 1);
    }
  }
}

export function canonicalReleaseArtifactJson(value) {
  validateValue(value);
  const bytes = `${JSON.stringify(canonicalize(value), null, 2)}\n`;
  if (Buffer.byteLength(bytes, 'utf8') > RELEASE_ARTIFACT_LIMITS.manifestBytes) {
    fail('RELEASE_ARTIFACT_MANIFEST_LIMIT');
  }
  return bytes;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function normalizeUploadArtifactDigestOutput(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    fail('ARTIFACT_DIGEST_INVALID');
  }
  return `sha256:${value}`;
}

export function parseRestArtifactDigest(value) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    fail('ARTIFACT_DIGEST_INVALID');
  }
  return value;
}

export function parseCanonicalActionArtifactId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/u.test(value)) {
    fail('ARTIFACT_ID_INVALID');
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || String(number) !== value) fail('ARTIFACT_ID_INVALID');
  return value;
}

export function parseCanonicalRestArtifactId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) fail('ARTIFACT_ID_INVALID');
  const text = String(value);
  if (!/^[1-9][0-9]{0,15}$/u.test(text)) fail('ARTIFACT_ID_INVALID');
  return text;
}

function assertContained(root, path) {
  const canonicalRoot = resolve(root);
  const canonicalPath = resolve(path);
  if (!canonicalPath.startsWith(`${canonicalRoot}${sep}`)) fail('RELEASE_ARTIFACT_PATH_ESCAPE');
  return canonicalPath;
}

function expectedModes(transportMode) {
  if (!RELEASE_ARTIFACT_TRANSPORT_MODES.includes(transportMode)) {
    fail('RELEASE_ARTIFACT_TRANSPORT_INVALID');
  }
  return transportMode === 'local-private-v1'
    ? { directory: 0o700, file: 0o600 }
    : { directory: 0o755, file: 0o644 };
}

function stableFile(path, expectedMode, maximumBytes) {
  const before = lstatSync(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    (before.mode & 0o777) !== expectedMode ||
    before.size > maximumBytes
  ) {
    fail('RELEASE_ARTIFACT_FILE_INVALID', path);
  }
  const fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const live = lstatSync(path);
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size ||
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      live.dev !== opened.dev ||
      live.ino !== opened.ino ||
      live.size !== opened.size
    ) {
      fail('RELEASE_ARTIFACT_FILE_CHANGED', path);
    }
    return {
      bytes,
      stats: Object.freeze({
        device: opened.dev,
        inode: opened.ino,
        size: opened.size,
        mode: opened.mode & 0o777
      }),
      sha256: sha256(bytes)
    };
  } finally {
    closeSync(fd);
  }
}

function assertDirectoryTree(root, transportMode) {
  const modes = expectedModes(transportMode);
  const identities = new Set();
  const visit = (path) => {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== modes.directory) {
      fail('RELEASE_ARTIFACT_DIRECTORY_INVALID', path);
    }
    const identity = `${stat.dev}:${stat.ino}`;
    if (identities.has(identity)) fail('RELEASE_ARTIFACT_DIRECTORY_ALIAS');
    identities.add(identity);
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (!entry.isFile()) fail('RELEASE_ARTIFACT_SPECIAL_ENTRY', child);
    }
  };
  visit(root);
  return modes;
}

async function zipRows(path) {
  const inventory = await inventoryBoundedZip(path);
  return inventory.entries.map((entry) => ({
    path: entry.path,
    directory: entry.directory,
    size: entry.uncompressedSize,
    crc32: entry.crc32,
    sha256: entry.directory || entry.content === null ? null : sha256(entry.content)
  }));
}

function normalizeAuthorization(authorization, configMode, releaseSha) {
  if (configMode === 'standalone-synthetic') {
    const value = authorization ?? {
      authorizationMode: 'standalone-unproven',
      provenance: null,
      releaseEligible: false
    };
    if (
      JSON.stringify(Object.keys(value).sort()) !==
        JSON.stringify(['authorizationMode', 'provenance', 'releaseEligible'].sort()) ||
      value.authorizationMode !== 'standalone-unproven' ||
      value.provenance !== null ||
      value.releaseEligible !== false
    ) {
      fail('RELEASE_AUTHORIZATION_MODE_INVALID');
    }
    return canonicalize(value);
  }
  if (configMode !== 'owner-public-vars') fail('RELEASE_CONFIG_MODE_INVALID');
  if (
    !isPlainObject(authorization) ||
    authorization.authorizationMode !== 'attached-ci-provenance-v1' ||
    !isPlainObject(authorization.provenance) ||
    authorization.provenance.releaseSha !== releaseSha ||
    authorization.provenanceSha256 !== releaseProvenanceSha256(authorization.provenance) ||
    authorization.releaseEligible !== false
  ) {
    fail('RELEASE_AUTHORIZATION_MODE_INVALID');
  }
  return canonicalize(authorization);
}

export async function createChromeReleaseArtifactManifest(options) {
  const root = resolve(options.releaseDir);
  const zipPath = assertContained(root, options.zipPath);
  const zipBytes = await readFile(zipPath);
  if (zipBytes.length > RELEASE_ARTIFACT_LIMITS.artifactBytes) fail('RELEASE_ARTIFACT_LIMIT');
  const inventory = await zipRows(zipPath);
  const configMode = options.buildConfig?.configMode;
  const authorization = normalizeAuthorization(
    options.authorization,
    configMode,
    options.git?.head
  );
  const members = [
    {
      role: 'extension-zip',
      relativePath: basename(zipPath),
      type: 'regular',
      size: zipBytes.length,
      sha256: sha256(zipBytes),
      zipInventory: inventory
    }
  ];
  if (authorization.authorizationMode === 'attached-ci-provenance-v1') {
    if (!options.provenancePath) fail('RELEASE_PROVENANCE_MEMBER_MISSING');
    const provenancePath = assertContained(root, options.provenancePath);
    const bytes = await readFile(provenancePath);
    if (canonicalReleaseProvenanceJson(authorization.provenance) !== bytes.toString('utf8')) {
      fail('RELEASE_PROVENANCE_MEMBER_INVALID');
    }
    members.push({
      role: 'ci-provenance',
      relativePath: basename(provenancePath),
      type: 'regular',
      size: bytes.length,
      sha256: sha256(bytes)
    });
  } else if (options.provenancePath !== undefined) {
    fail('RELEASE_PROVENANCE_MEMBER_FORBIDDEN');
  }
  const manifest = canonicalize({
    schema: RELEASE_ARTIFACT_SCHEMA,
    browser: 'chrome',
    repository: options.repository,
    git: options.git,
    package: options.packageMetadata,
    buildConfig: options.buildConfig,
    authorization,
    members
  });
  canonicalReleaseArtifactJson(manifest);
  return manifest;
}

function compareSnapshot(path, snapshot) {
  const current = stableFile(path, snapshot.stats.mode, RELEASE_ARTIFACT_LIMITS.artifactBytes);
  if (
    current.stats.device !== snapshot.stats.device ||
    current.stats.inode !== snapshot.stats.inode ||
    current.stats.size !== snapshot.stats.size ||
    current.sha256 !== snapshot.sha256
  ) {
    fail('RELEASE_ARTIFACT_BINDING_DRIFT');
  }
}

export async function verifyChromeReleaseArtifactManifest(options) {
  const manifestPath = resolve(options.manifestPath);
  const releaseDir = dirname(manifestPath);
  if (options.expectedAttemptRoot)
    assertContained(resolve(options.expectedAttemptRoot), releaseDir);
  const modes = assertDirectoryTree(releaseDir, options.transportMode);
  const manifestSnapshot = stableFile(
    manifestPath,
    modes.file,
    RELEASE_ARTIFACT_LIMITS.manifestBytes
  );
  if (
    process.env.ZENDIO_EXPECTED_RELEASE_MANIFEST_SHA256 &&
    process.env.ZENDIO_EXPECTED_RELEASE_MANIFEST_SHA256 !== manifestSnapshot.sha256
  ) {
    fail('RELEASE_MANIFEST_DIGEST_MISMATCH');
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestSnapshot.bytes.toString('utf8'));
  } catch {
    fail('RELEASE_ARTIFACT_MANIFEST_JSON');
  }
  if (canonicalReleaseArtifactJson(manifest) !== manifestSnapshot.bytes.toString('utf8')) {
    fail('RELEASE_ARTIFACT_MANIFEST_NOT_CANONICAL');
  }
  if (manifest.schema !== RELEASE_ARTIFACT_SCHEMA || manifest.browser !== 'chrome') {
    fail('RELEASE_ARTIFACT_SCHEMA_INVALID');
  }
  normalizeAuthorization(
    manifest.authorization,
    manifest.buildConfig?.configMode,
    manifest.git?.head
  );
  if (!Array.isArray(manifest.members)) fail('RELEASE_ARTIFACT_MEMBER_SET');
  const roles = manifest.members.map((member) => member?.role);
  const expectedRoles =
    manifest.authorization.authorizationMode === 'attached-ci-provenance-v1'
      ? ['extension-zip', 'ci-provenance']
      : ['extension-zip'];
  if (JSON.stringify([...roles].sort()) !== JSON.stringify([...expectedRoles].sort())) {
    fail('RELEASE_ARTIFACT_MEMBER_SET');
  }
  const expectedNames = new Set(['manifest.json']);
  const snapshots = new Map();
  for (const member of manifest.members) {
    if (
      !isPlainObject(member) ||
      basename(member.relativePath) !== member.relativePath ||
      Buffer.byteLength(member.relativePath, 'utf8') > RELEASE_ARTIFACT_LIMITS.maximumPathBytes
    ) {
      fail('RELEASE_ARTIFACT_MEMBER_PATH');
    }
    expectedNames.add(member.relativePath);
    const path = assertContained(releaseDir, join(releaseDir, member.relativePath));
    const snapshot = stableFile(path, modes.file, RELEASE_ARTIFACT_LIMITS.artifactBytes);
    if (snapshot.stats.size !== member.size || snapshot.sha256 !== member.sha256) {
      fail('RELEASE_ARTIFACT_MEMBER_DIGEST');
    }
    snapshots.set(member.role, { path, ...snapshot });
    if (member.role === 'extension-zip') {
      const rows = await zipRows(path);
      if (
        canonicalReleaseArtifactJson(rows) !== canonicalReleaseArtifactJson(member.zipInventory)
      ) {
        fail('RELEASE_ARTIFACT_ZIP_INVENTORY');
      }
    } else if (
      canonicalReleaseProvenanceJson(manifest.authorization.provenance) !==
      snapshot.bytes.toString('utf8')
    ) {
      fail('RELEASE_PROVENANCE_MEMBER_INVALID');
    }
  }
  const actualNames = new Set(readdirSync(releaseDir));
  if (
    actualNames.size !== expectedNames.size ||
    [...expectedNames].some((name) => !actualNames.has(name))
  ) {
    fail('RELEASE_ARTIFACT_DIRECTORY_ROSTER');
  }
  const identities = new Set(
    [manifestSnapshot, ...snapshots.values()].map(
      (snapshot) => `${snapshot.stats.device}:${snapshot.stats.inode}`
    )
  );
  if (identities.size !== snapshots.size + 1) fail('RELEASE_ARTIFACT_FILE_ALIAS');
  const zip = snapshots.get('extension-zip');
  const binding = Object.freeze({
    schema: RELEASE_ARTIFACT_SCHEMA,
    browser: 'chrome',
    transportMode: options.transportMode,
    releaseDir,
    manifestPath,
    zipPath: zip.path,
    releaseSha: manifest.git.head,
    releaseTree: manifest.git.tree,
    packageVersion: manifest.package.version,
    authorizationMode: manifest.authorization.authorizationMode
  });
  verifiedBindings.add(binding);
  bindingSnapshots.set(binding, {
    manifest,
    manifestSnapshot,
    zipSnapshot: zip
  });
  return binding;
}

export function assertVerifiedChromeArtifactBinding(binding) {
  if (!verifiedBindings.has(binding) || consumedBindings.has(binding)) {
    fail('RELEASE_ARTIFACT_BINDING_INVALID');
  }
  const snapshots = bindingSnapshots.get(binding);
  compareSnapshot(binding.manifestPath, snapshots.manifestSnapshot);
  compareSnapshot(binding.zipPath, snapshots.zipSnapshot);
  return binding;
}

export function consumeVerifiedChromeArtifactBinding(binding, transportMode) {
  const verified = assertVerifiedChromeArtifactBinding(binding);
  if (verified.transportMode !== transportMode) fail('RELEASE_ARTIFACT_TRANSPORT_INVALID');
  consumedBindings.add(binding);
  const snapshots = bindingSnapshots.get(binding);
  return Object.freeze({
    binding,
    manifest: snapshots.manifest,
    zipPath: binding.zipPath,
    zipBytes: Buffer.from(snapshots.zipSnapshot.bytes),
    zipSha256: snapshots.zipSnapshot.sha256
  });
}

export async function writeCanonicalReleaseFile(
  path,
  value,
  maximumBytes = RELEASE_ARTIFACT_LIMITS.resultBytes
) {
  const bytes = canonicalReleaseArtifactJson(value);
  if (Buffer.byteLength(bytes, 'utf8') > maximumBytes) fail('RELEASE_ARTIFACT_WRITE_LIMIT');
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(bytes, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  const directory = await open(dirname(path), 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  return resolve(path);
}

async function appendGithubOutput(key, value, environment) {
  const output = environment.GITHUB_OUTPUT;
  if (
    !output ||
    !resolve(output).startsWith(`${resolve(environment.RUNNER_TEMP ?? dirname(output))}${sep}`)
  ) {
    fail('RELEASE_GITHUB_OUTPUT_INVALID');
  }
  await appendFile(output, `${key}=${value}\n`, { encoding: 'utf8' });
}

export async function runReleaseArtifactUtilityCli(
  argv = process.argv.slice(2),
  environment = process.env
) {
  if (argv.length !== 2) fail('RELEASE_ARTIFACT_UTILITY_ARGUMENTS_INVALID');
  if (argv[0] === '--validate-upload-artifact-id') {
    const value = parseCanonicalActionArtifactId(argv[1]);
    await appendGithubOutput('artifact_id', value, environment);
    return value;
  }
  if (argv[0] === '--normalize-upload-artifact-digest') {
    const value = normalizeUploadArtifactDigestOutput(argv[1]);
    await appendGithubOutput('artifact_digest', value, environment);
    return value;
  }
  fail('RELEASE_ARTIFACT_UTILITY_ARGUMENTS_INVALID');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReleaseArtifactUtilityCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
