#!/usr/bin/env node
// @ts-check

/**
 * 测试隐私设置组件的脚本
 * 
 * 这个脚本验证：
 * 1. 隐私设置组件是否正确初始化
 * 2. i18n 消息是否完整
 * 3. HTML 结构是否正确
 */

const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
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

// 读取文件内容
function readFile(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch (err) {
    return null;
  }
}

// 检查隐私设置组件
function checkPrivacySettingsComponent() {
  info('检查隐私设置组件...');
  
  const componentPath = 'src/options/components/controls/privacySettings.ts';
  const content = readFile(componentPath);
  
  if (!content) {
    error(`无法读取 ${componentPath}`);
    return false;
  }

  // 检查关键方法
  const requiredMethods = [
    'render',
    'saveSettings',
    'clearAllData',
    'getSettings',
    'shouldShowPrivacyReminder'
  ];

  let allMethodsExist = true;
  requiredMethods.forEach(method => {
    if (content.includes(`${method}(`)) {
      success(`方法 ${method} 存在`);
    } else {
      error(`方法 ${method} 不存在`);
      allMethodsExist = false;
    }
  });

  // 检查导入
  const requiredImports = [
    'getAnalyticsConfigManager',
    'setAnalyticsConsent',
    'getOptionsMessages'
  ];

  requiredImports.forEach(importName => {
    if (content.includes(importName)) {
      success(`导入 ${importName} 存在`);
    } else {
      error(`导入 ${importName} 不存在`);
      allMethodsExist = false;
    }
  });

  return allMethodsExist;
}

// 检查 HTML 结构
function checkHtmlStructure() {
  info('检查 HTML 结构...');
  
  const htmlPath = 'src/options/index.html';
  const content = readFile(htmlPath);
  
  if (!content) {
    error(`无法读取 ${htmlPath}`);
    return false;
  }

  // 检查隐私设置容器
  if (content.includes('privacySettingsContainer')) {
    success('隐私设置容器存在');
  } else {
    error('隐私设置容器不存在');
    return false;
  }

  // 检查隐私设置样式
  if (content.includes('privacy-section')) {
    success('隐私设置样式存在');
  } else if (content.includes('privacy-settings')) {
    warning('检测到旧版隐私设置样式类名（privacy-settings）');
  } else {
    warning('隐私设置样式可能不存在');
  }

  // 检查隐私设置标题
  if (content.includes('privacySettingsTitle')) {
    success('隐私设置标题存在');
  } else {
    error('隐私设置标题不存在');
    return false;
  }

  return true;
}

// 检查 i18n 消息
function checkI18nMessages() {
  info('检查 i18n 消息...');
  
  const languages = ['zh-CN', 'en', 'ja'];
  let allMessagesExist = true;

  // 检查生成后的消息接口定义
  const messagesPath = 'src/i18n/generated/messages.generated.ts';
  const messagesContent = readFile(messagesPath);
  
  if (!messagesContent) {
    error(`无法读取 ${messagesPath}`);
    return false;
  }

  const requiredMessages = [
    'privacySettingsTitle',
    'privacySettingsDescription',
    'privacySettingsNote',
    'analyticsConsentTitle',
    'errorReportingConsentTitle',
    'savePrivacySettings',
    'clearAllAnalyticsData'
  ];

  requiredMessages.forEach(message => {
    if (messagesContent.includes(`${message}:`)) {
      success(`消息接口 ${message} 存在`);
    } else {
      error(`生成消息接口 ${message} 不存在`);
      allMessagesExist = false;
    }
  });

  // 检查各语言 catalog runtime 源
  languages.forEach(lang => {
    const langPath = `src/i18n/catalog/messages/${lang}/runtime.json`;
    const langContent = readFile(langPath);
    
    if (!langContent) {
      error(`无法读取 ${langPath}`);
      allMessagesExist = false;
      return;
    }

    requiredMessages.forEach(message => {
      if (langContent.includes(`${message}:`)) {
        success(`${lang} 语言的 ${message} 翻译存在`);
      } else {
        error(`${lang} 语言的 ${message} 翻译不存在`);
        allMessagesExist = false;
      }
    });
  });

  return allMessagesExist;
}

// 检查 bootstrap 集成
function checkBootstrapIntegration() {
  info('检查 bootstrap 集成...');
  
  const bootstrapPath = 'src/options/app/bootstrap.ts';
  const content = readFile(bootstrapPath);
  
  if (!content) {
    error(`无法读取 ${bootstrapPath}`);
    return false;
  }

  // 检查导入
  if (content.includes('PrivacySettings')) {
    success('PrivacySettings 导入存在');
  } else {
    error('PrivacySettings 导入不存在');
    return false;
  }

  // 检查初始化函数
  if (content.includes('initializePrivacySettings')) {
    success('initializePrivacySettings 函数存在');
  } else {
    error('initializePrivacySettings 函数不存在');
    return false;
  }

  // 检查函数调用
  if (content.includes('await initializePrivacySettings()')) {
    success('initializePrivacySettings 函数调用存在');
  } else {
    error('initializePrivacySettings 函数调用不存在');
    return false;
  }

  return true;
}

// 生成测试报告
function generateTestReport(results) {
  console.log('\n' + '='.repeat(50));
  colorLog('blue', '📊 测试报告');
  console.log('='.repeat(50));

  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  const failedTests = totalTests - passedTests;

  console.log(`总测试数: ${totalTests}`);
  colorLog('green', `通过: ${passedTests}`);
  if (failedTests > 0) {
    colorLog('red', `失败: ${failedTests}`);
  }

  console.log('\n详细结果:');
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ 通过' : '❌ 失败';
    console.log(`  ${test}: ${status}`);
  });

  if (passedTests === totalTests) {
    console.log('\n🎉 所有测试通过！隐私设置组件已正确集成。');
  } else {
    console.log('\n⚠️  部分测试失败，请检查上述问题。');
  }
}

// 主函数
function main() {
  colorLog('blue', '🧪 隐私设置组件测试');
  console.log('');

  const results = {
    '隐私设置组件': checkPrivacySettingsComponent(),
    'HTML 结构': checkHtmlStructure(),
    'i18n 消息': checkI18nMessages(),
    'Bootstrap 集成': checkBootstrapIntegration()
  };

  generateTestReport(results);
}

// 运行测试
if (require.main === module) {
  main();
}

module.exports = {
  checkPrivacySettingsComponent,
  checkHtmlStructure,
  checkI18nMessages,
  checkBootstrapIntegration
};
