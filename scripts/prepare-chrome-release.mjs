import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, link, lstat, mkdir, open, readFile, readdir, rm, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createChromeReleaseArtifactManifest,
  verifyChromeReleaseArtifactManifest,
  writeCanonicalReleaseFile
} from './utils/releaseArtifactManifest.mjs';
import {
  canonicalReleaseProvenanceJson,
  readCanonicalAuthorizationRecord
} from './utils/releaseCiProvenance.mjs';
import { validateReleasePublicBuildConfig } from './utils/releasePublicBuildConfig.mjs';
import { createReleaseArtifactFileName } from './utils/releaseArtifactNames.mjs';

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || values.has(key)) {
      fail('CHROME_RELEASE_ARGUMENTS_INVALID');
    }
    values.set(key, value);
  }
  const mode = values.get('--config-mode');
  const authorizationRecord = values.get('--authorization-record');
  const expected = mode === 'owner-public-vars' ? 6 : 5;
  if (
    !['standalone-synthetic', 'owner-public-vars'].includes(mode) ||
    values.size !== expected ||
    (authorizationRecord !== undefined) !== (mode === 'owner-public-vars')
  ) {
    fail('CHROME_RELEASE_ARGUMENTS_INVALID');
  }
  for (const key of ['--attempt-root', '--dist-dir', '--release-dir', '--result-json']) {
    if (!values.has(key)) fail('CHROME_RELEASE_ARGUMENTS_INVALID');
  }
  return Object.freeze(Object.fromEntries(values));
}

function absoluteContained(root, value) {
  if (!isAbsolute(value) || resolve(value) !== value) fail('CHROME_RELEASE_PATH_INVALID');
  if (!value.startsWith(`${root}${sep}`)) fail('CHROME_RELEASE_PATH_ESCAPE');
  return value;
}

async function assertPrivateDirectory(path) {
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o777) !== 0o700
  ) {
    fail('CHROME_RELEASE_DIRECTORY_INVALID');
  }
}

function gitValue(args, dependencies) {
  const result = dependencies.gitOperation(args);
  if (result.status !== 0) fail('CHROME_RELEASE_GIT_INVALID');
  return result.stdout.trim();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function syncDirectory(path) {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function defaultPackageOperation({ repoRoot, distDir, outputDir }) {
  const result = spawnSync(
    process.execPath,
    [
      join(repoRoot, 'scripts/package.mjs'),
      '--dist-dir',
      distDir,
      '--output-dir',
      outputDir,
      '--require-absent-output'
    ],
    {
      cwd: repoRoot,
      env: {
        PATH: dirname(process.execPath),
        HOME: process.env.HOME,
        LANG: 'C',
        ZENDIO_GA_MEASUREMENT_ID: process.env.ZENDIO_GA_MEASUREMENT_ID,
        ZENDIO_GA_TRANSPORT_MODE: process.env.ZENDIO_GA_TRANSPORT_MODE,
        ZENDIO_GA_PROXY_ENDPOINT: process.env.ZENDIO_GA_PROXY_ENDPOINT
      },
      encoding: 'utf8',
      shell: false,
      timeout: 180_000,
      maxBuffer: 64 * 1024
    }
  );
  if (result.error?.code === 'ETIMEDOUT') fail('CHROME_RELEASE_PACKAGE_TIMEOUT');
  if (result.error) fail('CHROME_RELEASE_PACKAGE_SPAWN', result.error.message);
  if (result.signal) fail('CHROME_RELEASE_PACKAGE_SIGNAL', result.signal);
  if (result.status !== 0) fail('CHROME_RELEASE_PACKAGE_EXIT', String(result.status));
}

export async function prepareChromeRelease(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  const repoRoot = resolve(dependencies.repoRoot ?? process.cwd());
  const attemptRoot = resolve(args['--attempt-root']);
  if (!isAbsolute(args['--attempt-root']) || attemptRoot !== args['--attempt-root']) {
    fail('CHROME_RELEASE_PATH_INVALID');
  }
  const distDir = absoluteContained(attemptRoot, args['--dist-dir']);
  const releaseDir = absoluteContained(attemptRoot, args['--release-dir']);
  const resultPath = absoluteContained(attemptRoot, args['--result-json']);
  const authorizationPath = args['--authorization-record']
    ? absoluteContained(attemptRoot, args['--authorization-record'])
    : null;
  if (
    new Set([distDir, releaseDir, resultPath, authorizationPath].filter(Boolean)).size !==
    [distDir, releaseDir, resultPath, authorizationPath].filter(Boolean).length
  ) {
    fail('CHROME_RELEASE_PATH_ALIAS');
  }
  await assertPrivateDirectory(attemptRoot);
  await assertPrivateDirectory(dirname(releaseDir));
  const distStat = await lstat(distDir);
  if (!distStat.isDirectory() || distStat.isSymbolicLink()) fail('CHROME_RELEASE_DIST_INVALID');
  const gitOperation =
    dependencies.gitOperation ??
    ((gitArgs) => spawnSync('git', gitArgs, { cwd: repoRoot, encoding: 'utf8' }));
  const operations = { gitOperation };
  const releaseSha = gitValue(['rev-parse', 'HEAD'], operations);
  const releaseTree = gitValue(['rev-parse', 'HEAD^{tree}'], operations);
  if (gitValue(['status', '--porcelain=v1', '--untracked-files=all'], operations) !== '') {
    fail('CHROME_RELEASE_DIRTY_TREE');
  }
  const buildConfig = validateReleasePublicBuildConfig({
    configMode: args['--config-mode'],
    environment: dependencies.environment ?? process.env,
    repoRoot
  });
  let authorization;
  if (authorizationPath) {
    const provenance = await readCanonicalAuthorizationRecord(authorizationPath);
    if (provenance.releaseSha !== releaseSha) fail('CHROME_RELEASE_PROVENANCE_SHA');
    authorization = {
      authorizationMode: 'attached-ci-provenance-v1',
      provenance,
      provenanceSha256: sha256(Buffer.from(canonicalReleaseProvenanceJson(provenance))),
      releaseEligible: false
    };
  } else {
    authorization = {
      authorizationMode: 'standalone-unproven',
      provenance: null,
      releaseEligible: false
    };
  }
  try {
    await lstat(releaseDir);
    fail('CHROME_RELEASE_DIRECTORY_EXISTS');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await mkdir(releaseDir, { mode: 0o700 });
  const stagingDir = join(dirname(releaseDir), `.${basename(releaseDir)}.stage`);
  const packageOutput = join(stagingDir, 'package-output');
  await mkdir(stagingDir, { mode: 0o700 });
  await mkdir(packageOutput, { mode: 0o700 });
  let success = false;
  try {
    await (dependencies.packageOperation ?? defaultPackageOperation)({
      repoRoot,
      distDir,
      outputDir: packageOutput
    });
    const distManifest = JSON.parse(await readFile(join(distDir, 'manifest.json'), 'utf8'));
    const zipName = createReleaseArtifactFileName(distManifest.version, 'zip');
    const packageZip = join(packageOutput, zipName);
    const packageStat = await lstat(packageZip);
    if (!packageStat.isFile() || packageStat.isSymbolicLink() || packageStat.nlink !== 1) {
      fail('CHROME_RELEASE_PACKAGE_OUTPUT_INVALID');
    }
    if (JSON.stringify((await readdir(packageOutput)).sort()) !== JSON.stringify([zipName])) {
      fail('CHROME_RELEASE_PACKAGE_ROSTER');
    }
    await chmod(packageZip, 0o600);
    const finalZip = join(releaseDir, zipName);
    await link(packageZip, finalZip);
    await syncDirectory(releaseDir);
    await unlink(packageZip);
    await syncDirectory(packageOutput);
    const provenanceFinal = authorizationPath ? join(releaseDir, 'ci-provenance.json') : undefined;
    if (authorizationPath) {
      await writeCanonicalReleaseFile(provenanceFinal, authorization.provenance, 256 * 1024);
    }
    const packageBytes = await readFile(join(repoRoot, 'package.json'));
    const lockBytes = await readFile(join(repoRoot, 'package-lock.json'));
    const packageJson = JSON.parse(packageBytes);
    const manifest = await createChromeReleaseArtifactManifest({
      releaseDir,
      distDir,
      zipPath: finalZip,
      provenancePath: provenanceFinal,
      repository: { name: packageJson.name },
      git: { head: releaseSha, tree: releaseTree },
      packageMetadata: {
        version: packageJson.version,
        manifestVersion: distManifest.version,
        packageSha256: sha256(packageBytes),
        lockSha256: sha256(lockBytes)
      },
      buildConfig,
      authorization
    });
    const manifestPath = join(releaseDir, 'manifest.json');
    await writeCanonicalReleaseFile(manifestPath, manifest, 16 * 1024 * 1024);
    await verifyChromeReleaseArtifactManifest({
      manifestPath,
      transportMode: 'local-private-v1',
      expectedAttemptRoot: attemptRoot
    });
    const manifestBytes = await readFile(manifestPath);
    const result = {
      schema: 'chrome-release-prepare-result-v1',
      releaseSha,
      releaseTree,
      packageSha256: sha256(packageBytes),
      lockSha256: sha256(lockBytes),
      releaseManifestSha256: sha256(manifestBytes),
      manifestPath,
      zipPath: finalZip,
      releaseDir
    };
    await writeCanonicalReleaseFile(resultPath, result);
    success = true;
    return Object.freeze(result);
  } finally {
    if (success) await rm(stagingDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareChromeRelease().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
