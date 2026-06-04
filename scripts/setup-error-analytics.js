#!/usr/bin/env node

/**
 * Zendio 错误分析系统设置脚本
 *
 * 这个脚本帮助开发者快速配置错误分析系统，包括：
 * 1. 验证 GA4 配置
 * 2. 检查必要的文件和依赖
 * 3. 生成配置模板
 * 4. 运行基本的集成测试
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  colorLog('green', `✅ ${message}`);
}

function warning(message) {
  colorLog('yellow', `⚠️  ${message}`);
}

function error(message) {
  colorLog('red', `❌ ${message}`);
}

function info(message) {
  colorLog('blue', `ℹ️  ${message}`);
}

// 创建 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// 检查文件是否存在
function checkFileExists(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  return fs.existsSync(fullPath);
}

// 读取文件内容
function readFile(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch (err) {
    return null;
  }
}

// 写入文件
function writeFile(filePath, content) {
  const fullPath = path.join(__dirname, '..', filePath);
  try {
    fs.writeFileSync(fullPath, content, 'utf8');
    return true;
  } catch (err) {
    error(`Failed to write file ${filePath}: ${err.message}`);
    return false;
  }
}

// 检查必要的文件
function checkRequiredFiles() {
  info('检查必要的文件...');

  const requiredFiles = [
    'src/shared/errors/errorCodes.ts',
    'src/shared/errors/analytics/analyticsConfig.ts',
    'src/shared/errors/analytics/googleAnalyticsReporter.ts',
    'src/shared/errors/analytics/dataSanitizer.ts',
    'src/options/components/controls/privacySettings.ts'
  ];

  let allFilesExist = true;

  requiredFiles.forEach((file) => {
    if (checkFileExists(file)) {
      success(`${file} 存在`);
    } else {
      error(`${file} 不存在`);
      allFilesExist = false;
    }
  });

  return allFilesExist;
}

// 检查 GA4 配置
function checkGA4Config() {
  info('检查 Google Analytics 配置...');

  const configPath = 'src/shared/errors/analytics/analyticsConfig.ts';
  const configContent = readFile(configPath);

  if (!configContent) {
    error('无法读取 analyticsConfig.ts 文件');
    return false;
  }

  // 检查是否包含占位符
  const hasPlaceholder =
    configContent.includes('G-XXXXXXXXXX') || configContent.includes('YOUR_API_SECRET');

  if (hasPlaceholder) {
    warning('GA4 配置包含占位符，需要更新为实际值');
    return false;
  }

  // 检查是否包含有效的 Measurement ID 格式
  const measurementIdMatch = configContent.match(/MEASUREMENT_ID:\s*['"`]([^'"`]+)['"`]/);
  const apiSecretMatch = configContent.match(/API_SECRET:\s*['"`]([^'"`]+)['"`]/);

  if (!measurementIdMatch || !measurementIdMatch[1].startsWith('G-')) {
    warning('Measurement ID 格式不正确，应该以 G- 开头');
    return false;
  }

  if (!apiSecretMatch || apiSecretMatch[1].length < 10) {
    warning('API Secret 似乎不正确');
    return false;
  }

  success('GA4 配置看起来正确');
  return true;
}

// 生成配置模板
async function generateConfigTemplate() {
  info('生成 GA4 配置模板...');

  const measurementId = await askQuestion('请输入您的 GA4 Measurement ID (G-XXXXXXXXXX): ');
  const apiSecret = await askQuestion('请输入您的 GA4 API Secret: ');

  if (!measurementId.startsWith('G-')) {
    error('Measurement ID 格式不正确，应该以 G- 开头');
    return false;
  }

  if (apiSecret.length < 10) {
    error('API Secret 长度太短，请检查是否正确');
    return false;
  }

  // 读取现有配置
  const configPath = 'src/shared/errors/analytics/analyticsConfig.ts';
  let configContent = readFile(configPath);

  if (!configContent) {
    error('无法读取配置文件');
    return false;
  }

  // 替换占位符
  configContent = configContent.replace(
    /MEASUREMENT_ID:\s*['"`][^'"`]+['"`]/,
    `MEASUREMENT_ID: '${measurementId}'`
  );
  configContent = configContent.replace(
    /API_SECRET:\s*['"`][^'"`]+['"`]/,
    `API_SECRET: '${apiSecret}'`
  );

  // 写入更新的配置
  if (writeFile(configPath, configContent)) {
    success('GA4 配置已更新');
    return true;
  }

  return false;
}

// 验证错误码
function validateErrorCodes() {
  info('验证错误码定义...');

  const errorCodesPath = 'src/shared/errors/errorCodes.ts';
  const content = readFile(errorCodesPath);

  if (!content) {
    error('无法读取 errorCodes.ts 文件');
    return false;
  }

  // 检查是否包含标准化错误码
  const hasStandardizedCodes = content.includes('STANDARDIZED_ERROR_CODES');
  const hasGenerateFunction = content.includes('generateErrorCode');
  const hasParseFunction = content.includes('parseErrorCode');

  if (!hasStandardizedCodes) {
    error('缺少 STANDARDIZED_ERROR_CODES 定义');
    return false;
  }

  if (!hasGenerateFunction) {
    error('缺少 generateErrorCode 函数');
    return false;
  }

  if (!hasParseFunction) {
    error('缺少 parseErrorCode 函数');
    return false;
  }

  success('错误码定义验证通过');
  return true;
}

// 检查隐私设置集成
function checkPrivacyIntegration() {
  info('检查隐私设置集成...');

  const optionsHtmlPath = 'src/options/index.html';
  const htmlContent = readFile(optionsHtmlPath);

  if (!htmlContent) {
    error('无法读取 options/index.html 文件');
    return false;
  }

  // 检查是否包含隐私设置容器
  const hasPrivacyContainer = htmlContent.includes('privacySettingsContainer');
  const hasPrivacyStyles = htmlContent.includes('privacy-settings');

  if (!hasPrivacyContainer) {
    warning('options/index.html 中缺少隐私设置容器');
    return false;
  }

  if (!hasPrivacyStyles) {
    warning('options/index.html 中缺少隐私设置样式');
    return false;
  }

  success('隐私设置集成检查通过');
  return true;
}

// 生成集成示例
function generateIntegrationExample() {
  info('生成集成示例代码...');

  const exampleCode = `
// 在 background/index.ts 中初始化错误分析
import { initializeErrorAnalytics } from '../shared/errors/analytics';

async function initializeExtension() {
  try {
    // 初始化错误分析系统
    await initializeErrorAnalytics();
    console.log('Error analytics initialized');
  } catch (error) {
    console.error('Failed to initialize error analytics:', error);
  }
}

// 在 options/index.ts 中初始化隐私设置
import { PrivacySettings } from './components/controls/privacySettings';

async function initializeOptionsPage() {
  const privacyContainer = document.getElementById('privacySettingsContainer');
  if (privacyContainer) {
    const privacySettings = new PrivacySettings(privacyContainer);
    await privacySettings.render();
  }
}

// 使用标准化错误码
import { STANDARDIZED_ERROR_CODES } from '../shared/errors/errorCodes';
import { handleError } from '../shared/errors';

try {
  await someOperation();
} catch (error) {
  await handleError({
    code: STANDARDIZED_ERROR_CODES.EXTRACTION_CONTENT_NO_MARKDOWN,
    domain: 'extraction',
    message: 'Content extraction failed',
    severity: 'error',
    recoverable: true,
    context: {
      timestamp: Date.now()
    },
    cause: error
  });
}
`;

  if (writeFile('docs/integration-example.ts', exampleCode)) {
    success('集成示例已生成到 docs/integration-example.ts');
  }
}

// 主函数
async function main() {
  colorLog('cyan', '🚀 Zendio 错误分析系统设置向导');
  console.log('');

  try {
    // 1. 检查必要文件
    if (!checkRequiredFiles()) {
      error('缺少必要的文件，请确保错误分析系统已正确安装');
      process.exit(1);
    }

    console.log('');

    // 2. 检查 GA4 配置
    const configValid = checkGA4Config();
    if (!configValid) {
      const shouldConfigure = await askQuestion('是否要配置 GA4 设置？(y/n): ');
      if (shouldConfigure.toLowerCase() === 'y') {
        await generateConfigTemplate();
      }
    }

    console.log('');

    // 3. 验证错误码
    validateErrorCodes();

    console.log('');

    // 4. 检查隐私设置集成
    checkPrivacyIntegration();

    console.log('');

    // 5. 生成集成示例
    generateIntegrationExample();

    console.log('');
    success('设置完成！');
    info('请查看以下文档了解更多信息：');
    info('- docs/error-analytics-integration-guide.md');
    info('- docs/google-analytics-dashboard-setup.md');
    info('- docs/integration-example.ts');
  } catch (err) {
    error(`设置过程中出现错误: ${err.message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = {
  checkRequiredFiles,
  checkGA4Config,
  validateErrorCodes,
  checkPrivacyIntegration
};
