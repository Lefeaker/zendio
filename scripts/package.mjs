import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

async function packageExtension() {
  console.log('📦 开始打包扩展...');

  // 检查 dist 目录是否存在
  if (!existsSync('dist')) {
    console.error('❌ dist 目录不存在，请先运行 npm run build');
    process.exit(1);
  }

  // 读取版本号
  const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
  const version = manifest.version;
  const name = manifest.name.replace(/\s+/g, '-').toLowerCase();
  const zipName = `${name}-v${version}.zip`;

  console.log(`📝 扩展名称: ${manifest.name}`);
  console.log(`📝 版本号: ${version}`);
  console.log(`📝 输出文件: ${zipName}`);

  try {
    // 删除旧的 zip 文件（如果存在）
    if (existsSync(zipName)) {
      await execAsync(`rm ${zipName}`);
      console.log('🗑️  删除旧的打包文件');
    }

    // 创建 zip 文件
    console.log('🔨 正在创建 zip 文件...');
    await execAsync(`cd dist && zip -r ../${zipName} . -x "*.map" -x "*.DS_Store"`);

    console.log('✅ 打包完成！');
    console.log('');
    console.log('📦 打包文件位置:');
    console.log(`   ${process.cwd()}/${zipName}`);
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

