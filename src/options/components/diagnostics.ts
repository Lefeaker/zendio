import { getElementById } from '../utils/dom';

export async function runDiagnostics(): Promise<void> {
  const diagSection = getElementById<HTMLElement>('diagSection');
  const diagOutput = getElementById<HTMLPreElement>('diagOutput');

  diagSection.style.display = 'block';
  diagOutput.textContent = '正在诊断...\n';

  try {
    const { options } = await chrome.storage.sync.get('options');
    diagOutput.textContent += '\n📋 当前配置:\n';
    diagOutput.textContent += JSON.stringify(options, null, 2) + '\n';

    diagOutput.textContent += '\n🔍 检查配置:\n';

    if (!options) {
      diagOutput.textContent += '❌ 未找到配置\n';
      return;
    }

    if (!options.rest) {
      diagOutput.textContent += '❌ REST API 配置缺失\n';
    } else {
      const rest = options.rest;
      if (!rest.httpsUrl && !rest.httpUrl) {
        diagOutput.textContent += '⚠️ 未配置 HTTP/HTTPS URL\n';
      }
      if (!rest.apiKey) {
        diagOutput.textContent += '⚠️ 未配置 API Key\n';
      }
    }

    if (!options.templates) {
      diagOutput.textContent += '⚠️ 未配置模板\n';
    } else {
      const templates = options.templates;
      if (!templates.article) {
        diagOutput.textContent += '⚠️ 未配置 Article 模板\n';
      }
      if (!templates.fragment) {
        diagOutput.textContent += '⚠️ 未配置 Fragment 模板\n';
      }
      if (!templates.ai) {
        diagOutput.textContent += '⚠️ 未配置 AI 模板\n';
      }
    }

    if (options.vaultRouter) {
      const router = options.vaultRouter;
      diagOutput.textContent += '\n📦 多仓库配置:\n';
      if (!router.vaults || router.vaults.length === 0) {
        diagOutput.textContent += '⚠️ 未配置额外仓库\n';
      } else {
        diagOutput.textContent += `✅ 额外仓库数量: ${router.vaults.length}\n`;
      }
      if (!router.rules || router.rules.length === 0) {
        diagOutput.textContent += 'ℹ️ 未配置路由规则\n';
      } else {
        diagOutput.textContent += `✅ 路由规则数量: ${router.rules.length}\n`;
      }
    } else {
      diagOutput.textContent += '\nℹ️ 未配置多仓库\n';
    }

    diagOutput.textContent += '\n诊断完成\n';
  } catch (error) {
    diagOutput.textContent += `\n❌ 诊断失败: ${error instanceof Error ? error.message : String(error)}\n`;
  }
}

export async function fixConfiguration(onAfterFix?: () => Promise<void> | void): Promise<void> {
  const diagOutput = getElementById<HTMLPreElement>('diagOutput');

  try {
    const { options } = await chrome.storage.sync.get('options');

    if (!options || !options.rest) {
      diagOutput.textContent += '\n❌ 无法修复: 未找到配置\n';
      return;
    }

    diagOutput.textContent += '\n🔧 修复配置...\n';

    let baseUrl = options.rest.httpsUrl || options.rest.baseUrl || 'https://127.0.0.1:27124/';

    if (baseUrl.startsWith('http://') && baseUrl.includes(':27124')) {
      baseUrl = baseUrl.replace('http://', 'https://');
      diagOutput.textContent += '✅ 修复: 将 HTTP://...27124 改为 HTTPS://...27124\n';
    } else if (baseUrl.startsWith('https://') && baseUrl.includes(':27123')) {
      baseUrl = baseUrl.replace('https://', 'http://');
      diagOutput.textContent += '✅ 修复: 将 HTTPS://...27123 改为 HTTP://...27123\n';
    }

    const templates = options.templates || {};

    if (!templates.fragment) {
      templates.fragment = 'Fragments/{yyyy}/{mm}/{dd}/{title}.md';
      diagOutput.textContent += '✅ 添加: fragment 模板\n';
    }

    if (templates.article && templates.article.includes('Clippings/')) {
      templates.article = templates.article.replace('Clippings/', 'Articles/');
      diagOutput.textContent += '✅ 更新: article 模板 (Clippings → Articles)\n';
    }

    const newOptions = {
      ...options,
      rest: {
        ...options.rest,
        httpsUrl: options.rest.httpsUrl || 'https://127.0.0.1:27124/',
        httpUrl: options.rest.httpUrl || 'http://127.0.0.1:27123/',
        baseUrl
      },
      templates: {
        article: templates.article || 'Articles/{domain}/{yyyy}/{slug}.md',
        fragment: templates.fragment || 'Fragments/{yyyy}/{mm}/{dd}/{title}.md',
        ai: templates.ai || 'AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md'
      }
    };

    await chrome.storage.sync.set({ options: newOptions });
    diagOutput.textContent += '✅ 配置已修复并保存\n';
    diagOutput.textContent += '\n请重新加载页面查看修复后的配置\n';

    if (onAfterFix) {
      window.setTimeout(() => {
        void (async () => {
          await onAfterFix();
          await runDiagnostics();
        })();
      }, 1000);
    }
  } catch (error) {
    diagOutput.textContent += `\n❌ 修复失败: ${error instanceof Error ? error.message : String(error)}\n`;
  }
}
