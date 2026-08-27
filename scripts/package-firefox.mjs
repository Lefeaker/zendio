import { randomUUID } from 'node:crypto';
import { chmod, link, lstat, open, readFile, rm, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import process from 'process';
import { pathToFileURL } from 'url';
import { zipDirectory } from './utils/archive.mjs';
import { applyRestHostPermissions } from './utils/manifestHosts.mjs';
import { createBrowserManifest } from './utils/manifestSources.mjs';
import { pathExists, prepareLicenseArtifacts, resolveMessage } from './utils/packageHelpers.mjs';
import {
  createReleaseArtifactBaseName,
  createReleaseArtifactFileName
} from './utils/releaseArtifactNames.mjs';
import { auditReleaseArchive } from '../tools/audit-release-archive.mjs';

const args = process.argv.slice(2);

function getFlagValue(flag, { defaultValue } = {}) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return defaultValue;
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`参数 ${flag} 缺少取值`);
  }
  return value;
}

function assertReleasePublication(publication) {
  if (publication?.mode !== 'release-no-replace-v1') {
    throw new Error('FIREFOX_RELEASE_PUBLICATION_REQUIRED');
  }
  if (!publication.outputDir || !publication.workDir) {
    throw new Error('FIREFOX_RELEASE_PUBLICATION_PATHS_REQUIRED');
  }
  const outputDir = resolve(publication.outputDir);
  const workDir = resolve(publication.workDir);
  if (
    outputDir === workDir ||
    outputDir !== publication.outputDir ||
    workDir !== publication.workDir
  ) {
    throw new Error('FIREFOX_RELEASE_PUBLICATION_PATH_INVALID');
  }
  return { outputDir, workDir };
}

async function fsyncDirectory(directory) {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function createUnsignedXpi(distDir, _resolvedName, version, options = {}) {
  const artifactBaseName = createReleaseArtifactBaseName(version);
  const xpiName = createReleaseArtifactFileName(version, 'xpi');
  if (options.publication) {
    const { outputDir, workDir } = assertReleasePublication(options.publication);
    const outputPath = join(outputDir, xpiName);
    try {
      await lstat(outputPath);
      throw new Error('FIREFOX_RELEASE_TARGET_EXISTS');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const constructionPath = join(workDir, `.xpi-${randomUUID()}.tmp`);
    await zipDirectory(distDir, constructionPath, { ignore: ['**/*.map', '**/.DS_Store'] });
    await chmod(constructionPath, 0o600);
    const handle = await open(constructionPath, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(constructionPath, outputPath);
    await fsyncDirectory(outputDir);
    await unlink(constructionPath);
    await fsyncDirectory(workDir);
    await fsyncDirectory(outputDir);
    return { xpiName, outputPath, artifactBaseName };
  }
  const outputPath = resolve(xpiName);

  if (await pathExists(outputPath)) {
    await rm(outputPath, { force: true });
  }

  await zipDirectory(distDir, outputPath, { ignore: ['**/*.map', '**/.DS_Store'] });
  return { xpiName, outputPath, artifactBaseName };
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJson(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJson(value[key])])
    );
  }
  return value;
}

export async function validateFirefoxExtension(distDir, dependencies = {}) {
  const {
    applyRestHostPermissionsImpl = applyRestHostPermissions,
    createBrowserManifestImpl = createBrowserManifest,
    logger = console,
    pathExistsImpl = pathExists,
    readFileImpl = readFile
  } = dependencies;
  logger.log('🔎 正在运行 Firefox repository manifest/static checks...');
  const manifestPath = join(distDir, 'manifest.json');
  let actual;
  try {
    actual = JSON.parse(await readFileImpl(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`FIREFOX_STATIC_MANIFEST_INVALID: ${error.message}`);
  }
  const expected = applyRestHostPermissionsImpl(createBrowserManifestImpl('firefox'));
  if (JSON.stringify(canonicalizeJson(actual)) !== JSON.stringify(canonicalizeJson(expected))) {
    throw new Error('FIREFOX_STATIC_MANIFEST_DRIFT');
  }
  if (
    actual.manifest_version !== 3 ||
    actual.background?.service_worker !== undefined ||
    JSON.stringify(actual.background?.scripts) !== JSON.stringify(['background/index.js']) ||
    actual.browser_specific_settings?.gecko?.strict_min_version !== '142.0' ||
    actual.browser_specific_settings?.gecko_android?.strict_min_version !== '142.0' ||
    JSON.stringify(actual.browser_specific_settings?.gecko?.data_collection_permissions) !==
      JSON.stringify({ required: ['none'], optional: ['technicalAndInteraction'] }) ||
    !(await pathExistsImpl(join(distDir, 'background/index.js')))
  ) {
    throw new Error('FIREFOX_STATIC_RELEASE_CONTRACT');
  }
  logger.log('✅ Firefox repository manifest/static checks passed');
  return actual;
}

export async function prepareFirefoxReleasePackage({ distDir, publication }, dependencies = {}) {
  const {
    applyRestHostPermissionsImpl = applyRestHostPermissions,
    auditReleaseArchiveImpl = auditReleaseArchive,
    createUnsignedXpiImpl = createUnsignedXpi,
    validateFirefoxExtensionImpl = validateFirefoxExtension,
    logger = console,
    prepareLicenseArtifactsImpl = prepareLicenseArtifacts,
    readFileImpl = readFile,
    resolveMessageImpl = resolveMessage,
    writeFileImpl = writeFile
  } = dependencies;

  await prepareLicenseArtifactsImpl(distDir);

  const manifestPath = join(distDir, 'manifest.json');
  const manifest = JSON.parse(await readFileImpl(manifestPath, 'utf8'));
  const manifestWithHosts = applyRestHostPermissionsImpl(manifest);

  await writeFileImpl(manifestPath, JSON.stringify(manifestWithHosts, null, 2));

  const version = manifestWithHosts.version;
  const resolvedName = await resolveMessageImpl(manifestWithHosts.name, manifestWithHosts, distDir);

  logger.log(`📝 扩展名称: ${resolvedName}`);
  logger.log(`📝 版本号: ${version}`);

  await validateFirefoxExtensionImpl(distDir);

  const xpiResult = publication
    ? await createUnsignedXpiImpl(distDir, resolvedName, version, { publication })
    : await createUnsignedXpiImpl(distDir, resolvedName, version);
  const { xpiName, outputPath, artifactBaseName } = xpiResult;
  await auditReleaseArchiveImpl(outputPath);

  return {
    manifest: manifestWithHosts,
    outputPath,
    resolvedName,
    version,
    xpiName,
    artifactBaseName
  };
}

export async function packageFirefoxExtension() {
  console.log('📦 开始打包 Firefox 扩展...');
  const distDir = getFlagValue('--dist-dir', { defaultValue: 'build/dist' });

  if (!(await pathExists(distDir))) {
    console.error(`❌ ${distDir} 目录不存在，请先运行 npm run build:firefox`);
    process.exit(1);
  }

  const { outputPath, xpiName } = await prepareFirefoxReleasePackage({ distDir });

  console.log('✅ 未签名 XPI 已生成');
  console.log(`   文件路径: ${outputPath}`);

  console.log('');
  console.log('📖 手动安装说明:');
  console.log('   1. 打开 Firefox，访问 about:debugging#/runtime/this-firefox');
  console.log('   2. 点击“临时载入附加组件”');
  console.log(`   3. 选择 ${xpiName}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  packageFirefoxExtension().catch((error) => {
    console.error('❌ Firefox 打包流程失败:', error);
    process.exit(1);
  });
}
