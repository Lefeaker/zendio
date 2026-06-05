#!/usr/bin/env node
// @ts-check

/**
 * 当前隐私与数据设置主链的只读校验脚本
 *
 * 这个脚本验证：
 * 1. Stitch overview schema 是否仍然承载隐私与数据卡片
 * 2. privacy domain view / persistence wiring 是否仍然存在
 * 3. i18n 消息与 options shell 根节点是否完整
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

function hasMessageKey(content, key) {
  return content.includes(`${key}:`) || content.includes(`"${key}":`);
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

function checkPrivacyOverviewSchema() {
  info('检查 overview schema 隐私卡片...');

  const schemaPath = 'src/options/stitch/schema/settings/overview.ts';
  const content = readFile(schemaPath);

  if (!content) {
    error(`无法读取 ${schemaPath}`);
    return false;
  }

  const requiredSnippets = [
    "title: '隐私与数据'",
    "bind: 'privacyAnalytics'",
    "bind: 'privacyErrorReporting'",
    "bind: 'privacyDebugMode'",
    "action: { id: 'overview:clearAnalyticsData' }",
    "action: { id: 'resource:open', args: ['privacy-policy'] }",
    "action: { id: 'resource:open', args: ['data-usage'] }"
  ];

  let schemaIsValid = true;
  requiredSnippets.forEach((snippet) => {
    if (content.includes(snippet)) {
      success(`overview schema 片段存在：${snippet}`);
    } else {
      error(`overview schema 缺少片段：${snippet}`);
      schemaIsValid = false;
    }
  });

  return schemaIsValid;
}

function checkPrivacyDomainView() {
  info('检查 privacy domain view...');

  const viewPath = 'src/ui/domains/privacy/PrivacySettingsView.ts';
  const content = readFile(viewPath);

  if (!content) {
    error(`无法读取 ${viewPath}`);
    return false;
  }

  const requiredSnippets = [
    'applyConsentSnapshot(snapshot: PrivacyConsentSnapshot)',
    'render(): HTMLElement | void',
    'async saveSettings(',
    'async getSettings(): Promise<{ analytics: boolean; errorReporting: boolean }>',
    'async shouldShowPrivacyReminder(): Promise<boolean>'
  ];

  let allSnippetsExist = true;
  requiredSnippets.forEach((snippet) => {
    if (content.includes(snippet)) {
      success(`privacy domain 片段存在：${snippet}`);
    } else {
      error(`privacy domain 缺少片段：${snippet}`);
      allSnippetsExist = false;
    }
  });

  return allSnippetsExist;
}

function checkOptionsShellHtml() {
  info('检查 Options shell HTML 根节点...');

  const htmlPath = 'src/options/index.html';
  const content = readFile(htmlPath);

  if (!content) {
    error(`无法读取 ${htmlPath}`);
    return false;
  }

  if (content.includes('optionsShellRoot')) {
    success('Options Stitch shell 根节点存在');
  } else {
    error('Options Stitch shell 根节点不存在');
    return false;
  }

  return true;
}

function checkPersistenceIntegration() {
  info('检查 persistence / telemetry 接线...');

  const persistencePath = 'src/options/app/productionStitchPersistence.ts';
  const content = readFile(persistencePath);

  if (!content) {
    error(`无法读取 ${persistencePath}`);
    return false;
  }

  const requiredSnippets = [
    "createTrackUsageEventMessage('privacy_consent_changed'",
    'enabled: nextSnapshot[field]',
    'prepareAnalyticsDataClearedEvent()',
    "outcome: 'completed'"
  ];

  let isValid = true;
  requiredSnippets.forEach((snippet) => {
    if (content.includes(snippet)) {
      success(`persistence 片段存在：${snippet}`);
    } else {
      error(`persistence 缺少片段：${snippet}`);
      isValid = false;
    }
  });

  const actionPath = 'src/options/app/actions/privacyConsentAction.ts';
  const actionContent = readFile(actionPath);
  if (!actionContent) {
    error(`无法读取 ${actionPath}`);
    return false;
  }

  if (actionContent.includes('privacyPreferences: snapshot')) {
    success('privacy consent action 会写入 privacyPreferences');
  } else {
    error('privacy consent action 未写入 privacyPreferences');
    isValid = false;
  }

  const finalEventPath = 'src/options/app/productionStitchFinalAnalyticsEvent.ts';
  const finalEventContent = readFile(finalEventPath);
  if (!finalEventContent) {
    error(`无法读取 ${finalEventPath}`);
    return false;
  }

  if (
    finalEventContent.includes("'analytics_data_cleared'") &&
    finalEventContent.includes("outcome: 'completed'")
  ) {
    success('analytics_data_cleared final event helper 存在');
  } else {
    error('analytics_data_cleared final event helper 不完整');
    isValid = false;
  }

  return isValid;
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
    'privacyFooterText',
    'privacyPolicyLink',
    'privacySettingsSaved',
    'privacyDataWillBeCleared'
  ];

  requiredMessages.forEach((message) => {
    if (hasMessageKey(messagesContent, message)) {
      success(`消息接口 ${message} 存在`);
    } else {
      error(`生成消息接口 ${message} 不存在`);
      allMessagesExist = false;
    }
  });

  // 检查各语言 catalog runtime 源
  languages.forEach((lang) => {
    const langPath = `src/i18n/catalog/messages/${lang}/runtime.json`;
    const langContent = readFile(langPath);

    if (!langContent) {
      error(`无法读取 ${langPath}`);
      allMessagesExist = false;
      return;
    }

    requiredMessages.forEach((message) => {
      if (hasMessageKey(langContent, message)) {
        success(`${lang} 语言的 ${message} 翻译存在`);
      } else {
        error(`${lang} 语言的 ${message} 翻译不存在`);
        allMessagesExist = false;
      }
    });
  });

  return allMessagesExist;
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
    console.log('\n🎉 所有测试通过！隐私与数据主链校验通过。');
  } else {
    console.log('\n⚠️  部分测试失败，请检查上述问题。');
  }
}

// 主函数
function main() {
  colorLog('blue', '🧪 隐私与数据主链校验');
  console.log('');

  const results = {
    'Overview Schema': checkPrivacyOverviewSchema(),
    'Privacy Domain View': checkPrivacyDomainView(),
    'Options Shell HTML': checkOptionsShellHtml(),
    'Persistence Integration': checkPersistenceIntegration(),
    'i18n 消息': checkI18nMessages()
  };

  generateTestReport(results);
}

// 运行测试
if (require.main === module) {
  main();
}

module.exports = {
  checkPrivacyOverviewSchema,
  checkPrivacyDomainView,
  checkOptionsShellHtml,
  checkPersistenceIntegration,
  checkI18nMessages
};
