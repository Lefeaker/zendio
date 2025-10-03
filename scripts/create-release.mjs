import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, mkdir, cp, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

async function createRelease() {
  console.log('🎁 开始创建发布包...');

  // 检查 dist 目录是否存在
  if (!existsSync('dist')) {
    console.error('❌ dist 目录不存在，请先运行 npm run build');
    process.exit(1);
  }

  // 读取版本号
  const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
  const version = manifest.version;
  const name = manifest.name.replace(/\s+/g, '-').toLowerCase();
  const releaseName = `${name}-v${version}-release`;
  const releaseDir = `releases/${releaseName}`;

  console.log(`📝 扩展名称: ${manifest.name}`);
  console.log(`📝 版本号: ${version}`);
  console.log(`📝 发布包名称: ${releaseName}`);

  try {
    // 创建 releases 目录
    await mkdir('releases', { recursive: true });

    // 删除旧的发布目录（如果存在）
    if (existsSync(releaseDir)) {
      await execAsync(`rm -rf ${releaseDir}`);
      console.log('🗑️  删除旧的发布包');
    }

    // 创建发布目录
    await mkdir(releaseDir, { recursive: true });
    console.log('📁 创建发布目录');

    // 复制 dist 文件夹
    await cp('dist', `${releaseDir}/extension`, { recursive: true });
    console.log('📋 复制扩展文件');

    // 复制安装指南
    if (existsSync('INSTALL_GUIDE.md')) {
      await cp('INSTALL_GUIDE.md', `${releaseDir}/安装指南.md`);
      console.log('📋 复制安装指南');
    }

    // 创建简单的 README
    const readmeContent = `# ${manifest.name} v${version}

## 快速安装

1. 打开 Chrome 浏览器，访问 \`chrome://extensions/\`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 \`extension\` 文件夹

详细安装说明请查看 **安装指南.md**

## 版本信息

- 版本号: ${version}
- 打包时间: ${new Date().toLocaleString('zh-CN')}

## 需要帮助？

请查看 **安装指南.md** 获取详细的安装和使用说明。
`;

    await writeFile(`${releaseDir}/README.txt`, readmeContent);
    console.log('📋 创建 README');

    // 创建 zip 文件
    const zipName = `${releaseName}.zip`;
    console.log('🔨 正在创建 zip 文件...');
    
    // 删除旧的 zip 文件
    if (existsSync(`releases/${zipName}`)) {
      await execAsync(`rm releases/${zipName}`);
    }

    await execAsync(`cd releases && zip -r ${zipName} ${releaseName} -x "*.DS_Store"`);

    console.log('✅ 发布包创建完成！');
    console.log('');
    console.log('📦 发布包位置:');
    console.log(`   ${process.cwd()}/releases/${zipName}`);
    console.log('');
    console.log('📂 发布包内容:');
    console.log(`   - extension/          (扩展文件夹)`);
    console.log(`   - 安装指南.md         (详细安装说明)`);
    console.log(`   - README.txt          (快速开始)`);
    console.log('');
    console.log('💡 使用方法:');
    console.log(`   1. 将 releases/${zipName} 发送给你的朋友`);
    console.log('   2. 让他们解压后查看 README.txt 或 安装指南.md');
    console.log('   3. 按照说明加载 extension 文件夹即可');
    console.log('');
    console.log('🎉 完成！');
  } catch (error) {
    console.error('❌ 创建发布包失败:', error.message);
    process.exit(1);
  }
}

createRelease();

