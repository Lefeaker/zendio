import { readFile, rm, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { zipDirectory } from './utils/archive.mjs';
import { applyRestHostPermissions } from './utils/manifestHosts.mjs';
import { pathExists, prepareLicenseArtifacts, resolveMessage } from './utils/packageHelpers.mjs';
import { createReleaseArtifactFileName } from './utils/releaseArtifactNames.mjs';
import { auditReleaseArchive } from '../tools/audit-release-archive.mjs';

/**
 * 获取试用天数参数
 */
export function normalizeTrialDays(args = process.argv) {
  const trialArg = args.find((arg) => arg.startsWith('--trial-days='));
  if (trialArg) {
    const days = parseInt(trialArg.split('=')[1]);
    return isNaN(days) || days <= 0 ? 7 : days;
  }
  return 7; // 默认7天
}

function getTrialDays() {
  return normalizeTrialDays();
}

export function createTrialConfig(trialDays, now = Date.now()) {
  const expirationTime = now + trialDays * 24 * 60 * 60 * 1000;

  return {
    isTrial: true,
    expirationTime,
    trialDays,
    createdAt: now,
    version: 'trial'
  };
}

/**
 * 注入试用配置到扩展中
 */
async function injectTrialConfig(distDir, trialDays) {
  const trialConfigPath = join(distDir, 'trial-config.json');
  const now = Date.now();
  const trialConfig = createTrialConfig(trialDays, now);

  await writeFile(trialConfigPath, JSON.stringify(trialConfig, null, 2));
  console.log(
    `✅ 试用配置已注入，过期时间: ${new Date(trialConfig.expirationTime).toLocaleString('zh-CN')}`
  );
}

async function packageExtension() {
  console.log('📦 开始打包扩展...');
  const distDir = getFlagValue('--dist-dir', { defaultValue: 'build/dist' });

  // 检查 build/dist 目录是否存在
  if (!(await pathExists(distDir))) {
    console.error(`❌ ${distDir} 目录不存在，请先运行 npm run build`);
    process.exit(1);
  }

  await prepareLicenseArtifacts(distDir);

  // 读取版本号
  const manifestPath = join(distDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifestWithHosts = applyRestHostPermissions(manifest);

  // 检查是否为试用版本打包
  const isTrialBuild = process.argv.includes('--trial');
  const trialDays = getTrialDays();

  if (isTrialBuild) {
    console.log(`🔄 正在创建 ${trialDays} 天试用版本...`);
    await injectTrialConfig(distDir, trialDays);
    manifestWithHosts.name = manifestWithHosts.name + ' (试用版)';
    // Chrome 扩展版本号必须是数字格式，不能包含文本后缀
    // 我们在名称中标识试用版本，版本号保持原样
  }

  await writeFile(manifestPath, JSON.stringify(manifestWithHosts, null, 2));

  const version = manifestWithHosts.version;
  const resolvedName = await resolveMessage(manifestWithHosts.name, manifestWithHosts, distDir);
  const zipName = createReleaseArtifactFileName(version, 'zip');
  const zipPath = resolve(zipName);

  console.log(`📝 扩展名称: ${resolvedName}`);
  console.log(`📝 版本号: ${version}`);
  console.log(`📝 输出文件: ${zipName}`);

  try {
    // 删除旧的 zip 文件（如果存在）
    if (await pathExists(zipPath)) {
      await rm(zipPath, { force: true });
      console.log('🗑️  删除旧的打包文件');
    }

    // 创建 zip 文件
    console.log('🔨 正在创建 zip 文件...');
    await zipDirectory(distDir, zipPath, { ignore: ['**/*.map', '**/.DS_Store'] });
    await auditReleaseArchive(zipPath);

    console.log('✅ 打包完成！');
    console.log('');
    console.log('📦 打包文件位置:');
    console.log(`   ${zipPath}`);
    console.log('');

    if (isTrialBuild) {
      console.log('🔄 试用版本信息:');
      console.log(`   试用期限: ${trialDays} 天`);
      console.log(
        `   过期时间: ${new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toLocaleString('zh-CN')}`
      );
      console.log('   ⚠️  试用版本会在过期后自动限制功能');
      console.log('');
    }

    console.log('📖 安装说明:');
    console.log('   1. 打开 Chrome 浏览器');
    console.log('   2. 访问 chrome://extensions/');
    console.log('   3. 开启右上角的"开发者模式"');
    console.log('   4. 点击"加载已解压的扩展程序"');
    console.log(`   5. 选择解压后的文件夹，或者直接拖拽 ${zipName} 到页面上`);
    console.log('');
    console.log(`💡 提示: 也可以将 ${distDir} 文件夹直接发送给朋友，让他们加载该文件夹`);
  } catch (error) {
    console.error('❌ 打包失败:', error.message);
    process.exit(1);
  }
}

function getFlagValue(flag, { defaultValue } = {}) {
  const inline = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return defaultValue;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`参数 ${flag} 缺少取值`);
  }
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  packageExtension();
}
