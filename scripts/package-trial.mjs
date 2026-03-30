#!/usr/bin/env node

/**
 * 试用版本打包脚本
 * 用于创建带有时间限制的测试版本
 */

import { spawn } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// 默认配置
const DEFAULT_TRIAL_DAYS = 7;
const CONTACT_INFO = '请联系开发者获取正式版本';

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    trialDays: DEFAULT_TRIAL_DAYS,
    contactInfo: CONTACT_INFO,
    skipBuild: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      config.help = true;
    } else if (arg === '--skip-build') {
      config.skipBuild = true;
    } else if (arg.startsWith('--days=')) {
      const days = parseInt(arg.split('=')[1]);
      if (!isNaN(days) && days > 0) {
        config.trialDays = days;
      }
    } else if (arg.startsWith('--contact=')) {
      config.contactInfo = arg.split('=')[1];
    }
  }

  return config;
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
🔄 AiiinOB 试用版本打包工具

用法:
  npm run package:trial [选项]

选项:
  --days=N          设置试用天数 (默认: ${DEFAULT_TRIAL_DAYS})
  --contact=INFO    设置联系信息 (默认: "${CONTACT_INFO}")
  --skip-build      跳过构建步骤，直接打包
  --help, -h        显示此帮助信息

示例:
  npm run package:trial --days=14
  npm run package:trial --days=30 --contact="联系邮箱: test@example.com"
  npm run package:trial --skip-build

注意:
  - 试用版本会在指定天数后自动过期
  - 过期后扩展功能将被限制
  - 建议试用期不超过30天
`);
}

/**
 * 运行命令并等待完成
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`命令执行失败，退出码: ${code}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * 更新 package.json 添加试用版本脚本
 */
async function updatePackageJson() {
  try {
    const packagePath = 'package.json';
    const packageContent = await readFile(packagePath, 'utf8');
    const packageJson = JSON.parse(packageContent);

    // 添加试用版本相关脚本
    if (!packageJson.scripts['package:trial']) {
      packageJson.scripts['package:trial'] = 'node scripts/package-trial.mjs';
      packageJson.scripts['package:trial:quick'] = 'node scripts/package-trial.mjs --skip-build';
      
      await writeFile(packagePath, JSON.stringify(packageJson, null, 2));
      console.log('✅ 已更新 package.json 添加试用版本脚本');
    }
  } catch (error) {
    console.warn('⚠️  更新 package.json 失败:', error.message);
  }
}

/**
 * 主函数
 */
async function main() {
  const config = parseArgs();

  if (config.help) {
    showHelp();
    return;
  }

  console.log('🔄 开始创建试用版本...');
  console.log(`📅 试用期限: ${config.trialDays} 天`);
  console.log(`📞 联系信息: ${config.contactInfo}`);
  console.log('');

  try {
    // 更新 package.json
    await updatePackageJson();

    // 构建项目（如果需要）
    if (!config.skipBuild) {
      console.log('🔨 正在构建项目...');
      await runCommand('npm', ['run', 'build']);
      console.log('✅ 项目构建完成');
      console.log('');
    } else {
      console.log('⏭️  跳过构建步骤');
      console.log('');
    }

    // 打包试用版本
    console.log('📦 正在打包试用版本...');
    const packageArgs = [
      'run', 'package', '--',
      '--trial',
      `--trial-days=${config.trialDays}`
    ];

    await runCommand('npm', packageArgs);

    console.log('');
    console.log('🎉 试用版本创建完成！');
    console.log('');
    console.log('📋 版本信息:');
    console.log(`   类型: 试用版本`);
    console.log(`   试用期: ${config.trialDays} 天`);
    console.log(`   过期时间: ${new Date(Date.now() + config.trialDays * 24 * 60 * 60 * 1000).toLocaleString('zh-CN')}`);
    console.log('');
    console.log('📤 分发说明:');
    console.log('   1. 将生成的 .zip 文件发送给测试用户');
    console.log('   2. 用户解压后按照安装说明加载扩展');
    console.log('   3. 扩展会在试用期结束后自动提醒用户');
    console.log('   4. 过期后功能将被限制，需要正式版本');
    console.log('');
    console.log('⚠️  重要提醒:');
    console.log('   - 试用版本仅供测试使用');
    console.log('   - 请确保测试用户了解试用期限制');
    console.log('   - 建议在分发时说明联系方式');

  } catch (error) {
    console.error('❌ 创建试用版本失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数
main().catch(console.error);
