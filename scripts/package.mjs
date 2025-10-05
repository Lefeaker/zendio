import { access, readFile, copyFile, mkdir, rm } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { dirname, join, resolve } from 'path';
import { zipDirectory } from './utils/archive.mjs';

async function pathExists(targetPath) {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveMessage(value, manifest, distDir) {
  const match = /^__MSG_(.*)__$/.exec(value);
  if (!match) {
    return value;
  }

  const locale = manifest.default_locale;
  if (!locale) {
    return value;
  }

  const messagesPath = join(distDir, '_locales', locale, 'messages.json');

  try {
    const messages = JSON.parse(await readFile(messagesPath, 'utf8'));
    return messages?.[match[1]]?.message ?? value;
  } catch {
    return value;
  }
}

async function prepareLicenseArtifacts(distDir) {
  const licensesDir = join(distDir, 'licenses');

  if (await pathExists(licensesDir)) {
    await rm(licensesDir, { recursive: true, force: true });
  }

  const licenseMappings = [
    { src: 'LICENSE', dest: join(distDir, 'LICENSE'), required: true },
    { src: 'THIRD_PARTY_NOTICES.md', dest: join(distDir, 'THIRD_PARTY_NOTICES.md'), required: true },
    { src: join('src', 'third_party', 'ai-chat-exporter', 'LICENSE'), dest: join(licensesDir, 'ai-chat-exporter', 'LICENSE'), required: true },
    { src: join('src', 'third_party', 'obsidian-clipper', 'LICENSE'), dest: join(licensesDir, 'obsidian-clipper', 'LICENSE'), required: true },
    { src: join('node_modules', '@mozilla', 'readability', 'LICENSE.md'), dest: join(licensesDir, 'mozilla-readability', 'LICENSE.md'), required: true },
    { src: join('node_modules', 'turndown', 'LICENSE'), dest: join(licensesDir, 'turndown', 'LICENSE'), required: true },
    { src: join('node_modules', '@mixmark-io', 'domino', 'LICENSE'), dest: join(licensesDir, 'mixmark-io-domino', 'LICENSE'), required: true }
  ];

  for (const mapping of licenseMappings) {
    if (!(await pathExists(mapping.src))) {
      const message = `未找到许可文件: ${mapping.src}`;
      if (mapping.required) {
        throw new Error(message);
      } else {
        console.warn(`⚠️  ${message}`);
        continue;
      }
    }

    await mkdir(dirname(mapping.dest), { recursive: true });
    await copyFile(mapping.src, mapping.dest);
  }
}

async function packageExtension() {
  console.log('📦 开始打包扩展...');

  // 检查 dist 目录是否存在
  if (!(await pathExists('dist'))) {
    console.error('❌ dist 目录不存在，请先运行 npm run build');
    process.exit(1);
  }

  const distDir = 'dist';
  await prepareLicenseArtifacts(distDir);

  // 读取版本号
  const manifest = JSON.parse(await readFile(join(distDir, 'manifest.json'), 'utf8'));
  const version = manifest.version;
  const resolvedName = await resolveMessage(manifest.name, manifest, distDir);
  const zipSafeName = resolvedName.replace(/\s+/g, '-').toLowerCase();
  const zipName = `${zipSafeName}-v${version}.zip`;
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
    await zipDirectory('dist', zipPath, { ignore: ['**/*.map', '**/.DS_Store'] });

    console.log('✅ 打包完成！');
    console.log('');
    console.log('📦 打包文件位置:');
    console.log(`   ${zipPath}`);
    console.log('');
    console.log('📖 安装说明:');
    console.log('   1. 打开 Chrome 浏览器');
    console.log('   2. 访问 chrome://extensions/');
    console.log('   3. 开启右上角的"开发者模式"');
    console.log('   4. 点击"加载已解压的扩展程序"');
    console.log(`   5. 选择解压后的文件夹，或者直接拖拽 ${zipName} 到页面上`);
    console.log('');
    console.log('💡 提示: 也可以将 dist 文件夹直接发送给朋友，让他们加载该文件夹');
  } catch (error) {
    console.error('❌ 打包失败:', error.message);
    process.exit(1);
  }
}

packageExtension();
