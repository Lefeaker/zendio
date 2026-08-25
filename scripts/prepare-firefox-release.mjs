import { createHash } from 'node:crypto';
import { chmod, link, lstat, mkdir, open, readFile, rm, unlink, writeFile } from 'node:fs/promises';
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
    (stat.mode & 0o777) !== 0o700
  ) {
    fail('FIREFOX_RELEASE_PRIVATE_DIRECTORY', path);
  }
}

async function assertOwnedDirectory(path) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.()) {
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
      authorizationMode: 'standalone-unproven',
      provenance: null,
      releaseEligible: false
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
  const bytes = await readFile(recordPath);
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
    authorizationMode: 'attached-ci-provenance-v1',
    provenance: record,
    provenanceSha256: sha256(bytes),
    releaseEligible: false
  };
}

async function publishExistingArchive(sourcePath, finalPath) {
  try {
    await lstat(finalPath);
    fail('FIREFOX_RELEASE_TARGET_EXISTS', finalPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await chmod(sourcePath, 0o600);
  const handle = await open(sourcePath, 'r');
  try {
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
}

export async function prepareFirefoxRelease(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args['--transport-mode'] !== 'local-private-v1') fail('FIREFOX_RELEASE_TRANSPORT_MODE');
  const attemptRoot = resolve(args['--attempt-root']);
  const distDir = assertContained(attemptRoot, args['--dist-dir']);
  const releaseDir = assertContained(attemptRoot, args['--release-dir']);
  const resultPath = assertContained(attemptRoot, args['--result-json']);
  if (basename(releaseDir) !== 'release') fail('FIREFOX_RELEASE_DIRECTORY_NAME');
  const releaseHead = gitValue(['rev-parse', 'HEAD']);
  const authorization = await resolveAuthorization(args, attemptRoot, releaseHead);
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
    const gaConfig = {
      measurementIdSha256: sha256(process.env.ZENDIO_GA_MEASUREMENT_ID ?? ''),
      transportModeSha256: sha256(process.env.ZENDIO_GA_TRANSPORT_MODE ?? ''),
      proxyEndpointSha256: sha256(process.env.ZENDIO_GA_PROXY_ENDPOINT ?? '')
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
        esbuild: lock.packages?.['node_modules/esbuild']?.version,
        lockSha256: sha256(lockBytes)
      },
      gaConfig,
      buildEnvironment: { policy: 'release-build-env-v1', configMode: args['--config-mode'] },
      authorization
    });
    const manifestPath = join(releaseDir, 'manifest.json');
    await writeFile(manifestPath, canonicalArtifactJson(manifest), { flag: 'wx', mode: 0o600 });
    const manifestHandle = await open(manifestPath, 'r');
    try {
      await manifestHandle.sync();
    } finally {
      await manifestHandle.close();
    }
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
    await writeFile(resultPath, canonicalArtifactJson(result), { flag: 'wx', mode: 0o600 });
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
