import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { chmod, lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalArtifactJson } from './utils/firefoxReleaseArtifactManifest.mjs';

export const GECKODRIVER_VERSION = '0.37.1';
export const GECKODRIVER_CACHE_SCHEMA = 'zendio-geckodriver-cache-v1';
export const GECKODRIVER_ASSETS = Object.freeze({
  'darwin-arm64': Object.freeze({
    name: 'geckodriver-v0.37.1-macos-aarch64.tar.gz',
    sha256: 'd02b3f7003f999caf90974a2ef5da0286c05d01cee19112c86846d759fdba4f5'
  }),
  'darwin-x64': Object.freeze({
    name: 'geckodriver-v0.37.1-macos.tar.gz',
    sha256: 'd02b3f7003f999caf90974a2ef5da0286c05d01cee19112c86846d759fdba4f5'
  }),
  'linux-arm64': Object.freeze({
    name: 'geckodriver-v0.37.1-linux-aarch64.tar.gz',
    sha256: '8fd90b951422fbad5b56539fb344dff66eb3f986d615d8d6fde9f1f62dad610c'
  }),
  'linux-x64': Object.freeze({
    name: 'geckodriver-v0.37.1-linux64.tar.gz',
    sha256: 'e815130ea95983e162ae91843b48d3a3ce991735635fce83a647afde21e09f7e'
  })
});

const MAXIMUM_ARCHIVE_BYTES = 32 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const GECKODRIVER_RELEASE_ORIGIN = 'https://github.com';
const GECKODRIVER_ASSET_ORIGIN = 'https://release-assets.githubusercontent.com';

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function parseArgs(argv) {
  if (
    argv.length !== 2 ||
    argv[0] !== '--output-dir' ||
    !isAbsolute(argv[1]) ||
    resolve(argv[1]) !== argv[1]
  ) {
    fail('GECKODRIVER_ARGUMENTS_INVALID');
  }
  return { outputDir: argv[1] };
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
    fail('GECKODRIVER_PRIVATE_DIRECTORY');
  }
}

async function readBoundedResponse(response) {
  if (!response.ok || !response.body) fail('GECKODRIVER_DOWNLOAD_FAILED', String(response.status));
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const row = await reader.read();
      if (row.done) break;
      const bytes = Buffer.from(row.value);
      total += bytes.length;
      if (total > MAXIMUM_ARCHIVE_BYTES) {
        await reader.cancel().catch(() => undefined);
        fail('GECKODRIVER_ARCHIVE_LIMIT');
      }
      chunks.push(bytes);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

async function downloadAsset(asset, fetchImpl) {
  const releaseUrl = new URL(
    `https://github.com/mozilla/geckodriver/releases/download/v${GECKODRIVER_VERSION}/${asset.name}`
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    let response = await fetchImpl(releaseUrl, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'application/octet-stream',
        'User-Agent': 'zendio-geckodriver-provision/1'
      }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      const location = response.headers.get('location');
      if (!location) fail('GECKODRIVER_REDIRECT_INVALID');
      const target = new URL(location);
      if (
        releaseUrl.origin !== GECKODRIVER_RELEASE_ORIGIN ||
        target.origin !== GECKODRIVER_ASSET_ORIGIN ||
        target.username ||
        target.password ||
        target.port ||
        target.hash
      ) {
        fail('GECKODRIVER_REDIRECT_INVALID');
      }
      response = await fetchImpl(target, {
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Accept: 'application/octet-stream',
          'User-Agent': 'zendio-geckodriver-provision/1'
        }
      });
    }
    return readBoundedResponse(response);
  } finally {
    clearTimeout(timer);
  }
}

function runChecked(spawnSyncImpl, executable, args, options, code) {
  const result = spawnSyncImpl(executable, args, options);
  if (result.error || result.status !== 0 || result.signal) {
    fail(code, result.error?.message ?? result.stderr?.trim?.() ?? String(result.status));
  }
  return result;
}

function assertVersion(spawnSyncImpl, executablePath) {
  const result = runChecked(
    spawnSyncImpl,
    executablePath,
    ['--version'],
    {
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
      stdio: ['ignore', 'pipe', 'pipe']
    },
    'GECKODRIVER_VERSION_COMMAND_FAILED'
  );
  if (
    !new RegExp(`^geckodriver ${GECKODRIVER_VERSION.replaceAll('.', '\\.')}(?:\\s|$)`, 'u').test(
      result.stdout ?? ''
    )
  ) {
    fail('GECKODRIVER_VERSION_MISMATCH');
  }
}

async function verifyProvisioned(outputDir, asset, spawnSyncImpl) {
  await assertPrivateDirectory(outputDir);
  const executablePath = join(outputDir, 'geckodriver');
  const manifestPath = join(outputDir, 'manifest.json');
  const [binaryStat, manifestStat] = await Promise.all([
    lstat(executablePath),
    lstat(manifestPath)
  ]);
  if (
    !binaryStat.isFile() ||
    binaryStat.isSymbolicLink() ||
    binaryStat.uid !== process.getuid?.() ||
    binaryStat.nlink !== 1 ||
    (binaryStat.mode & 0o777) !== 0o700 ||
    !manifestStat.isFile() ||
    manifestStat.isSymbolicLink() ||
    manifestStat.uid !== process.getuid?.() ||
    manifestStat.nlink !== 1 ||
    (manifestStat.mode & 0o777) !== 0o600
  ) {
    fail('GECKODRIVER_CACHE_INVALID');
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    fail('GECKODRIVER_CACHE_INVALID');
  }
  const binaryBytes = await readFile(executablePath);
  if (
    manifest?.schema !== GECKODRIVER_CACHE_SCHEMA ||
    manifest.version !== GECKODRIVER_VERSION ||
    manifest.asset !== asset.name ||
    manifest.archiveSha256 !== asset.sha256 ||
    manifest.executableSha256 !== createHash('sha256').update(binaryBytes).digest('hex')
  ) {
    fail('GECKODRIVER_CACHE_INVALID');
  }
  assertVersion(spawnSyncImpl, executablePath);
  return Object.freeze({ executablePath, manifestPath, version: GECKODRIVER_VERSION });
}

export async function provisionGeckodriver(argv = process.argv.slice(2), dependencies = {}) {
  const { outputDir } = parseArgs(argv);
  const platform = dependencies.platform ?? process.platform;
  const architecture = dependencies.architecture ?? process.arch;
  const asset = dependencies.asset ?? GECKODRIVER_ASSETS[`${platform}-${architecture}`];
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const spawnSyncImpl = dependencies.spawnSyncImpl ?? spawnSync;
  if (!asset) fail('GECKODRIVER_PLATFORM_UNSUPPORTED', `${platform}-${architecture}`);
  await assertPrivateDirectory(dirname(outputDir));

  try {
    await lstat(outputDir);
    return verifyProvisioned(outputDir, asset, spawnSyncImpl);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const archiveBytes = await downloadAsset(asset, fetchImpl);
  if (createHash('sha256').update(archiveBytes).digest('hex') !== asset.sha256) {
    fail('GECKODRIVER_ARCHIVE_DIGEST_MISMATCH');
  }
  const temporary = join(dirname(outputDir), `.${basename(outputDir)}.${randomUUID()}.tmp`);
  await mkdir(temporary, { mode: 0o700 });
  let success = false;
  try {
    const archivePath = join(temporary, asset.name);
    const archiveHandle = await open(
      archivePath,
      fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_WRONLY |
        (fsConstants.O_NOFOLLOW ?? 0),
      0o600
    );
    try {
      await archiveHandle.writeFile(archiveBytes);
      await archiveHandle.sync();
    } finally {
      await archiveHandle.close();
    }
    const listing = runChecked(
      spawnSyncImpl,
      '/usr/bin/tar',
      ['-tzf', archivePath],
      {
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
        stdio: ['ignore', 'pipe', 'pipe']
      },
      'GECKODRIVER_ARCHIVE_LIST_FAILED'
    ).stdout;
    if (!['geckodriver\n', './geckodriver\n'].includes(listing)) {
      fail('GECKODRIVER_ARCHIVE_ROSTER_INVALID');
    }
    runChecked(
      spawnSyncImpl,
      '/usr/bin/tar',
      ['-xzf', archivePath, '-C', temporary],
      {
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
        stdio: ['ignore', 'pipe', 'pipe']
      },
      'GECKODRIVER_ARCHIVE_EXTRACT_FAILED'
    );
    await rm(archivePath);
    const executablePath = join(temporary, 'geckodriver');
    await chmod(executablePath, 0o700);
    assertVersion(spawnSyncImpl, executablePath);
    const executableSha256 = createHash('sha256')
      .update(await readFile(executablePath))
      .digest('hex');
    const manifestPath = join(temporary, 'manifest.json');
    const manifestHandle = await open(
      manifestPath,
      fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_WRONLY |
        (fsConstants.O_NOFOLLOW ?? 0),
      0o600
    );
    try {
      await manifestHandle.writeFile(
        canonicalArtifactJson({
          schema: GECKODRIVER_CACHE_SCHEMA,
          version: GECKODRIVER_VERSION,
          asset: asset.name,
          archiveSha256: asset.sha256,
          executableSha256,
          platform,
          architecture
        })
      );
      await manifestHandle.sync();
    } finally {
      await manifestHandle.close();
    }
    await rename(temporary, outputDir);
    success = true;
    return verifyProvisioned(outputDir, asset, spawnSyncImpl);
  } finally {
    if (!success) await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  provisionGeckodriver().then(
    (result) => process.stdout.write(`${canonicalArtifactJson(result)}`),
    (error) => {
      process.stderr.write(`${error?.message ?? error}\n`);
      process.exitCode = 1;
    }
  );
}
