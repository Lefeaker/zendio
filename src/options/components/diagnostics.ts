import { getElementById } from '../utils/dom';
import type { VaultConfig, RoutingRule } from '../../shared/types';
import type {
  StoredOptions,
  ReadingSessionOptions,
  FragmentClipperOptions,
  CompleteOptions
} from '../../shared/types/options';
import { collectPortEntriesFromConfig, findDuplicatePorts } from '../utils/ports';
import { getOptionsController } from '../app/optionsControllerContext';
import { getOptionsMessages } from '../app/i18nContext';
import { configProvider } from '../../shared/config/provider';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';
import type { IOptionsRepository } from '../../shared/repositories';

function interpolateDiagnosticsTemplate(
  template: string,
  values: Record<string, string | number | undefined>
): string {
  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    const value = values[token];
    return value === undefined ? match : String(value);
  });
}

function isEmptyOptions(options: StoredOptions | null | undefined): boolean {
  return !options || Object.keys(options).length === 0;
}

const REST_DEFAULTS = configProvider.getRestDefaults();
const TEMPLATE_DEFAULTS = configProvider.getTemplates();
const FRAGMENT_DEFAULTS = configProvider.getFragmentClipperDefaults();

const VALID_READING_EXPORT_MODES: ReadonlySet<ReadingSessionOptions['exportMode']> = new Set([
  'highlights',
  'full'
]);
const VALID_READING_THEMES: ReadonlySet<ReadingSessionOptions['highlightTheme']> = new Set([
  'gradient',
  'purple',
  'neonYellow',
  'neonGreen',
  'neonOrange'
]);

const VALID_FRAGMENT_KEYS: ReadonlySet<FragmentClipperOptions['selectionModifierKeys'][number]> =
  new Set(['alt', 'meta', 'ctrl', 'shift']);

async function resolveOptionsSnapshot(): Promise<StoredOptions | null> {
  const controller = getOptionsController();
  if (controller) {
    const snapshot = controller.getSnapshot();
    if (snapshot && !isEmptyOptions(snapshot)) {
      return snapshot;
    }
    return controller.loadRaw();
  }
  try {
    const optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
    return (await optionsRepository.get()) as StoredOptions;
  } catch (error) {
    console.error('[diagnostics] Failed to load options:', error);
    return null;
  }
}

export async function runDiagnostics(): Promise<void> {
  const diagSection = getElementById<HTMLElement>('diagSection');
  const diagOutput = getElementById<HTMLPreElement>('diagOutput');

  diagSection.style.display = 'block';
  diagOutput.textContent = '正在诊断...\n';

  try {
    const msgs = await getOptionsMessages();
    const options = await resolveOptionsSnapshot();
    diagOutput.textContent += buildDiagnosticsReport(options, msgs);
  } catch (error) {
    diagOutput.textContent += `\n❌ 诊断失败: ${error instanceof Error ? error.message : String(error)}\n`;
  }
}

export function buildDiagnosticsReport(
  options: StoredOptions | CompleteOptions | null | undefined,
  msgs?: Partial<{ portConflictDetected: string }>
): string {
  let report = '\n📋 当前配置:\n';
  report += JSON.stringify(options, null, 2) + '\n';

  report += '\n🔍 检查配置:\n';

  if (isEmptyOptions(options)) {
    report += '❌ 未找到配置\n';
    return report;
  }

  if (!options?.rest) {
    report += '❌ REST API 配置缺失\n';
  } else {
    const rest = options.rest;
    if (!rest.httpsUrl && !rest.httpUrl) {
      report += '⚠️ 未配置 HTTP/HTTPS URL\n';
    }
    if (!rest.apiKey) {
      report += '⚠️ 未配置 API Key\n';
    }
  }

  if (!options?.templates) {
    report += '⚠️ 未配置模板\n';
  } else {
    const templates = options.templates;
    if (!templates.article) {
      report += '⚠️ 未配置 Article 模板\n';
    }
    if (!templates.fragment) {
      report += '⚠️ 未配置 Fragment 模板\n';
    }
    if (!templates.ai) {
      report += '⚠️ 未配置 AI 模板\n';
    }
  }

  if (options?.vaultRouter) {
    const router = options.vaultRouter;
    const activeVaults = router.vaults?.filter((vault) => vault.enabled !== false) ?? [];
    report += '\n📦 多仓库配置:\n';
    if (activeVaults.length === 0) {
      report += '⚠️ 未配置额外仓库\n';
    } else {
      report += `✅ 启用的仓库数量: ${activeVaults.length}\n`;
    }
    const routerConfig = router;
    const legacyRulesCount = routerConfig.rules?.length ?? 0;
    const nestedRulesCount = activeVaults.reduce(
      (total: number, vault: VaultConfig & { rules?: RoutingRule[] }) => {
        return total + (vault.rules?.length ?? 0);
      },
      0
    );
    const totalRules = legacyRulesCount + nestedRulesCount;

    if (totalRules === 0) {
      report += 'ℹ️ 未配置路由规则\n';
    } else {
      report += `✅ 路由规则数量: ${totalRules}\n`;
    }
  } else {
    report += '\nℹ️ 未配置多仓库\n';
  }

  report += '\n🌐 域名映射:\n';
  const mappingCount = options?.domainMappings ? Object.keys(options.domainMappings).length : 0;
  if (!mappingCount) {
    report += 'ℹ️ 未配置域名映射\n';
  } else {
    report += `✅ 映射条目数量: ${mappingCount}\n`;
  }

  report += '\n🤖 AI 对话配置:\n';
  if (!options?.aiChat) {
    report += 'ℹ️ 未检测到 AI 对话配置\n';
  } else {
    const userName = options.aiChat.userName?.trim();
    if (!userName) {
      report += '⚠️ 用户名称为空，建议设置一个明确的称呼\n';
    } else {
      report += `✅ 用户名称: ${userName}\n`;
    }
  }

  report += '\n✂️ 片段剪藏配置:\n';
  if (!options?.fragmentClipper) {
    report += 'ℹ️ 未检测到片段剪藏配置\n';
  } else {
    const clipper = options.fragmentClipper;
    report += clipper.useFootnoteFormat
      ? '✅ 已启用脚注格式，兼容 Sidebar Highlights\n'
      : 'ℹ️ 未启用脚注格式\n';
    report += clipper.captureContext
      ? '✅ 将自动捕捉上下文\n'
      : 'ℹ️ 未捕捉上下文，仅保存选中文本\n';

    const contextLength = Number(clipper.contextLength ?? FRAGMENT_DEFAULTS.contextLength);
    if (!Number.isFinite(contextLength) || contextLength <= 0) {
      report += '❌ 上下文长度配置异常，应为正整数\n';
    } else if (contextLength < 50) {
      report += `⚠️ 上下文长度较短 (${contextLength})，可能无法提供足够引用信息\n`;
    } else {
      report += `✅ 上下文长度: ${contextLength}\n`;
    }

    if (clipper.selectionModifierEnabled) {
      const keys = (clipper.selectionModifierKeys ?? []).filter((key) =>
        VALID_FRAGMENT_KEYS.has(key)
      );
      if (keys.length === 0) {
        report += '⚠️ 已启用辅助键触发，但未配置具体按键\n';
      } else {
        report += `✅ 辅助键触发: ${keys.join(' + ')}\n`;
      }
    } else {
      report += 'ℹ️ 未启用辅助键触发操作\n';
    }
  }

  report += '\n📖 阅读模式配置:\n';
  if (!options?.readingSession) {
    report += 'ℹ️ 未检测到阅读模式配置\n';
  } else {
    const exportMode = options.readingSession.exportMode ?? 'highlights';
    if (!VALID_READING_EXPORT_MODES.has(exportMode as ReadingSessionOptions['exportMode'])) {
      report += `❌ 未知导出模式: ${String(exportMode)}\n`;
    } else {
      report += exportMode === 'full' ? '✅ 导出全文，并保留高亮标注\n' : 'ℹ️ 仅导出高亮片段\n';
    }

    const theme = options.readingSession.highlightTheme ?? 'gradient';
    if (!VALID_READING_THEMES.has(theme as ReadingSessionOptions['highlightTheme'])) {
      report += `⚠️ 未知的高亮主题: ${String(theme)}，将回退到默认主题\n`;
    } else {
      report += `✅ 高亮主题: ${theme}\n`;
    }
  }

  report += '\n🎬 视频模式:\n';
  if (!options?.video) {
    report += 'ℹ️ 未检测到视频模式配置\n';
  } else {
    report += options.video.floatingPromptEnabled
      ? '✅ 已启用视频笔记按钮，可在视频网站控制栏快速开启笔记模式\n'
      : 'ℹ️ 未启用视频笔记按钮\n';
  }

  report += '\n🔌 端口检查:\n';
  const portEntries = collectPortEntriesFromConfig(options?.rest, options?.vaultRouter?.vaults);
  const portConflicts = findDuplicatePorts(portEntries);
  if (portConflicts.length > 0) {
    const template = msgs?.portConflictDetected ?? '⚠️ 检测到端口冲突: {ports}';
    report += `${interpolateDiagnosticsTemplate(template, { ports: portConflicts.join(', ') })}\n`;
  } else {
    report += '✅ 仓库端口配置正常\n';
  }

  report += '\n诊断完成\n';
  return report;
}

export async function fixConfiguration(onAfterFix?: () => Promise<void> | void): Promise<void> {
  const diagOutput = getElementById<HTMLPreElement>('diagOutput');

  try {
    const options = await resolveOptionsSnapshot();

    if (isEmptyOptions(options) || !options?.rest) {
      diagOutput.textContent += '\n❌ 无法修复: 未找到配置\n';
      return;
    }

    diagOutput.textContent += '\n🔧 修复配置...\n';

    let baseUrl = options.rest.httpsUrl || options.rest.baseUrl || REST_DEFAULTS.baseUrl;

    if (baseUrl.startsWith('http://') && baseUrl.includes(`:${REST_DEFAULTS.httpsPort}`)) {
      baseUrl = baseUrl.replace('http://', 'https://');
      diagOutput.textContent += `✅ 修复: 将 HTTP://...${REST_DEFAULTS.httpsPort} 改为 HTTPS://...${REST_DEFAULTS.httpsPort}\n`;
    } else if (baseUrl.startsWith('https://') && baseUrl.includes(`:${REST_DEFAULTS.httpPort}`)) {
      baseUrl = baseUrl.replace('https://', 'http://');
      diagOutput.textContent += `✅ 修复: 将 HTTPS://...${REST_DEFAULTS.httpPort} 改为 HTTP://...${REST_DEFAULTS.httpPort}\n`;
    }

    const templates = options.templates || {};

    if (!templates.fragment) {
      templates.fragment = TEMPLATE_DEFAULTS.fragment;
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
        httpsUrl: options.rest.httpsUrl || REST_DEFAULTS.httpsUrl,
        httpUrl: options.rest.httpUrl || REST_DEFAULTS.httpUrl,
        baseUrl
      },
      templates: {
        article: templates.article || TEMPLATE_DEFAULTS.article,
        fragment: templates.fragment || TEMPLATE_DEFAULTS.fragment,
        ai: templates.ai || TEMPLATE_DEFAULTS.ai
      }
    };

    const controller = getOptionsController();
    if (controller) {
      await controller.saveSnapshot({ reason: 'manual', draft: newOptions });
    } else {
      const optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
      await optionsRepository.set(newOptions as CompleteOptions);
    }
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
