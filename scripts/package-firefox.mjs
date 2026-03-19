import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import process from 'process';
import { zipDirectory } from './utils/archive.mjs';
import { applyRestHostPermissions } from './utils/manifestHosts.mjs';
import { pathExists, prepareLicenseArtifacts, resolveMessage } from './utils/packageHelpers.mjs';

const args = process.argv.slice(2);

function hasFlag(flag) {
  return args.includes(flag);
}

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

function sanitizeFileName(text) {
  const sanitized = text
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return sanitized.length > 0 ? sanitized : 'extension';
}

async function createUnsignedXpi(distDir, resolvedName, version) {
  const zipSafeName = sanitizeFileName(resolvedName);
  const xpiName = `${zipSafeName}-v${version}.xpi`;
  const outputPath = resolve(xpiName);

  if (await pathExists(outputPath)) {
    await rm(outputPath, { force: true });
  }

  await zipDirectory(distDir, outputPath, { ignore: ['**/*.map', '**/.DS_Store'] });
  return { xpiName, outputPath, zipSafeName };
}

async function runSigning({ distDir, artifactsDir, zipSafeName, version, apiKey, apiSecret, channel, extensionId }) {
  const webExtModule = await import('web-ext');
  const webExt = webExtModule.default ?? webExtModule;

  if (!(await pathExists(artifactsDir))) {
    await mkdir(artifactsDir, { recursive: true });
  }

  const beforeFiles = new Set(await readdir(artifactsDir));

  console.log('🔏 正在请求 Mozilla 签名服务...');

  try {
    await webExt.cmd.sign(
      {
        sourceDir: distDir,
        artifactsDir,
        apiKey,
        apiSecret,
        channel,
        id: extensionId
      },
      { shouldExitProgram: false }
    );
  } catch (error) {
    throw new Error(`web-ext 签名失败: ${error.message}`);
  }

  const afterFiles = await readdir(artifactsDir);
  const newArtifacts = afterFiles.filter((file) => !beforeFiles.has(file));
  const signedFiles = newArtifacts.filter((file) => file.endsWith('.xpi'));

  if (signedFiles.length === 0) {
    console.warn('⚠️  未找到签名后的 XPI 文件，请检查 web-ext 输出日志。');
    return null;
  }

  const latestSigned = signedFiles[0];
  const signedSource = join(artifactsDir, latestSigned);
  const signedTargetName = `${zipSafeName}-v${version}-signed.xpi`;
  const signedTargetPath = resolve(signedTargetName);

  await copyFile(signedSource, signedTargetPath);

  console.log('✅ 签名完成');
  console.log(`   签名文件: ${signedTargetPath}`);
  console.log(`   原始文件: ${signedSource}`);

  return signedTargetPath;
}

async function packageFirefoxExtension() {
  console.log('📦 开始打包 Firefox 扩展...');

  if (!(await pathExists('build/dist'))) {
    console.error('❌ build/dist 目录不存在，请先运行 npm run build:firefox');
    process.exit(1);
  }

  const distDir = 'build/dist';
  await prepareLicenseArtifacts(distDir);

  const manifestPath = join(distDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifestWithHosts = applyRestHostPermissions(manifest);

  await writeFile(manifestPath, JSON.stringify(manifestWithHosts, null, 2));

  const version = manifestWithHosts.version;
  const resolvedName = await resolveMessage(manifestWithHosts.name, manifestWithHosts, distDir);

  console.log(`📝 扩展名称: ${resolvedName}`);
  console.log(`📝 版本号: ${version}`);

  const { xpiName, outputPath, zipSafeName } = await createUnsignedXpi(distDir, resolvedName, version);

  console.log('✅ 未签名 XPI 已生成');
  console.log(`   文件路径: ${outputPath}`);

  if (!hasFlag('--sign')) {
    console.log('');
    console.log('📖 手动安装说明:');
    console.log('   1. 打开 Firefox，访问 about:debugging#/runtime/this-firefox');
    console.log('   2. 点击“临时载入附加组件”');
    console.log(`   3. 选择 ${xpiName}`);
    return;
  }

  const apiKey = getFlagValue('--api-key', { defaultValue: process.env.WEB_EXT_API_KEY });
  const apiSecret = getFlagValue('--api-secret', { defaultValue: process.env.WEB_EXT_API_SECRET });
  const channel = getFlagValue('--channel', { defaultValue: 'listed' });
  const artifactsDir = getFlagValue('--artifacts-dir', { defaultValue: 'build/firefox-artifacts' });

  if (!apiKey || !apiSecret) {
    console.error('❌ 签名模式需要提供 WEB_EXT_API_KEY 和 WEB_EXT_API_SECRET。');
    console.error('   可以通过环境变量或 --api-key/--api-secret 参数传入。');
    process.exit(1);
  }

  await runSigning({
    distDir,
    artifactsDir,
    zipSafeName,
    version,
    apiKey,
    apiSecret,
    channel,
    extensionId: manifestWithHosts?.browser_specific_settings?.gecko?.id
  });
}

packageFirefoxExtension().catch((error) => {
  console.error('❌ Firefox 打包流程失败:', error);
  process.exit(1);
});
