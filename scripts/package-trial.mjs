#!/usr/bin/env node

/**
 * 试用版本打包脚本
 * 用于创建带有时间限制的测试版本
 */

import { spawn } from 'child_process';
import { pathToFileURL } from 'url';

// 默认配置
const DEFAULT_TRIAL_DAYS = 7;
const MIN_TRIAL_DAYS = 1;
const MAX_TRIAL_DAYS = 30;
const TRIAL_DIST_DIR = 'build/dist-chrome-trial';

function parseTrialDaysValue(value, flagName) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${flagName} must be a base-10 integer from 1 to ${MAX_TRIAL_DAYS}`);
  }

  const days = Number(value);
  if (days < MIN_TRIAL_DAYS || days > MAX_TRIAL_DAYS) {
    throw new Error(`${flagName} must be a base-10 integer from 1 to ${MAX_TRIAL_DAYS}`);
  }

  return days;
}

/**
 * 解析命令行参数
 */
export function parsePackageTrialArgs(args = process.argv.slice(2)) {
  const config = {
    trialDays: DEFAULT_TRIAL_DAYS,
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
      config.trialDays = parseTrialDaysValue(arg.split('=')[1], '--days');
    } else if (arg.startsWith('--contact=')) {
      throw new Error(
        '--contact is no longer supported; trial packages do not carry contact metadata'
      );
    }
  }

  return config;
}

export function createPackageTrialPlan(config) {
  const commands = [];

  if (!config.skipBuild) {
    commands.push({
      command: 'npm',
      args: ['run', 'build:fast', '--', '--outdir', TRIAL_DIST_DIR]
    });
  }

  commands.push({
    command: 'node',
    args: [
      'scripts/package.mjs',
      '--dist-dir',
      TRIAL_DIST_DIR,
      '--trial',
      `--trial-days=${config.trialDays}`
    ]
  });

  return {
    commands,
    distDir: TRIAL_DIST_DIR,
    mutatesPackageJson: false
  };
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
🔄 Zendio 试用版本打包工具

用法:
  npm run package:trial [选项]

选项:
  --days=N          设置试用天数 (默认: ${DEFAULT_TRIAL_DAYS})
  --skip-build      跳过构建步骤，直接打包已有的 ${TRIAL_DIST_DIR}
  --help, -h        显示此帮助信息

示例:
  npm run package:trial --days=14
  npm run package:trial --skip-build

注意:
  - 试用版本会在指定天数后自动过期
  - 试用包使用独立输出目录 ${TRIAL_DIST_DIR}，避免污染正式包 build/dist
  - 试用标记只是本地首次安装配置，不是订阅或私有能力证明
  - 试用期必须为 ${MIN_TRIAL_DAYS}-${MAX_TRIAL_DAYS} 天之间的十进制整数
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
 * 主函数
 */
async function main() {
  const config = parsePackageTrialArgs();

  if (config.help) {
    showHelp();
    return;
  }

  console.log('🔄 开始创建试用版本...');
  console.log(`📅 试用期限: ${config.trialDays} 天`);
  console.log(`📁 输出目录: ${TRIAL_DIST_DIR}`);
  console.log('');

  try {
    const plan = createPackageTrialPlan(config);

    // 构建项目（如果需要）
    if (!config.skipBuild) {
      console.log(`🔨 正在构建试用包隔离输出 ${TRIAL_DIST_DIR}...`);
      const [buildCommand] = plan.commands;
      await runCommand(buildCommand.command, buildCommand.args);
      console.log('✅ 项目构建完成');
      console.log('');
    } else {
      console.log(`⏭️  跳过构建步骤，复用 ${TRIAL_DIST_DIR}`);
      console.log('');
    }

    // 打包试用版本
    console.log('📦 正在打包试用版本...');
    const packageCommand = plan.commands.at(-1);
    await runCommand(packageCommand.command, packageCommand.args);

    console.log('');
    console.log('🎉 试用版本创建完成！');
    console.log('');
    console.log('📋 版本信息:');
    console.log(`   类型: 试用版本`);
    console.log(`   试用期: ${config.trialDays} 天`);
    console.log(
      `   过期时间: ${new Date(Date.now() + config.trialDays * 24 * 60 * 60 * 1000).toLocaleString('zh-CN')}`
    );
    console.log('');
    console.log('📤 分发说明:');
    console.log('   1. 将生成的 .zip 文件发送给测试用户');
    console.log('   2. 用户解压后按照安装说明加载扩展');
    console.log('   3. 扩展会在试用期结束后自动提醒用户');
    console.log('   4. 试用标记仅来自本地 trial-config.json');
    console.log('');
    console.log('⚠️  重要提醒:');
    console.log('   - 试用版本仅供测试使用');
    console.log('   - 试用版本不是远程授权、订阅状态或私有 Pro 能力证明');
    console.log(`   - ${TRIAL_DIST_DIR} 是试用包专用输出，不要复用为正式包`);
  } catch (error) {
    console.error('❌ 创建试用版本失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(console.error);
}
