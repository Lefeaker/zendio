import { createHash, randomUUID } from 'node:crypto';
import { chmod, link, lstat, open, readFile, rm, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import process from 'process';
import { fileURLToPath, pathToFileURL } from 'url';
import { zipDirectory } from './utils/archive.mjs';
import { applyRestHostPermissions } from './utils/manifestHosts.mjs';
import { pathExists, prepareLicenseArtifacts, resolveMessage } from './utils/packageHelpers.mjs';
import {
  createReleaseArtifactBaseName,
  createReleaseArtifactFileName
} from './utils/releaseArtifactNames.mjs';
import {
  assertFirefoxLintProvenance,
  FIREFOX_READABILITY_WARNING_CONTRACT as FIREFOX_READABILITY_SOURCE_CONTRACT
} from './utils/firefoxLintProvenance.mjs';
import { auditReleaseArchive } from '../tools/audit-release-archive.mjs';

const args = process.argv.slice(2);
const FIREFOX_LINT_PACKAGE_JSON_PATH = fileURLToPath(new URL('../package.json', import.meta.url));
const FIREFOX_LINT_PACKAGE_LOCK_JSON_PATH = fileURLToPath(
  new URL('../package-lock.json', import.meta.url)
);
const FIREFOX_READABILITY_WARNING_CONTRACT = Object.freeze({
  dependency: '@mozilla/readability',
  packageIdentitySha256: '168f01305bab908fc4a75172e05eef6bab00e009f0c7e97709bcc02c8471b966',
  lockIdentitySha256: 'cd7a3c2b695164ef97fd4ff72a50ff8ce01cf45d6934c5f7e5889d6f967ac3c1',
  rule: 'UNSAFE_VAR_ASSIGNMENT',
  provenance: '@mozilla/readability@0.6.0/Readability.js:1549,1928',
  warningCount: FIREFOX_READABILITY_SOURCE_CONTRACT.length,
  warningMessage: FIREFOX_READABILITY_SOURCE_CONTRACT[0].message
});

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

async function loadWebExt() {
  const webExtModule = await import('web-ext');
  return webExtModule.default ?? webExtModule;
}

function getLintCount(lintResult, key) {
  const summaryCount = lintResult?.summary?.[key];
  if (typeof summaryCount === 'number') {
    return summaryCount;
  }

  const entries = lintResult?.[key];
  return Array.isArray(entries) ? entries.length : 0;
}

function formatLintErrorCodes(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 'unknown';
  }

  return errors
    .map((error) => error?.code ?? error?.message ?? 'unknown')
    .slice(0, 5)
    .join(', ');
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

function sha256Json(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeJson(value)))
    .digest('hex');
}

function parseFirefoxLintContractJson(serialized, label) {
  try {
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('root must be an object');
    }
    return parsed;
  } catch (error) {
    throw new Error(`FIREFOX_LINT_${label}_IDENTITY_DRIFT: ${error.message}`);
  }
}

async function readFirefoxLintContractFiles() {
  const [packageJson, packageLockJson] = await Promise.all([
    readFile(FIREFOX_LINT_PACKAGE_JSON_PATH, 'utf8'),
    readFile(FIREFOX_LINT_PACKAGE_LOCK_JSON_PATH, 'utf8')
  ]);
  return { packageJson, packageLockJson };
}

function assertReadabilityDependencyIdentity({ packageJson, packageLockJson }) {
  const parsedPackage = parseFirefoxLintContractJson(packageJson, 'READABILITY_PACKAGE');
  const parsedLock = parseFirefoxLintContractJson(packageLockJson, 'READABILITY_LOCK');
  const dependency = FIREFOX_READABILITY_WARNING_CONTRACT.dependency;
  const packageIdentity = {
    name: dependency,
    field: 'dependencies',
    requested: parsedPackage.dependencies?.[dependency] ?? null
  };
  const lockEntry = parsedLock.packages?.[`node_modules/${dependency}`] ?? null;
  const lockIdentity = { name: dependency, ...(lockEntry ?? {}) };

  if (sha256Json(packageIdentity) !== FIREFOX_READABILITY_WARNING_CONTRACT.packageIdentitySha256) {
    throw new Error('FIREFOX_LINT_READABILITY_PACKAGE_IDENTITY_DRIFT');
  }
  if (sha256Json(lockIdentity) !== FIREFOX_READABILITY_WARNING_CONTRACT.lockIdentitySha256) {
    throw new Error('FIREFOX_LINT_READABILITY_LOCK_IDENTITY_DRIFT');
  }
}

function assertPinnedReadabilityWarnings(warnings) {
  const contract = FIREFOX_READABILITY_WARNING_CONTRACT;
  if (warnings.length !== contract.warningCount) {
    throw new Error(
      `FIREFOX_LINT_THIRD_PARTY_WARNING_COUNT_DRIFT: expected=${contract.warningCount} actual=${warnings.length}`
    );
  }

  for (const warning of warnings) {
    if (warning?.code !== contract.rule) {
      throw new Error(
        `FIREFOX_LINT_THIRD_PARTY_WARNING_RULE_DRIFT: ${String(warning?.code ?? 'unknown')}`
      );
    }
    if (warning?.message !== contract.warningMessage) {
      throw new Error(
        `FIREFOX_LINT_THIRD_PARTY_WARNING_MESSAGE_DRIFT: ${String(warning?.message ?? 'unknown')}`
      );
    }
  }
}

export async function lintFirefoxExtension(distDir, dependencies = {}) {
  const {
    importWebExtImpl = loadWebExt,
    logger = console,
    assertFirefoxLintProvenanceImpl = assertFirefoxLintProvenance,
    readFirefoxLintContractFilesImpl = readFirefoxLintContractFiles,
    webExt
  } = dependencies;
  const resolvedWebExt = webExt ?? (await importWebExtImpl());

  if (typeof resolvedWebExt?.cmd?.lint !== 'function') {
    throw new Error('Firefox web-ext lint API is unavailable.');
  }

  logger.log('🔎 正在运行 Firefox web-ext lint...');

  let lintResult;
  try {
    lintResult = await resolvedWebExt.cmd.lint(
      {
        sourceDir: distDir,
        selfHosted: true,
        warningsAsErrors: false
      },
      { shouldExitProgram: false }
    );
  } catch (error) {
    throw new Error(`Firefox web-ext lint failed: ${error.message}`);
  }

  const contractFiles = await readFirefoxLintContractFilesImpl();
  assertReadabilityDependencyIdentity(contractFiles);

  const errors = Array.isArray(lintResult?.errors) ? lintResult.errors : [];
  const errorCount = getLintCount(lintResult, 'errors');
  if (errorCount !== errors.length) {
    throw new Error(
      `FIREFOX_LINT_ERROR_COUNT_DRIFT: summary=${errorCount} entries=${errors.length}`
    );
  }
  if (errorCount > 0) {
    throw new Error(
      `Firefox web-ext lint failed with ${errorCount} error(s): ${formatLintErrorCodes(errors)}`
    );
  }

  const warningCount = getLintCount(lintResult, 'warnings');
  const warnings = Array.isArray(lintResult?.warnings) ? lintResult.warnings : [];
  if (warningCount !== warnings.length) {
    throw new Error(
      `FIREFOX_LINT_THIRD_PARTY_WARNING_COUNT_DRIFT: summary=${warningCount} entries=${warnings.length}`
    );
  }
  assertPinnedReadabilityWarnings(warnings);
  await assertFirefoxLintProvenanceImpl({ distDir, warnings });
  logger.warn(
    `Firefox web-ext lint accepted ${warningCount} pinned ${FIREFOX_READABILITY_WARNING_CONTRACT.dependency} warning(s): rule=${FIREFOX_READABILITY_WARNING_CONTRACT.rule} provenance=${FIREFOX_READABILITY_WARNING_CONTRACT.provenance} packageSha256=${FIREFOX_READABILITY_WARNING_CONTRACT.packageIdentitySha256} lockSha256=${FIREFOX_READABILITY_WARNING_CONTRACT.lockIdentitySha256}`
  );
  logger.log(
    `✅ Firefox web-ext lint passed with ${warningCount} pinned ${FIREFOX_READABILITY_WARNING_CONTRACT.dependency} warning(s)`
  );
  return lintResult;
}

export async function prepareFirefoxReleasePackage({ distDir, publication }, dependencies = {}) {
  const {
    applyRestHostPermissionsImpl = applyRestHostPermissions,
    auditReleaseArchiveImpl = auditReleaseArchive,
    createUnsignedXpiImpl = createUnsignedXpi,
    lintFirefoxExtensionImpl = lintFirefoxExtension,
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

  await lintFirefoxExtensionImpl(distDir);

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
