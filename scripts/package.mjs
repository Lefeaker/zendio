import {
  chmod,
  link,
  lstat,
  mkdtemp,
  open,
  readFile,
  rm,
  rmdir,
  unlink,
  writeFile
} from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zipDirectory } from './utils/archive.mjs';
import { applyRestHostPermissions } from './utils/manifestHosts.mjs';
import { pathExists, prepareLicenseArtifacts, resolveMessage } from './utils/packageHelpers.mjs';
import { createReleaseArtifactFileName } from './utils/releaseArtifactNames.mjs';
import { auditReleaseArchive } from '../tools/audit-release-archive.mjs';

const DEFAULT_TRIAL_DAYS = 7;
const MIN_TRIAL_DAYS = 1;
const MAX_TRIAL_DAYS = 30;

function fail(message) {
  throw new Error(message);
}

function parseTrialDaysValue(value, flagName) {
  if (!/^[1-9]\d*$/u.test(value)) {
    fail(`${flagName} must be a base-10 integer from 1 to ${MAX_TRIAL_DAYS}`);
  }
  const days = Number(value);
  if (days < MIN_TRIAL_DAYS || days > MAX_TRIAL_DAYS) {
    fail(`${flagName} must be a base-10 integer from 1 to ${MAX_TRIAL_DAYS}`);
  }
  return days;
}

export function normalizeTrialDays(args = process.argv) {
  const trialArg = args.find((arg) => arg.startsWith('--trial-days='));
  return trialArg
    ? parseTrialDaysValue(trialArg.slice('--trial-days='.length), '--trial-days')
    : DEFAULT_TRIAL_DAYS;
}

export function createTrialConfig(trialDays, now = Date.now()) {
  return {
    isTrial: true,
    expirationTime: now + trialDays * 24 * 60 * 60 * 1000,
    trialDays,
    createdAt: now,
    version: 'trial'
  };
}

function absolutePath(value, code) {
  if (!isAbsolute(value) || resolve(value) !== value) fail(code);
  return value;
}

export function parsePackageArguments(argv = process.argv.slice(2)) {
  const releaseMode = argv.includes('--output-dir') || argv.includes('--require-absent-output');
  if (releaseMode) {
    if (
      argv.length !== 5 ||
      argv[0] !== '--dist-dir' ||
      argv[2] !== '--output-dir' ||
      argv[4] !== '--require-absent-output'
    ) {
      fail('PACKAGE_RELEASE_ARGUMENTS_INVALID');
    }
    const distDir = absolutePath(argv[1], 'PACKAGE_RELEASE_DIST_INVALID');
    const outputDir = absolutePath(argv[3], 'PACKAGE_RELEASE_OUTPUT_INVALID');
    if (distDir === outputDir) fail('PACKAGE_RELEASE_PATH_ALIAS');
    return Object.freeze({
      mode: 'release-no-replace-v1',
      distDir,
      outputDir,
      trial: false,
      trialDays: DEFAULT_TRIAL_DAYS
    });
  }
  let distDir = 'build/dist';
  let trial = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--dist-dir') {
      if (argv[index + 1] === undefined || argv[index + 1].startsWith('--')) {
        fail('参数 --dist-dir 缺少取值');
      }
      distDir = argv[index + 1];
      index += 1;
    } else if (value === '--trial') {
      trial = true;
    } else if (value.startsWith('--trial-days=')) {
      parseTrialDaysValue(value.slice('--trial-days='.length), '--trial-days');
    } else {
      fail(`PACKAGE_ARGUMENT_INVALID:${value}`);
    }
  }
  return Object.freeze({
    mode: 'ordinary',
    distDir,
    outputDir: null,
    trial,
    trialDays: normalizeTrialDays(['node', 'scripts/package.mjs', ...argv])
  });
}

async function syncDirectory(path) {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function assertPrivateOutputDirectory(path) {
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o777) !== 0o700
  ) {
    fail('PACKAGE_RELEASE_OUTPUT_DIRECTORY_INVALID');
  }
  return { device: stat.dev, inode: stat.ino, mode: stat.mode & 0o777 };
}

async function publishReleaseArchive({ distDir, outputDir, zipName, dependencies }) {
  const target = join(outputDir, zipName);
  if (resolve(target) !== target || basename(target) !== zipName)
    fail('PACKAGE_RELEASE_TARGET_INVALID');
  const before = await assertPrivateOutputDirectory(outputDir);
  try {
    await lstat(target);
    fail('PACKAGE_RELEASE_TARGET_EXISTS');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const tempDir = await dependencies.mkdtempOperation(join(outputDir, '.zendio-package-'));
  await chmod(tempDir, 0o700);
  const tempPath = join(tempDir, 'archive.zip');
  await dependencies.zipDirectoryImpl(distDir, tempPath, { ignore: ['**/*.map', '**/.DS_Store'] });
  await dependencies.auditReleaseArchiveImpl(tempPath);
  await chmod(tempPath, 0o600);
  const file = await open(tempPath, 'r');
  try {
    await file.sync();
  } finally {
    await file.close();
  }
  const current = await assertPrivateOutputDirectory(outputDir);
  if (JSON.stringify(current) !== JSON.stringify(before)) fail('PACKAGE_RELEASE_OUTPUT_CHANGED');
  await dependencies.linkOperation(tempPath, target);
  await syncDirectory(outputDir);
  await dependencies.unlinkOperation(tempPath);
  await dependencies.rmdirOperation(tempDir);
  await syncDirectory(outputDir);
  const after = await assertPrivateOutputDirectory(outputDir);
  if (JSON.stringify(after) !== JSON.stringify(before)) fail('PACKAGE_RELEASE_OUTPUT_CHANGED');
  const targetStat = await lstat(target);
  if (
    !targetStat.isFile() ||
    targetStat.isSymbolicLink() ||
    targetStat.nlink !== 1 ||
    (targetStat.mode & 0o777) !== 0o600
  ) {
    fail('PACKAGE_RELEASE_TARGET_INVALID');
  }
  return target;
}

async function injectTrialConfig(distDir, trialDays) {
  await writeFile(
    join(distDir, 'trial-config.json'),
    JSON.stringify(createTrialConfig(trialDays, Date.now()), null, 2)
  );
}

export async function packageExtension(options = {}, dependencies = {}) {
  const args = parsePackageArguments(options.argv ?? process.argv.slice(2));
  const logger = dependencies.logger ?? console;
  const operations = {
    zipDirectoryImpl: dependencies.zipDirectoryImpl ?? zipDirectory,
    auditReleaseArchiveImpl: dependencies.auditReleaseArchiveImpl ?? auditReleaseArchive,
    mkdtempOperation: dependencies.mkdtempOperation ?? mkdtemp,
    linkOperation: dependencies.linkOperation ?? link,
    unlinkOperation: dependencies.unlinkOperation ?? unlink,
    rmdirOperation: dependencies.rmdirOperation ?? rmdir
  };
  if (!(await pathExists(args.distDir))) fail(`${args.distDir} 目录不存在，请先运行 npm run build`);
  await (dependencies.prepareLicenseArtifactsImpl ?? prepareLicenseArtifacts)(args.distDir);
  const manifestPath = join(args.distDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifestWithHosts = (dependencies.applyRestHostPermissionsImpl ?? applyRestHostPermissions)(
    manifest
  );
  if (args.trial) {
    await injectTrialConfig(args.distDir, args.trialDays);
    manifestWithHosts.name = `${manifestWithHosts.name} (试用版)`;
  }
  await writeFile(manifestPath, JSON.stringify(manifestWithHosts, null, 2));
  const version = manifestWithHosts.version;
  const resolvedName = await (dependencies.resolveMessageImpl ?? resolveMessage)(
    manifestWithHosts.name,
    manifestWithHosts,
    args.distDir
  );
  const zipName = createReleaseArtifactFileName(version, 'zip');
  let zipPath;
  if (args.mode === 'release-no-replace-v1') {
    zipPath = await publishReleaseArchive({
      distDir: args.distDir,
      outputDir: args.outputDir,
      zipName,
      dependencies: operations
    });
  } else {
    zipPath = resolve(zipName);
    if (await pathExists(zipPath)) await rm(zipPath, { force: true });
    await operations.zipDirectoryImpl(args.distDir, zipPath, {
      ignore: ['**/*.map', '**/.DS_Store']
    });
    await operations.auditReleaseArchiveImpl(zipPath);
  }
  logger.log(`✅ 打包完成: ${zipPath}`);
  return Object.freeze({
    schema: 'zendio-chrome-package-result-v1',
    distDir: resolve(args.distDir),
    zipName,
    zipPath,
    version,
    resolvedName,
    mode: args.mode
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  packageExtension().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
