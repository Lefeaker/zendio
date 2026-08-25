import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  canonicalArtifactJson,
  verifyFirefoxReleaseArtifactManifest
} from './utils/firefoxReleaseArtifactManifest.mjs';

function fail(code) {
  throw new Error(code);
}

function parseArgs(argv) {
  const allowed = new Set(['--manifest', '--transport-mode', '--result-json']);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value || values.has(key)) fail('FIREFOX_SMOKE_ARGUMENT_CONTRACT');
    values.set(key, value);
  }
  if (values.size !== allowed.size) fail('FIREFOX_SMOKE_ARGUMENT_CONTRACT');
  return values;
}

function assertContained(root, path) {
  const parent = resolve(root);
  const target = resolve(path);
  if (!target.startsWith(`${parent}${sep}`)) fail('FIREFOX_SMOKE_PATH_ESCAPE');
  return target;
}

export function replaceWithFirefoxSmokeEnvironment({ attemptRoot, browserPath }) {
  const next = {
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: join(attemptRoot, 'home'),
    TMPDIR: join(attemptRoot, 'tmp'),
    TMP: join(attemptRoot, 'tmp'),
    TEMP: join(attemptRoot, 'tmp'),
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    CI: '1',
    PLAYWRIGHT_BROWSERS_PATH: browserPath
  };
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, next);
  return Object.freeze({ ...next });
}

export async function runFirefoxXpiSmoke(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  const attemptRoot = resolve(process.env.ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT ?? '');
  if (!attemptRoot.startsWith('/') || !process.env.PLAYWRIGHT_BROWSERS_PATH) {
    fail('FIREFOX_SMOKE_ATTEMPT_ENVIRONMENT');
  }
  const attemptStat = await lstat(attemptRoot);
  if (
    !attemptStat.isDirectory() ||
    attemptStat.isSymbolicLink() ||
    attemptStat.uid !== process.getuid?.() ||
    (attemptStat.mode & 0o777) !== 0o700 ||
    (await realpath(attemptRoot)) !== attemptRoot
  ) {
    fail('FIREFOX_SMOKE_ATTEMPT_ROOT');
  }
  const manifestPath = assertContained(attemptRoot, args.get('--manifest'));
  const resultPath = assertContained(attemptRoot, args.get('--result-json'));
  if (manifestPath === resultPath) fail('FIREFOX_SMOKE_PATH_ALIAS');
  const transportMode = args.get('--transport-mode');
  const binding = await verifyFirefoxReleaseArtifactManifest({
    manifestPath,
    transportMode,
    expectedAttemptRoot: attemptRoot
  });
  const browserPath = assertContained(attemptRoot, process.env.PLAYWRIGHT_BROWSERS_PATH);
  if (browserPath !== join(attemptRoot, 'playwright-browsers')) fail('FIREFOX_SMOKE_BROWSER_ROOT');
  const browserStat = await lstat(browserPath);
  if (
    !browserStat.isDirectory() ||
    browserStat.isSymbolicLink() ||
    browserStat.uid !== process.getuid?.() ||
    (browserStat.mode & 0o777) !== 0o700 ||
    (await realpath(browserPath)) !== browserPath
  )
    fail('FIREFOX_SMOKE_BROWSER_ROOT');
  for (const path of [join(attemptRoot, 'home'), join(attemptRoot, 'tmp')]) {
    try {
      await lstat(path);
      fail('FIREFOX_SMOKE_PRIVATE_ROOT_EXISTS');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await mkdir(path, { mode: 0o700 });
  }
  replaceWithFirefoxSmokeEnvironment({ attemptRoot, browserPath });
  const importPlaywrightImpl = dependencies.importPlaywrightImpl ?? (() => import('playwright'));
  const importWebExtImpl = dependencies.importWebExtImpl ?? (() => import('web-ext'));
  const importAdapterImpl =
    dependencies.importAdapterImpl ?? (() => import('./utils/webExtFirefoxSmokeAdapter.mjs'));
  const [playwright, webExtModule, adapter] = await Promise.all([
    importPlaywrightImpl(),
    importWebExtImpl(),
    importAdapterImpl()
  ]);
  const firefoxExecutable = playwright.firefox.executablePath();
  if (!assertContained(browserPath, firefoxExecutable)) fail('FIREFOX_SMOKE_EXECUTABLE');
  const profilePath = join(attemptRoot, 'firefox-xpi-smoke-profile');
  const bootstrapSourceDir = resolve(
    dirname(new URL(import.meta.url).pathname),
    '../tests/fixtures/firefox-xpi-smoke-bootstrap'
  );
  const result = await adapter.runVerifiedFirefoxXpiSmoke(
    { binding, firefoxExecutable, profilePath, bootstrapSourceDir, transportMode },
    { webExt: webExtModule.default ?? webExtModule }
  );
  const bytes = Buffer.from(canonicalArtifactJson(result), 'utf8');
  if (bytes.length > 64 * 1024) fail('FIREFOX_SMOKE_RESULT_LIMIT');
  const handle = await open(
    resultPath,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0),
    0o600
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const directory = await open(dirname(resultPath), 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  const resultStat = await lstat(resultPath);
  if (
    !resultStat.isFile() ||
    resultStat.isSymbolicLink() ||
    resultStat.uid !== process.getuid?.() ||
    resultStat.nlink !== 1 ||
    (resultStat.mode & 0o777) !== 0o600 ||
    resultStat.size !== bytes.length
  )
    fail('FIREFOX_SMOKE_RESULT_PUBLICATION');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFirefoxXpiSmoke().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}
