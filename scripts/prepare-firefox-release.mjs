import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { chmod, link, lstat, mkdir, open, readFile, realpath, rm, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { prepareFirefoxReleasePackage } from './package-firefox.mjs';
import {
  auditFirefoxAmoSourceArchive,
  createFirefoxAmoSourceArchive
} from './utils/firefoxAmoSourceArchive.mjs';
import {
  canonicalArtifactJson,
  createFirefoxReleaseArtifactManifest,
  verifyFirefoxReleaseArtifactManifest
} from './utils/firefoxReleaseArtifactManifest.mjs';
import {
  STANDALONE_SYNTHETIC_CONFIG,
  validateReleasePublicBuildConfig
} from './utils/releasePublicBuildConfig.mjs';

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function parseArgs(argv) {
  const allowed = new Set([
    '--attempt-root',
    '--config-mode',
    '--dist-dir',
    '--release-dir',
    '--result-json',
    '--transport-mode',
    '--authorization-record'
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith('--') || values.has(key)) {
      fail('FIREFOX_RELEASE_ARGUMENT_CONTRACT');
    }
    values.set(key, value);
  }
  const parsed = Object.fromEntries(values);
  if (!['standalone-synthetic', 'owner-public-vars'].includes(parsed['--config-mode'])) {
    fail('FIREFOX_RELEASE_CONFIG_MODE');
  }
  const hasAuthorization = values.has('--authorization-record');
  if (hasAuthorization !== (parsed['--config-mode'] === 'owner-public-vars')) {
    fail('FIREFOX_RELEASE_AUTHORIZATION_MODE');
  }
  if (values.size !== (hasAuthorization ? 7 : 6)) fail('FIREFOX_RELEASE_ARGUMENT_CONTRACT');
  return parsed;
}

async function assertPrivateDirectory(path) {
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o777) !== 0o700 ||
    (await realpath(path)) !== path
  ) {
    fail('FIREFOX_RELEASE_PRIVATE_DIRECTORY', path);
  }
}

async function assertOwnedDirectory(path) {
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (await realpath(path)) !== path
  ) {
    fail('FIREFOX_RELEASE_OWNED_DIRECTORY', path);
  }
}

function assertContained(root, path) {
  const rootPath = resolve(root);
  const target = resolve(path);
  if (!target.startsWith(`${rootPath}${sep}`)) fail('FIREFOX_RELEASE_PATH_ESCAPE', target);
  return target;
}

function gitValue(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) fail('FIREFOX_RELEASE_GIT_STATE');
  return result.stdout.trim();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

async function resolveAuthorization(args, attemptRoot, releaseHead) {
  if (args['--config-mode'] === 'standalone-synthetic') {
    return {
      authorization: {
        authorizationMode: 'standalone-unproven',
        provenance: null,
        releaseEligible: false
      },
      provenanceBytes: null
    };
  }
  const recordPath = assertContained(attemptRoot, args['--authorization-record']);
  const stat = await lstat(recordPath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o777) !== 0o600
  ) {
    fail('FIREFOX_RELEASE_AUTHORIZATION_FILE');
  }
  const handle = await open(recordPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  let bytes;
  try {
    const opened = await handle.stat();
    if (
      opened.dev !== stat.dev ||
      opened.ino !== stat.ino ||
      opened.size !== stat.size ||
      opened.mode !== stat.mode
    )
      fail('FIREFOX_RELEASE_AUTHORIZATION_CHANGED');
    bytes = await handle.readFile();
    const after = await handle.stat();
    const live = await lstat(recordPath);
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      live.dev !== opened.dev ||
      live.ino !== opened.ino
    )
      fail('FIREFOX_RELEASE_AUTHORIZATION_CHANGED');
  } finally {
    await handle.close();
  }
  if (bytes.length === 0 || bytes.length > 256 * 1024) {
    fail('FIREFOX_RELEASE_AUTHORIZATION_FILE');
  }
  let record;
  try {
    record = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('FIREFOX_RELEASE_AUTHORIZATION_JSON');
  }
  if (
    !isPlainObject(record) ||
    canonicalArtifactJson(record) !== bytes.toString('utf8') ||
    typeof record.schema !== 'string' ||
    record.schema.length === 0 ||
    Buffer.byteLength(record.schema, 'utf8') > 128 ||
    !/^[0-9a-f]{40}$/u.test(record.releaseSha ?? '') ||
    record.releaseSha !== releaseHead ||
    Object.hasOwn(record, 'releaseEligible')
  ) {
    fail('FIREFOX_RELEASE_AUTHORIZATION_INVALID');
  }
  return {
    authorization: {
      authorizationMode: 'attached-ci-provenance-v1',
      provenance: record,
      provenanceRelativePath: 'ci-provenance.json',
      provenanceSha256: sha256(bytes),
      releaseEligible: false
    },
    provenanceBytes: bytes
  };
}

async function publishExistingArchive(sourcePath, finalPath) {
  try {
    await lstat(finalPath);
    fail('FIREFOX_RELEASE_TARGET_EXISTS', finalPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const sourceBefore = await lstat(sourcePath);
  if (
    !sourceBefore.isFile() ||
    sourceBefore.isSymbolicLink() ||
    sourceBefore.uid !== process.getuid?.() ||
    sourceBefore.nlink !== 1 ||
    (await realpath(sourcePath)) !== sourcePath
  )
    fail('FIREFOX_RELEASE_SOURCE_PUBLICATION_INVALID');
  await chmod(sourcePath, 0o600);
  const handle = await open(sourcePath, 'r');
  let opened;
  let sourceDigest;
  try {
    opened = await handle.stat();
    sourceDigest = sha256(await handle.readFile());
    await handle.sync();
  } finally {
    await handle.close();
  }
  await link(sourcePath, finalPath);
  const dirHandle = await open(dirname(finalPath), 'r');
  try {
    await dirHandle.sync();
  } finally {
    await dirHandle.close();
  }
  await unlink(sourcePath);
  const cleanupDirHandle = await open(dirname(finalPath), 'r');
  try {
    await cleanupDirHandle.sync();
  } finally {
    await cleanupDirHandle.close();
  }
  const published = await lstat(finalPath);
  if (
    !published.isFile() ||
    published.isSymbolicLink() ||
    published.uid !== process.getuid?.() ||
    published.nlink !== 1 ||
    (published.mode & 0o777) !== 0o600 ||
    published.dev !== opened.dev ||
    published.ino !== opened.ino ||
    sha256(await readFile(finalPath)) !== sourceDigest
  )
    fail('FIREFOX_RELEASE_SOURCE_PUBLICATION_INVALID');
}

async function publishCanonicalJsonNoReplace(path, value) {
  const bytes = Buffer.from(canonicalArtifactJson(value), 'utf8');
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.publication`);
  const handle = await open(
    temp,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0),
    0o600
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temp, path);
    const directory = await open(dirname(path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await unlink(temp).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    const directory = await open(dirname(path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  const published = await readFile(path);
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o777) !== 0o600 ||
    !published.equals(bytes)
  )
    fail('FIREFOX_RELEASE_PUBLICATION_CHANGED');
}

export async function prepareFirefoxRelease(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args['--transport-mode'] !== 'local-private-v1') fail('FIREFOX_RELEASE_TRANSPORT_MODE');
  const declaredAttemptRoot = resolve(args['--attempt-root']);
  if (declaredAttemptRoot !== args['--attempt-root']) fail('FIREFOX_RELEASE_ATTEMPT_ROOT');
  const attemptRoot = await realpath(declaredAttemptRoot);
  if (attemptRoot !== declaredAttemptRoot) fail('FIREFOX_RELEASE_ATTEMPT_ROOT');
  const distDir = assertContained(attemptRoot, args['--dist-dir']);
  const releaseDir = assertContained(attemptRoot, args['--release-dir']);
  const resultPath = assertContained(attemptRoot, args['--result-json']);
  if (
    new Set([
      distDir,
      releaseDir,
      resultPath,
      ...(args['--authorization-record']
        ? [assertContained(attemptRoot, args['--authorization-record'])]
        : [])
    ]).size !== (args['--authorization-record'] ? 4 : 3)
  )
    fail('FIREFOX_RELEASE_PATH_ALIAS');
  if (basename(releaseDir) !== 'release') fail('FIREFOX_RELEASE_DIRECTORY_NAME');
  const releaseHead = gitValue(['rev-parse', 'HEAD']);
  const authorizationInput = await resolveAuthorization(args, attemptRoot, releaseHead);
  await assertPrivateDirectory(attemptRoot);
  await assertPrivateDirectory(dirname(releaseDir));
  await assertOwnedDirectory(distDir);
  if (gitValue(['status', '--porcelain=v1', '--untracked-files=all']) !== '') {
    fail('FIREFOX_RELEASE_DIRTY_TREE');
  }
  try {
    await lstat(releaseDir);
    fail('FIREFOX_RELEASE_DIRECTORY_EXISTS');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const workDir = join(dirname(releaseDir), `.${basename(releaseDir)}.work`);
  try {
    await lstat(workDir);
    fail('FIREFOX_RELEASE_WORK_EXISTS');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await mkdir(releaseDir, { mode: 0o700 });
  await mkdir(workDir, { mode: 0o700 });
  if (authorizationInput.provenanceBytes) {
    await publishCanonicalJsonNoReplace(
      join(releaseDir, authorizationInput.authorization.provenanceRelativePath),
      authorizationInput.authorization.provenance
    );
  }

  let success = false;
  try {
    const packaged = await prepareFirefoxReleasePackage({
      distDir,
      publication: { mode: 'release-no-replace-v1', outputDir: releaseDir, workDir }
    });
    const sourceArchive = await createFirefoxAmoSourceArchive({
      repoRoot: process.cwd(),
      outputDir: workDir,
      artifactBaseName: packaged.artifactBaseName,
      releaseXpiName: packaged.xpiName,
      version: packaged.version
    });
    await auditFirefoxAmoSourceArchive(sourceArchive.archivePath);
    const sourceFinalPath = join(releaseDir, sourceArchive.archiveName);
    await publishExistingArchive(sourceArchive.archivePath, sourceFinalPath);

    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
    const lockBytes = await readFile('package-lock.json');
    const lock = JSON.parse(lockBytes.toString('utf8'));
    const npmVersion = spawnSync('npm', ['--version'], { encoding: 'utf8' });
    if (npmVersion.status !== 0) fail('FIREFOX_RELEASE_NPM_VERSION');
    const publicConfig = validateReleasePublicBuildConfig({
      configMode: args['--config-mode'],
      environment:
        args['--config-mode'] === 'standalone-synthetic'
          ? {
              ...process.env,
              ZENDIO_GA_MEASUREMENT_ID: STANDALONE_SYNTHETIC_CONFIG.measurementId,
              ZENDIO_GA_TRANSPORT_MODE: STANDALONE_SYNTHETIC_CONFIG.transportMode,
              ZENDIO_GA_PROXY_ENDPOINT: STANDALONE_SYNTHETIC_CONFIG.proxyEndpoint
            }
          : process.env,
      repoRoot: process.cwd()
    });
    const gaConfig = {
      raw: publicConfig.rawValues,
      fingerprints: publicConfig.rawFingerprints,
      aggregateSha256: publicConfig.fingerprint
    };
    const manifest = await createFirefoxReleaseArtifactManifest({
      releaseDir,
      distDir,
      xpiPath: packaged.outputPath,
      sourceArchivePath: sourceFinalPath,
      git: { head: releaseHead, tree: gitValue(['rev-parse', 'HEAD^{tree}']) },
      packageMetadata: {
        version: packageJson.version,
        manifestVersion: packaged.manifest.version,
        geckoId: packaged.manifest.browser_specific_settings?.gecko?.id
      },
      toolchain: {
        node: process.version,
        npm: npmVersion.stdout.trim(),
        webExt: lock.packages?.['node_modules/web-ext']?.version,
        esbuild: publicConfig.esbuild,
        lockSha256: sha256(lockBytes)
      },
      gaConfig,
      buildEnvironment: {
        policy: publicConfig.policy.id,
        policyDigest: publicConfig.policyDigest,
        defaults: publicConfig.policy,
        configMode: args['--config-mode']
      },
      authorization: authorizationInput.authorization
    });
    const manifestPath = join(releaseDir, 'manifest.json');
    await publishCanonicalJsonNoReplace(manifestPath, manifest);
    await verifyFirefoxReleaseArtifactManifest({
      manifestPath,
      transportMode: 'local-private-v1',
      expectedAttemptRoot: attemptRoot
    });
    const result = {
      schema: 'firefox-release-prepare-result-v1',
      manifestPath,
      releaseDir,
      xpiPath: packaged.outputPath,
      sourceArchivePath: sourceFinalPath
    };
    await publishCanonicalJsonNoReplace(resultPath, result);
    success = true;
    return result;
  } finally {
    if (success) await rm(workDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareFirefoxRelease().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}
