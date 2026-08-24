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
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { inventoryBoundedZip } from './boundedZipArchive.mjs';

export const FIREFOX_RELEASE_ARTIFACT_SCHEMA = 'portable-release-artifact-v1';
export const FIREFOX_RELEASE_TRANSPORT_MODES = Object.freeze([
  'local-private-v1',
  'github-artifact-v1'
]);

const verifiedBindings = new WeakSet();
const consumedBindings = new WeakSet();
const bindingContexts = new WeakMap();

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

export function canonicalArtifactJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readStableRegularFile(path, expectedMode) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    fail('FIREFOX_RELEASE_MEMBER_NOT_PRIVATE_REGULAR', path);
  }
  if ((before.mode & 0o777) !== expectedMode) fail('FIREFOX_RELEASE_MEMBER_MODE', path);
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const fd = openSync(path, flags);
  try {
    const opened = fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) {
      fail('FIREFOX_RELEASE_MEMBER_IDENTITY_CHANGED', path);
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const live = lstatSync(path);
    if (
      opened.dev !== after.dev ||
      opened.ino !== after.ino ||
      opened.size !== after.size ||
      after.dev !== live.dev ||
      after.ino !== live.ino ||
      after.size !== live.size
    ) {
      fail('FIREFOX_RELEASE_MEMBER_IDENTITY_CHANGED', path);
    }
    return {
      bytes,
      stat: { dev: opened.dev, ino: opened.ino, size: opened.size, mode: opened.mode & 0o777 }
    };
  } finally {
    closeSync(fd);
  }
}

function assertContained(root, path) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
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
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('FIREFOX_RELEASE_ROOT_TYPE');
  if ((rootStat.mode & 0o777) !== modes.directory) fail('FIREFOX_RELEASE_ROOT_MODE');
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) fail('FIREFOX_RELEASE_SYMLINK', path);
      if (entry.isDirectory()) {
        if ((stat.mode & 0o777) !== modes.directory) fail('FIREFOX_RELEASE_DIRECTORY_MODE', path);
        visit(path);
      } else if (!entry.isFile()) {
        fail('FIREFOX_RELEASE_SPECIAL_ENTRY', path);
      }
    }
  };
  visit(root);
  return modes;
}

async function zipInventory(path) {
  const inventory = await inventoryBoundedZip(path);
  return inventory.entries.map((entry) => ({
    path: entry.path,
    directory: entry.directory,
    size: entry.uncompressedSize,
    crc32: entry.crc32,
    sha256: entry.directory ? null : sha256Bytes(entry.content)
  }));
}

function distInventory(root) {
  const rows = [];
  const visit = (dir) => {
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
        rows.push({
          path: relativePath,
          directory: false,
          size: stat.size,
          sha256: sha256Bytes(readFileSync(path))
        });
      } else fail('FIREFOX_RELEASE_DIST_SPECIAL_ENTRY', path);
    }
  };
  visit(root);
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
  authorization = { mode: 'standalone-unproven', provenance: null, releaseEligible: false }
}) {
  const root = resolve(releaseDir);
  const xpi = assertContained(root, xpiPath);
  const source = assertContained(root, sourceArchivePath);
  const [xpiBytes, sourceBytes, xpiEntries, sourceEntries] = await Promise.all([
    readFile(xpi),
    readFile(source),
    zipInventory(xpi),
    zipInventory(source)
  ]);
  const distEntries = distInventory(resolve(distDir));
  if (!sameInventory(xpiEntries, distEntries)) fail('FIREFOX_RELEASE_XPI_DIST_MISMATCH');
  const members = [
    {
      role: 'unsigned-xpi',
      relativePath: basename(xpi),
      type: 'regular',
      size: xpiBytes.length,
      sha256: sha256Bytes(xpiBytes),
      zipInventory: xpiEntries
    },
    {
      role: 'amo-source',
      relativePath: basename(source),
      type: 'regular',
      size: sourceBytes.length,
      sha256: sha256Bytes(sourceBytes),
      zipInventory: sourceEntries
    }
  ];
  return canonicalize({
    schema: FIREFOX_RELEASE_ARTIFACT_SCHEMA,
    git,
    package: packageMetadata,
    toolchain,
    gaConfig,
    buildEnvironment,
    distInventory: distEntries,
    members,
    authorization
  });
}

export async function verifyFirefoxReleaseArtifactManifest({
  manifestPath,
  transportMode,
  expectedAttemptRoot
}) {
  const path = resolve(manifestPath);
  const releaseDir = dirname(path);
  if (expectedAttemptRoot) assertContained(resolve(expectedAttemptRoot), releaseDir);
  const modes = assertDirectoryTree(releaseDir, transportMode);
  const manifestSnapshot = readStableRegularFile(path, modes.file);
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
    ...manifest.members.map((row) => row.relativePath)
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
    const inventory = await zipInventory(memberPath);
    if (canonicalArtifactJson(inventory) !== canonicalArtifactJson(member.zipInventory)) {
      fail('FIREFOX_RELEASE_ZIP_INVENTORY', member.relativePath);
    }
    contexts.push({ member, memberPath, ...snapshot });
  }
  const xpiContext = contexts.find(({ member }) => member.role === 'unsigned-xpi');
  const sourceContext = contexts.find(({ member }) => member.role === 'amo-source');
  if (
    !xpiContext ||
    !sourceContext ||
    !sameInventory(xpiContext.member.zipInventory, manifest.distInventory)
  ) {
    fail('FIREFOX_RELEASE_XPI_DIST_MISMATCH');
  }
  const binding = Object.freeze({
    schema: FIREFOX_RELEASE_ARTIFACT_SCHEMA,
    transportMode,
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
