import { createActionRuntime } from '@options/schema-runtime/actionRuntime';
import { createSchemaRenderer } from '@options/schema-runtime/renderer';
import { mergeOptions } from '@shared/config/optionsMerger';
import { configProvider } from '@shared/config/provider';
import {
  DEFAULT_USAGE_STATS,
  normalizeUsageStats,
  USAGE_STATS_STORAGE_KEY
} from '@shared/constants';
import { DI_TOKENS } from '@shared/di/tokens';
import { resolveRepository } from '@shared/di/serviceRegistry';
import type { StorageService } from '@platform/interfaces/storage';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { CompleteOptions, InterfaceTheme, StoredOptions } from '@shared/types/options';
import type { UsageStats } from '@shared/types/usage';
import type { ConnectionTestResult } from '@shared/types/connection';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';
import type {
  RoutingRule as StoredRoutingRule,
  RoutingRuleType,
  VaultConfig,
  VaultRouterConfig
} from '@shared/types/vault';
import type { Language, Messages } from '@i18n';
import { persistPrivacyConsentAction, resetUsageStatsAction } from '@options/app/actions';
import { requestConnectionTest } from '@options/services/connectionTester';
import { applyAnalyticsTransferPayload } from '@options/services/analyticsTransfer';
import {
  parseConfigInput,
  readConfigTextFromClipboard,
  writeToClipboard
} from '@options/services/configTransfer';
import { buildDiagnosticsReport } from '@options/components/diagnostics';
import { parseClassifierTaxonomy } from '@options/services/validation';
import { clear, el } from '@options/stitch/ui/dom';
import { previewUi } from '@options/stitch/ui/components';
import { previewContent } from '@options/stitch/content';
import { normalizeOptionsForTransfer } from '@options/utils/optionsTransfer';
import { YamlConfigWidget } from '@options/widgets';
import { resolveTaxonomy } from '@shared/config/taxonomyMigration';
import {
  getAnalyticsConfigManager,
  setAnalyticsConsent
} from '@shared/errors/analytics/analyticsConfig';
import type { WidgetMountContract as OptionsWidgetMountContract } from '@options/widgets/contracts';
import {
  buildAppShell,
  buildPanelStack,
  buildScrollSection,
  buildSidebar
} from '@options/stitch/render/shellBuilders';
import { getFooterMeta, getFooterView, getSettingsView } from '@options/stitch/schema/registry';
import { renderPreviewView } from '@options/stitch/render/renderStitchView';
import type {
  PreviewContent,
  PreviewStoreState,
  RoutingRule,
  SchemaContext,
  VaultRecord,
  ViewSchema
} from '@options/stitch/types';
import type { OptionsController } from './optionsController';

export interface MountedProductionStitchShell {
  cleanup(): void;
  collectDraft(): CompleteOptions;
  refreshOptions(options?: StoredOptions | CompleteOptions | null): void;
  setMessages(messages: Messages | null, language: Language): void;
}

export interface ProductionStitchShellDependencies {
  root?: HTMLElement | null;
  controller: OptionsController;
  initialOptions?: StoredOptions | CompleteOptions | null;
  messages?: Messages | null;
  language: Language;
  changeLanguage?: (
    language: Language
  ) => Promise<{ messages: Messages | null; language: Language }>;
  optionsRepository?: Pick<IOptionsRepository, 'get' | 'set' | 'onChange'>;
  messagingRepository?: Pick<IMessagingRepository, 'send' | 'onMessage'>;
  storage?: StorageService;
  now?: () => number;
}

const MODIFIER_LABEL_TO_OPTION = {
  Alt: 'alt',
  'Cmd / Meta': 'meta',
  Ctrl: 'ctrl',
  Shift: 'shift'
} as const;

const MODIFIER_OPTION_TO_LABEL = {
  alt: 'Alt',
  meta: 'Cmd / Meta',
  ctrl: 'Ctrl',
  shift: 'Shift'
} as const;

const RUNTIME_SURFACE_RESOURCE_IDS = new Set(['clipper', 'reader', 'video', 'task-success']);
const LEGACY_USAGE_STATS_STORAGE_KEY = 'usage_stats';
const PACKAGE_VERSION = '0.2.0';
const HIGHLIGHT_THEME_CLASSES: Record<CompleteOptions['readingSession']['highlightTheme'], string> =
  {
    gradient: 'highlight-gradient',
    purple: 'highlight-purple',
    neonYellow: 'highlight-neon-yellow',
    neonGreen: 'highlight-neon-green',
    neonOrange: 'highlight-neon-orange'
  };

function isHighlightTheme(
  value: string
): value is CompleteOptions['readingSession']['highlightTheme'] {
  return Object.prototype.hasOwnProperty.call(HIGHLIGHT_THEME_CLASSES, value);
}

function createYamlFieldStates(appData: PreviewContent): Record<string, string> {
  const states: Record<string, string> = {};
  for (const group of appData.output.yamlRows) {
    for (const [field, , modes] of group.rows) {
      for (const [mode, status] of Object.entries(modes)) {
        states[`${field}:${mode}`] = status;
      }
    }
  }
  return states;
}

function createInitialStitchState(appData: PreviewContent): PreviewStoreState {
  return {
    activePanel: 'overview',
    activeResource: null,
    previewTheme: resolveStoredTheme(),
    interfaceThemePreference: resolveThemePreference(),
    previewLanguage: 'zh-CN',
    yamlFilter: 'all',
    readingPathMode: 'custom',
    pageSummaryEnabled: false,
    readingOverlaySummaryEnabled: false,
    subtitleTranslationEnabled: false,
    subtitleTargetLanguage: 'zh-CN',
    experimentalAiConfig: { ...appData.experimental.aiDefaults },
    highlightTheme: 'gradient',
    readingExportMode: 'full',
    aiUserName: 'USER',
    aiIncludeTimestamps: false,
    privacyAnalytics: false,
    privacyErrorReporting: false,
    privacyDebugMode: false,
    privacyStatus: '',
    deepResearchPureMode: false,
    classifierEnabled: false,
    classifierProvider: 'ollama',
    classifierEndpoint: 'http://localhost:11434/api/chat',
    classifierModel: 'llama3.1',
    classifierApiKey: '',
    classifierTaxonomyText: '',
    videoFloatingPromptEnabled: true,
    videoPromptButtonLabel: '开启视频笔记',
    videoPromptShortcut: 'Alt+V',
    videoPromptPositionX: 24,
    videoPromptPositionY: 24,
    fragmentUseFootnoteFormat: true,
    fragmentCaptureContext: true,
    fragmentContextLength: 200,
    fragmentContextMode: 'chars',
    fragmentKeyboardShortcutsEnabled: true,
    fragmentModifierEnabled: true,
    modifierKeys: ['Alt'],
    yamlFieldStates: createYamlFieldStates(appData),
    routingRules: appData.storage.routingRules.map((rule) => ({ ...rule })),
    templateValues: { ...appData.output.templateDefaults },
    activeTemplateField: 'articleVideo',
    pendingTemplateFocus: null,
    pendingTemplateSelection: null,
    maintenanceLog: appData.maintenanceLog
  };
}

function resolveThemePreference(options?: StoredOptions | CompleteOptions | null): InterfaceTheme {
  if (
    options?.interfaceTheme === 'light' ||
    options?.interfaceTheme === 'dark' ||
    options?.interfaceTheme === 'system'
  ) {
    return options.interfaceTheme;
  }
  try {
    const stored = window.localStorage.getItem('aob-theme');
    if (stored === 'light' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage can be unavailable in isolated test contexts.
  }
  return 'dark';
}

function resolveSystemPreviewTheme(): PreviewStoreState['previewTheme'] {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

function resolveStoredTheme(
  options?: StoredOptions | CompleteOptions | null
): PreviewStoreState['previewTheme'] {
  const preference = resolveThemePreference(options);
  return preference === 'system' ? resolveSystemPreviewTheme() : preference;
}

function persistTheme(preference: InterfaceTheme): PreviewStoreState['previewTheme'] {
  const resolved = preference === 'system' ? resolveSystemPreviewTheme() : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.previewTheme = resolved;
  document.body.dataset.previewTheme = resolved;
  try {
    window.localStorage.setItem('aob-theme', preference);
  } catch {
    // localStorage can be unavailable in isolated test contexts.
  }
  return resolved;
}

function createThemeMediaQuery(): Pick<MediaQueryList, 'addEventListener' | 'removeEventListener'> {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return {
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    };
  }
}

function createLocalOptionsRepositoryFallback(): IOptionsRepository {
  let snapshot = mergeOptions(null) as CompleteOptions;
  const listeners = new Set<(options: CompleteOptions) => void>();
  return {
    get() {
      return Promise.resolve(snapshot);
    },
    set(options) {
      snapshot = mergeOptions({ ...snapshot, ...options }) as CompleteOptions;
      listeners.forEach((listener) => listener(snapshot));
      return Promise.resolve();
    },
    onChange(callback) {
      listeners.add(callback);
      callback(snapshot);
      return () => {
        listeners.delete(callback);
      };
    }
  };
}

function createLocalMessagingRepositoryFallback(): IMessagingRepository {
  return {
    send<T>() {
      return Promise.resolve(undefined as T);
    },
    onMessage() {
      return () => {};
    }
  };
}

function createPresetYamlConfig(
  preset: 'Minimal' | 'Research' | 'Conversation'
): YamlConfigOverrides | null {
  if (preset === 'Minimal') {
    return {
      contentTypes: {
        article: {
          customFields: []
        },
        clipper: {
          customFields: []
        },
        video: {
          customFields: []
        },
        ai_chat: {
          customFields: []
        }
      }
    };
  }

  if (preset === 'Conversation') {
    return {
      contentTypes: {
        ai_chat: {
          customFields: [
            {
              name: 'topic',
              type: 'text',
              enabled: true,
              valuePath: 'metadata.topic',
              isCustom: true
            },
            {
              name: 'session_id',
              type: 'text',
              enabled: true,
              valuePath: 'metadata.sessionId',
              isCustom: true
            }
          ],
          domainOverrides: {
            'chatgpt.com': [
              { name: 'platform', type: 'text', enabled: true, defaultValue: 'ChatGPT' }
            ],
            'claude.ai': [{ name: 'platform', type: 'text', enabled: true, defaultValue: 'Claude' }]
          }
        }
      }
    };
  }

  return {
    globalFields: [
      { name: 'workspace', type: 'text', enabled: true, defaultValue: 'research', isCustom: true }
    ],
    contentTypes: {
      article: {
        customFields: [
          {
            name: 'status',
            type: 'array',
            enabled: true,
            defaultValue: ['unread'],
            isCustom: true
          },
          {
            name: 'workspace',
            type: 'text',
            enabled: true,
            defaultValue: 'research',
            isCustom: true
          },
          {
            name: 'citation_key',
            type: 'text',
            enabled: true,
            valuePath: 'metadata.citationKey',
            isCustom: true
          }
        ],
        domainOverrides: {
          'arxiv.org': [
            {
              name: 'citation_key',
              type: 'text',
              enabled: true,
              valuePath: 'metadata.citationKey'
            },
            { name: 'authors', type: 'array', enabled: true, valuePath: 'metadata.authors' }
          ],
          'mp.weixin.qq.com': [
            {
              name: 'official_account',
              type: 'text',
              enabled: true,
              valuePath: 'metadata.wechat.account'
            }
          ]
        }
      },
      clipper: {
        customFields: [
          {
            name: 'workspace',
            type: 'text',
            enabled: true,
            defaultValue: 'research',
            isCustom: true
          }
        ]
      }
    }
  };
}

function resolveOptionsRepositoryFallback(): IOptionsRepository {
  try {
    return resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  } catch {
    return createLocalOptionsRepositoryFallback();
  }
}

function resolveMessagingRepositoryFallback(): IMessagingRepository {
  try {
    return resolveRepository<IMessagingRepository>(DI_TOKENS.IMessagingRepository);
  } catch {
    return createLocalMessagingRepositoryFallback();
  }
}

function resolveRoot(root?: HTMLElement | null): HTMLElement {
  const target = root ?? document.getElementById('optionsShellRoot');
  if (!target) {
    throw new Error('[Options] Missing #optionsShellRoot for Stitch shell.');
  }
  return target;
}

function toVaultRecord(options: CompleteOptions): VaultRecord[] {
  const routerVaults = options.vaultRouter?.vaults ?? [];
  if (routerVaults.length) {
    const defaultVaultId = options.vaultRouter?.defaultVaultId;
    return routerVaults.map((vault) => {
      const isDefault = Boolean(vault.isDefault || vault.id === defaultVaultId);
      return {
        id: vault.id,
        name: vault.name || vault.vault,
        https: vault.httpsUrl,
        http: vault.httpUrl,
        key: vault.apiKey,
        enabled: isDefault ? true : (vault.enabled ?? true),
        isDefault
      };
    });
  }

  return [
    {
      id: 'default',
      name: options.rest.vault,
      https: options.rest.httpsUrl ?? options.rest.baseUrl,
      http: options.rest.httpUrl ?? options.rest.baseUrl,
      key: options.rest.apiKey,
      enabled: true,
      isDefault: true
    }
  ];
}

function toRoutingRules(options: CompleteOptions): RoutingRule[] {
  const vaultById = new Map((options.vaultRouter?.vaults ?? []).map((vault) => [vault.id, vault]));
  const rules = [
    ...(options.vaultRouter?.rules ?? []),
    ...(options.vaultRouter?.vaults ?? []).flatMap((vault) => vault.rules ?? [])
  ];

  return rules.map((rule) => ({
    type:
      rule.type === 'url-pattern' ? 'URL Pattern' : rule.type === 'keyword' ? 'Keyword' : 'Domain',
    pattern: rule.pattern,
    target:
      vaultById.get(rule.vaultId)?.name ?? vaultById.get(rule.vaultId)?.vault ?? options.rest.vault,
    priority: rule.priority,
    enabled: rule.enabled
  }));
}

function toTemplateValues(options: CompleteOptions): Record<string, string> {
  return {
    articleVideo: options.templates.article,
    fragment: options.templates.fragment,
    readingCustom: options.templates.reading,
    aiChat: options.templates.ai
  };
}

function resolveExtensionVersionLabel(): string {
  try {
    const version = chrome?.runtime?.getManifest?.().version;
    if (typeof version === 'string' && version.trim().length > 0) {
      return `v${version.trim()}`;
    }
  } catch {
    // Browser extension APIs are unavailable in unit tests and some preview contexts.
  }
  return `v${PACKAGE_VERSION}`;
}

function resolveUsageStatsFromOptions(options: CompleteOptions): UsageStats {
  return normalizeUsageStats((options as CompleteOptions & { usageStats?: unknown }).usageStats);
}

function usageHistoryLabel(date: string): string {
  const parts = date.split('-');
  if (parts.length === 3) {
    return `${parts[1]}-${parts[2]}`;
  }
  return date;
}

function usageStatsToOverview(usageStats: UsageStats): PreviewContent['overview'] {
  const total = usageStats.aiChatSaves + usageStats.fragmentSaves + usageStats.articleSaves;
  return {
    ...previewContent.overview,
    stats: [
      { label: 'Total saved', value: total },
      { label: 'AI conversations', value: usageStats.aiChatSaves },
      { label: 'Reading + Video + Fragment', value: usageStats.fragmentSaves },
      { label: 'Articles', value: usageStats.articleSaves }
    ],
    history: usageStats.history.map((entry) => ({
      label: usageHistoryLabel(entry.date),
      value: entry.aiChat + entry.fragment + entry.article
    }))
  };
}

function resolveReadingPathMode(options: CompleteOptions): string {
  if (options.templates.reading === options.templates.article) {
    return 'article';
  }
  if (options.templates.reading === options.templates.fragment) {
    return 'fragment';
  }
  return 'custom';
}

function labelsFromModifierOptions(keys: readonly string[]): string[] {
  return keys
    .map((key) => MODIFIER_OPTION_TO_LABEL[key as keyof typeof MODIFIER_OPTION_TO_LABEL])
    .filter((value) => Boolean(value));
}

function optionsFromModifierLabels(
  labels: readonly string[]
): Array<'alt' | 'meta' | 'ctrl' | 'shift'> {
  return labels
    .map((label) => MODIFIER_LABEL_TO_OPTION[label as keyof typeof MODIFIER_LABEL_TO_OPTION])
    .filter((value): value is 'alt' | 'meta' | 'ctrl' | 'shift' => Boolean(value));
}

function applyOptionsToState(
  state: PreviewStoreState,
  options: CompleteOptions,
  appData: PreviewContent
): PreviewStoreState {
  return {
    ...state,
    experimentalAiConfig: { ...options.experimentalAi },
    pageSummaryEnabled: false,
    readingOverlaySummaryEnabled: false,
    subtitleTranslationEnabled: false,
    subtitleTargetLanguage: options.subtitleTranslation.targetLanguage,
    highlightTheme: options.readingSession.highlightTheme,
    readingExportMode: options.readingSession.exportMode,
    aiUserName: options.aiChat.userName,
    aiIncludeTimestamps: options.aiChat.includeTimestamps,
    privacyAnalytics: Boolean(
      (options as { privacyPreferences?: { analytics?: boolean } }).privacyPreferences?.analytics
    ),
    privacyErrorReporting: Boolean(
      (options as { privacyPreferences?: { errorReporting?: boolean } }).privacyPreferences
        ?.errorReporting
    ),
    privacyDebugMode: Boolean(
      (options as { privacyPreferences?: { debugMode?: boolean } }).privacyPreferences?.debugMode
    ),
    deepResearchPureMode: options.deepResearch.pureMode,
    classifierEnabled: options.classifier.enabled,
    classifierProvider: options.classifier.provider,
    classifierEndpoint: options.classifier.endpoint,
    classifierModel: options.classifier.model,
    classifierApiKey: options.classifier.apiKey,
    classifierTaxonomyText: JSON.stringify(options.classifier.taxonomy, null, 2),
    videoFloatingPromptEnabled: options.video.floatingPromptEnabled,
    videoPromptButtonLabel: options.video.promptButtonLabel,
    videoPromptShortcut: options.video.promptShortcut,
    videoPromptPositionX: options.video.promptPosition?.x ?? 24,
    videoPromptPositionY: options.video.promptPosition?.y ?? 24,
    fragmentUseFootnoteFormat: options.fragmentClipper.useFootnoteFormat,
    fragmentCaptureContext: options.fragmentClipper.captureContext,
    fragmentContextLength: options.fragmentClipper.contextLength,
    fragmentContextMode: options.fragmentClipper.contextMode,
    fragmentKeyboardShortcutsEnabled: options.fragmentClipper.keyboardShortcutsEnabled,
    fragmentModifierEnabled: options.fragmentClipper.selectionModifierEnabled,
    modifierKeys: labelsFromModifierOptions(options.fragmentClipper.selectionModifierKeys),
    routingRules: toRoutingRules(options),
    templateValues: toTemplateValues(options),
    readingPathMode: resolveReadingPathMode(options),
    yamlFieldStates: createYamlFieldStates(appData),
    maintenanceLog: appData.maintenanceLog
  };
}

function createProductionContent(
  base: PreviewContent,
  options: CompleteOptions,
  overrides: {
    connectionNotice?: PreviewContent['storage']['connectionNotice'];
    maintenanceLog?: string;
  } = {}
): PreviewContent {
  const usageStats = resolveUsageStatsFromOptions(options);
  return {
    ...base,
    brand: {
      ...base.brand,
      title: 'All in Ob',
      subtitle: resolveExtensionVersionLabel()
    },
    surfaceLinks: [],
    overview: usageStatsToOverview(usageStats),
    storage: {
      ...base.storage,
      vaults: toVaultRecord(options),
      routingRules: toRoutingRules(options),
      rootDir: options.rest.rootDir ?? '',
      ...(overrides.connectionNotice ? { connectionNotice: overrides.connectionNotice } : {})
    },
    output: {
      ...base.output,
      templateDefaults: toTemplateValues(options),
      domainMappings: Object.entries(options.domainMappings).map(([domain, alias]) => [
        domain,
        alias,
        'Production mapping'
      ])
    },
    experimental: {
      ...base.experimental,
      aiDefaults: { ...options.experimentalAi }
    },
    maintenanceLog: overrides.maintenanceLog ?? base.maintenanceLog
  };
}

function localizeStitchContent(content: PreviewContent, language: string): PreviewContent {
  const useChinese = language !== 'en';
  if (!useChinese) {
    return content;
  }

  const navLabels: Record<string, string> = {
    overview: '总览',
    storage: '仓库',
    'capture-sources': '采集来源',
    'capture-behavior': '采集行为',
    output: '输出与元数据',
    experimental: '实验功能',
    maintenance: '维护'
  };
  const resourceLabels: Record<string, string> = {
    onboarding: '首次引导',
    'plugin-setup': '插件设置',
    support: '支持',
    suggestions: '建议',
    contact: '联系',
    changelog: '更新日志'
  };
  const surfaceLabels: Record<string, string> = {
    clipper: '剪藏弹窗',
    reader: '阅读模式',
    video: '视频模式',
    'video-floating-prompt': '视频启动提示',
    'task-success': '任务完成'
  };

  return {
    ...content,
    brand: {
      ...content.brand,
      title: 'All in Ob'
    },
    nav: content.nav.map((item) => ({
      ...item,
      label: navLabels[item.id] ?? item.label
    })),
    sidebarLinks: content.sidebarLinks.map((item) => ({
      ...item,
      label: resourceLabels[item.id] ?? item.label
    })),
    surfaceLinks: content.surfaceLinks.map((item) => ({
      ...item,
      label: surfaceLabels[item.id] ?? item.label
    })),
    overview: { ...content.overview, hero: { ...content.overview.hero, title: '总览' } },
    storage: { ...content.storage, hero: { ...content.storage.hero, title: '仓库' } },
    captureSources: {
      ...content.captureSources,
      hero: { ...content.captureSources.hero, title: '采集来源' }
    },
    captureBehavior: {
      ...content.captureBehavior,
      hero: { ...content.captureBehavior.hero, title: '采集行为' }
    },
    output: { ...content.output, hero: { ...content.output.hero, title: '输出与元数据' } },
    experimental: {
      ...content.experimental,
      hero: { ...content.experimental.hero, title: '实验功能' }
    }
  };
}

export function mountProductionStitchShell({
  root,
  controller,
  initialOptions = null,
  language,
  messages = null,
  changeLanguage,
  optionsRepository,
  messagingRepository,
  storage,
  now
}: ProductionStitchShellDependencies): MountedProductionStitchShell {
  const mountRoot = resolveRoot(root);
  const resolvedOptionsRepository = optionsRepository ?? resolveOptionsRepositoryFallback();
  const resolvedMessagingRepository = messagingRepository ?? resolveMessagingRepositoryFallback();
  let draft = mergeOptions(initialOptions) as CompleteOptions;
  let currentLanguage = language;
  let currentMessages = messages;
  let connectionNotice: PreviewContent['storage']['connectionNotice'] | undefined;
  let maintenanceLog = previewContent.maintenanceLog;
  let appData = createProductionContent(previewContent, draft, { maintenanceLog });
  let state = applyOptionsToState(createInitialStitchState(appData), draft, appData);
  state.interfaceThemePreference = resolveThemePreference(draft);
  state.previewTheme = resolveStoredTheme(draft);
  state.previewLanguage = currentLanguage;
  state.previewTheme = persistTheme(state.interfaceThemePreference);
  const themeMediaQuery = createThemeMediaQuery();
  const widgetInstances = new Set<
    OptionsWidgetMountContract<Record<string, unknown>, Partial<CompleteOptions>>
  >();
  const dirtyWidgetKeys = new Set<string>();

  function mutate(
    mutator: (draftState: PreviewStoreState) => void,
    options: { silent?: boolean } = {}
  ): void {
    mutator(state);
    if (!options.silent) {
      render();
    }
  }

  function getLocalizedContent(): PreviewContent {
    const localizedAppData = localizeStitchContent(appData, currentLanguage);
    return {
      ...localizedAppData,
      brand: {
        ...localizedAppData.brand,
        title: 'All in Ob',
        subtitle: resolveExtensionVersionLabel(),
        logo: '../icons/bannerlogo-128.png'
      }
    };
  }

  function createSchemaContext(): SchemaContext {
    return {
      appData: getLocalizedContent(),
      state
    };
  }

  function refreshAppData(): void {
    appData = createProductionContent(previewContent, draft, {
      ...(connectionNotice ? { connectionNotice } : {}),
      maintenanceLog
    });
    state.maintenanceLog = maintenanceLog;
  }

  function ensureVaultRouter(): VaultRouterConfig {
    if (!draft.vaultRouter?.vaults?.length) {
      draft.vaultRouter = {
        defaultVaultId: 'default',
        vaults: [
          {
            id: 'default',
            name: draft.rest.vault,
            vault: draft.rest.vault,
            httpsUrl: draft.rest.httpsUrl ?? draft.rest.baseUrl,
            httpUrl: draft.rest.httpUrl ?? draft.rest.baseUrl,
            apiKey: draft.rest.apiKey,
            enabled: true,
            isDefault: true
          }
        ],
        rules: []
      };
    }
    return draft.vaultRouter;
  }

  function syncDefaultRestFromVault(vault: VaultConfig): void {
    draft.rest.vault = vault.name || vault.vault;
    draft.rest.baseUrl = vault.httpsUrl || vault.httpUrl || draft.rest.baseUrl;
    draft.rest.httpsUrl = vault.httpsUrl;
    draft.rest.httpUrl = vault.httpUrl;
    draft.rest.apiKey = vault.apiKey;
  }

  function syncDefaultVaultFromRest(): void {
    const router = ensureVaultRouter();
    const defaultVault =
      router.vaults.find((vault) => vault.id === router.defaultVaultId) ?? router.vaults[0];
    if (!defaultVault) {
      return;
    }
    defaultVault.name = draft.rest.vault;
    defaultVault.vault = draft.rest.vault;
    defaultVault.httpsUrl = draft.rest.httpsUrl ?? draft.rest.baseUrl;
    defaultVault.httpUrl = draft.rest.httpUrl ?? draft.rest.baseUrl;
    defaultVault.apiKey = draft.rest.apiKey;
    defaultVault.enabled = true;
    defaultVault.isDefault = true;
  }

  function toStoredRuleType(type: string): RoutingRuleType {
    if (type === 'URL Pattern') {
      return 'url-pattern';
    }
    if (type === 'Keyword') {
      return 'keyword';
    }
    return 'domain';
  }

  function resolveVaultIdByLabel(label: string, router: VaultRouterConfig): string {
    const matched = router.vaults.find((vault) =>
      [vault.id, vault.name, vault.vault].filter(Boolean).includes(label)
    );
    return matched?.id ?? router.defaultVaultId ?? router.vaults[0]?.id ?? 'default';
  }

  function syncRoutingRulesToDraft(): void {
    const router = ensureVaultRouter();
    const existingRules = router.rules ?? [];
    router.rules = state.routingRules.map(
      (rule, index): StoredRoutingRule => ({
        id: existingRules[index]?.id ?? `rule-${index + 1}`,
        vaultId: resolveVaultIdByLabel(rule.target, router),
        type: toStoredRuleType(rule.type),
        pattern: rule.pattern,
        enabled: Boolean(rule.enabled),
        priority: Number(rule.priority) || 0
      })
    );
    draft.vaultRouter = router;
  }

  function syncDomainEntries(entries: Array<[string, string]>): void {
    draft.domainMappings = entries.reduce<Record<string, string>>((next, [domain, alias]) => {
      const key = domain.trim();
      if (key) {
        next[key] = alias.trim();
      }
      return next;
    }, {});
  }

  function currentDomainEntries(): Array<[string, string]> {
    return Object.entries(draft.domainMappings);
  }

  function getPrivacySnapshot(): {
    analytics: boolean;
    errorReporting: boolean;
    debugMode: boolean;
  } {
    const current = (
      draft as {
        privacyPreferences?: { analytics?: boolean; errorReporting?: boolean; debugMode?: boolean };
      }
    ).privacyPreferences;
    return {
      analytics: Boolean(current?.analytics),
      errorReporting: Boolean(current?.errorReporting),
      debugMode: Boolean(current?.debugMode)
    };
  }

  function getMessage(key: keyof Messages, fallback: string): string {
    const value = currentMessages?.[key];
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  }

  function eventButton(value: unknown): HTMLButtonElement | null {
    return value instanceof Event && value.currentTarget instanceof HTMLButtonElement
      ? value.currentTarget
      : null;
  }

  function setButtonBusy(button: HTMLButtonElement | null, busy: boolean): void {
    if (!button) {
      return;
    }
    button.disabled = busy;
    if (busy) {
      button.setAttribute('aria-busy', 'true');
    } else {
      button.removeAttribute('aria-busy');
    }
  }

  async function persistPrivacyPreference(
    field: 'analytics' | 'errorReporting' | 'debugMode',
    value: boolean
  ): Promise<void> {
    const nextSnapshot = {
      ...getPrivacySnapshot(),
      [field]: value
    };
    if ((!nextSnapshot.analytics || !nextSnapshot.errorReporting) && nextSnapshot.debugMode) {
      nextSnapshot.debugMode = false;
    }
    (draft as Record<string, unknown>).privacyPreferences = nextSnapshot;
    state.privacyAnalytics = nextSnapshot.analytics;
    state.privacyErrorReporting = nextSnapshot.errorReporting;
    state.privacyDebugMode = nextSnapshot.debugMode;
    if (field === 'debugMode') {
      await getAnalyticsConfigManager().updateConfig({ debugMode: nextSnapshot.debugMode });
    } else {
      await setAnalyticsConsent(nextSnapshot.analytics, nextSnapshot.errorReporting);
      if (!nextSnapshot.debugMode) {
        await getAnalyticsConfigManager().updateConfig({ debugMode: false });
      }
    }
    await persistPrivacyConsentAction(nextSnapshot, {
      optionsRepository: resolvedOptionsRepository
    });
    controller.scheduleAutoSave(() => mounted.collectDraft());
  }

  async function clearAnalyticsPrivacyData(): Promise<void> {
    const shouldClear =
      typeof window.confirm === 'function'
        ? window.confirm(getMessage('confirmClearAllData', '清空全部分析数据？'))
        : true;
    if (!shouldClear) {
      return;
    }
    try {
      const nextSnapshot = {
        analytics: false,
        errorReporting: false,
        debugMode: false
      };
      await getAnalyticsConfigManager().clearAllData();
      (draft as Record<string, unknown>).privacyPreferences = nextSnapshot;
      state.privacyAnalytics = false;
      state.privacyErrorReporting = false;
      state.privacyDebugMode = false;
      state.privacyStatus = getMessage('allDataCleared', '所有分析数据已清除。');
      await persistPrivacyConsentAction(nextSnapshot, {
        optionsRepository: resolvedOptionsRepository
      });
      controller.scheduleAutoSave(() => mounted.collectDraft());
    } catch (error) {
      void error;
      state.privacyStatus = getMessage('clearDataError', '清除数据失败，请稍后重试。');
    }
  }

  async function resetUsageData(): Promise<void> {
    const zeroStats = { ...DEFAULT_USAGE_STATS, history: [...DEFAULT_USAGE_STATS.history] };
    (draft as Record<string, unknown>).usageStats = zeroStats;
    appData = {
      ...appData,
      overview: {
        ...appData.overview,
        stats: appData.overview.stats.map((item) => ({ ...item, value: 0 })),
        history: appData.overview.history.map((item) => ({ ...item, value: 0 }))
      }
    };
    if (storage) {
      await resetUsageStatsAction(zeroStats, {
        optionsRepository: resolvedOptionsRepository,
        storage,
        messagingRepository: resolvedMessagingRepository,
        storageKeys: ['usageStats', 'usage_stats'],
        ...(now ? { now } : {})
      });
    } else {
      await resolvedOptionsRepository.set({ usageStats: zeroStats } as Partial<CompleteOptions>);
    }
    controller.scheduleAutoSave(() => mounted.collectDraft());
  }

  async function loadUsageStatsFromStorage(): Promise<void> {
    if (!storage) {
      return;
    }
    try {
      const stored =
        (await storage.local.get<UsageStats>(USAGE_STATS_STORAGE_KEY)) ??
        (await storage.local.get<UsageStats>(LEGACY_USAGE_STATS_STORAGE_KEY));
      if (!stored) {
        return;
      }
      (draft as CompleteOptions & { usageStats?: UsageStats }).usageStats =
        normalizeUsageStats(stored);
      refreshAppData();
      render();
    } catch (error) {
      console.debug('[Options] Failed to read usage stats for Stitch dashboard:', error);
    }
  }

  function applyConnectionNotice(result: ConnectionTestResult): void {
    connectionNotice = {
      title: '连接测试结果',
      body:
        result.message || result.error || (result.success ? '连接测试成功。' : '连接测试失败。'),
      variant: result.success ? 'success' : 'danger'
    };
    refreshAppData();
  }

  async function importConfigurationFromClipboard(): Promise<void> {
    const parsed = parseConfigInput(await readConfigTextFromClipboard());
    await applyAnalyticsTransferPayload(parsed.analytics);
    const imported = mergeOptions(parsed.options) as CompleteOptions;
    await controller.applyImportedConfig(imported);
    draft = imported;
    maintenanceLog = JSON.stringify({ imported: true, version: parsed.version }, null, 2);
    refreshAppData();
    state = applyOptionsToState(state, draft, appData);
    render();
  }

  async function copyConfigurationToClipboard(button: HTMLButtonElement | null): Promise<void> {
    setButtonBusy(button, true);
    try {
      await writeToClipboard(
        JSON.stringify(normalizeOptionsForTransfer(collectDraftWithWidgets()), null, 2)
      );
      maintenanceLog = getMessage('copyConfigSuccess', '配置已复制到剪贴板！');
    } catch (error) {
      maintenanceLog = `Copy failed: ${String(error)}`;
    } finally {
      setButtonBusy(button, false);
      refreshAppData();
      render();
    }
  }

  async function importConfigurationWithStatus(button: HTMLButtonElement | null): Promise<void> {
    setButtonBusy(button, true);
    try {
      await importConfigurationFromClipboard();
      maintenanceLog = getMessage('importSuccess', '配置已成功导入！');
    } catch (error) {
      maintenanceLog = `Import failed: ${String(error)}`;
    } finally {
      setButtonBusy(button, false);
      refreshAppData();
      render();
    }
  }

  async function repairConfiguration(): Promise<void> {
    const restDefaults = configProvider.getRestDefaults();
    const templateDefaults = configProvider.getTemplates();
    let baseUrl = draft.rest.baseUrl || draft.rest.httpsUrl || restDefaults.baseUrl;
    const log: string[] = ['修复配置'];

    if (baseUrl.startsWith('http://') && baseUrl.includes(`:${restDefaults.httpsPort}`)) {
      baseUrl = baseUrl.replace('http://', 'https://');
      log.push(`REST URL: ${baseUrl}`);
    } else if (baseUrl.startsWith('https://') && baseUrl.includes(`:${restDefaults.httpPort}`)) {
      baseUrl = baseUrl.replace('https://', 'http://');
      log.push(`REST URL: ${baseUrl}`);
    }

    draft.rest = {
      ...draft.rest,
      httpsUrl: draft.rest.httpsUrl || restDefaults.httpsUrl,
      httpUrl: draft.rest.httpUrl || restDefaults.httpUrl,
      baseUrl
    };
    draft.templates = {
      ...draft.templates,
      article: (draft.templates.article || templateDefaults.article).replace(
        'Clippings/',
        'Articles/'
      ),
      fragment: draft.templates.fragment || templateDefaults.fragment,
      reading: draft.templates.reading || templateDefaults.reading,
      ai: draft.templates.ai || templateDefaults.ai
    };
    syncDefaultVaultFromRest();
    maintenanceLog = log.join('\n');
    refreshAppData();
    await controller.saveSnapshot({ reason: 'manual', draft: collectDraftWithWidgets() });
    render();
  }

  function updateClassifierField(field: string, value: unknown): void {
    switch (field) {
      case 'enabled':
        draft.classifier.enabled = Boolean(value);
        state.classifierEnabled = draft.classifier.enabled;
        break;
      case 'provider':
        draft.classifier.provider = String(
          value ?? 'ollama'
        ) as CompleteOptions['classifier']['provider'];
        state.classifierProvider = draft.classifier.provider;
        break;
      case 'endpoint':
        draft.classifier.endpoint = String(value ?? '');
        state.classifierEndpoint = draft.classifier.endpoint;
        break;
      case 'model':
        draft.classifier.model = String(value ?? '');
        state.classifierModel = draft.classifier.model;
        break;
      case 'apiKey':
        draft.classifier.apiKey = String(value ?? '');
        state.classifierApiKey = draft.classifier.apiKey;
        break;
      case 'taxonomy':
        state.classifierTaxonomyText = String(value ?? '');
        try {
          draft.classifier.taxonomy = resolveTaxonomy(
            parseClassifierTaxonomy(state.classifierTaxonomyText)
          );
        } catch {
          // Keep the previous taxonomy until the JSON is valid and matches the classifier schema.
        }
        break;
      default:
        return;
    }
    scheduleDraftSave();
  }

  function updateVaultField(index: number, field: string, value: unknown): void {
    const router = ensureVaultRouter();
    const vault = router.vaults[index];
    if (!vault) {
      return;
    }
    switch (field) {
      case 'enabled':
        vault.enabled = Boolean(value);
        break;
      case 'name':
        vault.name = String(value ?? '');
        vault.vault = vault.name;
        break;
      case 'https':
        vault.httpsUrl = String(value ?? '');
        break;
      case 'http':
        vault.httpUrl = String(value ?? '');
        break;
      case 'key':
        vault.apiKey = String(value ?? '');
        break;
      default:
        return;
    }
    if (vault.isDefault || vault.id === router.defaultVaultId || index === 0) {
      syncDefaultRestFromVault(vault);
    }
    draft.vaultRouter = router;
    scheduleDraftSave();
  }

  function mergePartialIntoDraft(partial: Partial<CompleteOptions>): void {
    if (partial.rest) {
      draft.rest = { ...draft.rest, ...partial.rest };
    }
    if (partial.templates) {
      draft.templates = { ...draft.templates, ...partial.templates };
    }
    if (partial.domainMappings) {
      draft.domainMappings = { ...partial.domainMappings };
    }
    if (partial.vaultRouter) {
      draft.vaultRouter = partial.vaultRouter;
    }
    if (partial.yamlConfig !== undefined) {
      draft.yamlConfig = partial.yamlConfig;
    }
    Object.entries(partial).forEach(([key, value]) => {
      if (['rest', 'templates', 'domainMappings', 'vaultRouter', 'yamlConfig'].includes(key)) {
        return;
      }
      (draft as Record<string, unknown>)[key] = value;
    });
  }

  function collectDraftWithWidgets(): CompleteOptions {
    if (!draft.vaultRouter?.vaults?.length) {
      ensureVaultRouter();
    }
    const collected = {
      ...mergeOptions(draft),
      ...draft
    } as CompleteOptions;
    collected.pageSummary.enabled = false;
    collected.readingOverlaySummary.enabled = false;
    collected.subtitleTranslation.enabled = false;
    collected.interfaceTheme = state.interfaceThemePreference ?? state.previewTheme;
    if (!dirtyWidgetKeys.size) {
      return collected;
    }
    widgetInstances.forEach((widget) => {
      const partial = widget.collect?.();
      if (partial) {
        mergePartialIntoDraft(partial);
      }
    });
    syncDefaultVaultFromRest();
    dirtyWidgetKeys.clear();
    refreshAppData();
    const merged = {
      ...mergeOptions(draft),
      ...draft
    } as CompleteOptions;
    merged.pageSummary.enabled = false;
    merged.readingOverlaySummary.enabled = false;
    merged.subtitleTranslation.enabled = false;
    merged.interfaceTheme = state.interfaceThemePreference ?? state.previewTheme;
    return merged;
  }

  function flushDirtyWidgets(): void {
    if (dirtyWidgetKeys.size) {
      collectDraftWithWidgets();
    }
  }

  function destroyWidgets(): void {
    widgetInstances.forEach((widget) => {
      widget.destroy();
    });
    widgetInstances.clear();
  }

  function mountWidget(widgetType: string, host: HTMLElement): void {
    const widget = widgetType === 'yaml-config' ? new YamlConfigWidget() : null;
    if (!widget) {
      host.textContent = `[Missing widget] ${widgetType}`;
      return;
    }
    widgetInstances.add(
      widget as OptionsWidgetMountContract<Record<string, unknown>, Partial<CompleteOptions>>
    );
    widget.mount(
      host,
      { options: draft, messages: currentMessages },
      {
        notifyDirty: (keys = [], meta) => {
          keys.forEach((key) => dirtyWidgetKeys.add(key));
          if (meta?.invalid) {
            refreshAppData();
            return;
          }
          scheduleDraftSave();
        },
        reportError: (scope, error) => {
          console.error(`[ProductionStitchShell:${scope}]`, error);
        }
      }
    );
  }

  const actionRuntime = createActionRuntime<PreviewStoreState, PreviewContent>({
    getContext: createSchemaContext,
    mutate,
    handlers: {
      'preview:setTheme': ({ value, mutate: update }) => {
        const theme: InterfaceTheme = value === 'light' || value === 'system' ? value : 'dark';
        update(
          (next) => {
            next.interfaceThemePreference = theme;
            next.previewTheme = persistTheme(theme);
          },
          { silent: true }
        );
        void resolvedOptionsRepository.set({ interfaceTheme: theme } as Partial<CompleteOptions>);
        syncPreviewThemeControls();
      },
      'preview:setLanguage': ({ value, mutate: update }) => {
        const nextLanguage = String(value || currentLanguage) as Language;
        update(
          (next) => {
            next.previewLanguage = nextLanguage;
          },
          { silent: true }
        );
        void (async () => {
          if (changeLanguage) {
            const nextResource = await changeLanguage(nextLanguage);
            currentMessages = nextResource.messages;
            currentLanguage = nextResource.language;
            state.previewLanguage = nextResource.language;
          } else {
            currentLanguage = nextLanguage;
          }
          render();
        })();
      },
      'resource:close': () => {
        mutate(
          (next) => {
            next.activeResource = null;
          },
          { silent: true }
        );
        renderActiveResourceModal();
      },
      'resource:open': ({ args }) => {
        openResource(String(args[0] ?? ''));
      },
      'navigation:scrollToPanel': ({ args }) => {
        scrollToPanel(String(args[0] ?? 'overview'));
      },
      'navigation:openMainAtPanel': ({ args }) => {
        state = {
          ...state,
          activeResource: null
        };
        renderActiveResourceModal();
        scrollToPanel(String(args[0] ?? 'overview'));
      },
      'navigation:closeResourceAndScrollToPanel': ({ args }) => {
        state = {
          ...state,
          activeResource: null
        };
        renderActiveResourceModal();
        scrollToPanel(String(args[0] ?? 'overview'));
      },
      'routing:add': () => {
        state.routingRules = [
          ...state.routingRules,
          {
            type: 'Domain',
            pattern: '',
            target: appData.storage.vaults[0]?.name ?? draft.rest.vault,
            priority: 50,
            enabled: true
          }
        ];
        syncRoutingRulesToDraft();
        scheduleDraftSave();
        render();
      },
      'routing:remove': ({ args }) => {
        const index = Number(args[0] ?? -1);
        state.routingRules = state.routingRules.filter((_, ruleIndex) => ruleIndex !== index);
        syncRoutingRulesToDraft();
        scheduleDraftSave();
        render();
      },
      'routing:updateField': ({ args, value }) => {
        const index = Number(args[0] ?? -1);
        const field = String(args[1] ?? '');
        const rule = state.routingRules[index];
        if (rule && field) {
          (rule as unknown as Record<string, unknown>)[field] = value;
          syncRoutingRulesToDraft();
          scheduleDraftSave();
        }
      },
      'routing:updatePriority': ({ args, value }) => {
        const index = Number(args[0] ?? -1);
        const rule = state.routingRules[index];
        if (rule) {
          rule.priority = typeof value === 'number' || value === '' ? value : Number(value);
          syncRoutingRulesToDraft();
          scheduleDraftSave();
        }
      },
      'storage:addVault': () => {
        const router = ensureVaultRouter();
        const nextIndex = router.vaults.length + 1;
        router.vaults.push({
          id: `vault-${nextIndex}`,
          name: `Vault ${nextIndex}`,
          vault: `Vault ${nextIndex}`,
          httpsUrl: draft.rest.httpsUrl ?? draft.rest.baseUrl,
          httpUrl: draft.rest.httpUrl ?? draft.rest.baseUrl,
          apiKey: '',
          enabled: true
        });
        draft.vaultRouter = router;
        scheduleDraftSave();
        render();
      },
      'storage:removeVault': ({ args }) => {
        const index = Number(args[0] ?? -1);
        const router = ensureVaultRouter();
        const vault = router.vaults[index];
        if (!vault || vault.isDefault || vault.id === router.defaultVaultId || index === 0) {
          return;
        }
        router.vaults.splice(index, 1);
        router.rules = (router.rules ?? []).filter((rule) => rule.vaultId !== vault.id);
        draft.vaultRouter = router;
        state.routingRules = toRoutingRules(draft);
        scheduleDraftSave();
        render();
      },
      'storage:updateVaultField': ({ args, value }) => {
        updateVaultField(Number(args[0] ?? -1), String(args[1] ?? ''), value);
      },
      'storage:updateRootDir': ({ value }) => {
        draft.rest.rootDir = String(value ?? '');
        scheduleDraftSave();
      },
      'storage:testConnection': () => {
        void (async () => {
          try {
            applyConnectionNotice(
              await requestConnectionTest(draft.rest, resolvedMessagingRepository)
            );
          } catch (error) {
            connectionNotice = {
              title: '连接测试结果',
              body: error instanceof Error ? error.message : String(error),
              variant: 'danger'
            };
            refreshAppData();
          }
          render();
        })();
      },
      'domain:add': () => {
        const entries = currentDomainEntries();
        entries.push([`example-${entries.length + 1}.com`, 'folder']);
        syncDomainEntries(entries);
        scheduleDraftSave();
        render();
      },
      'domain:update': ({ args, value }) => {
        const index = Number(args[0] ?? -1);
        const field = String(args[1] ?? '');
        const entries = currentDomainEntries();
        const entry = entries[index];
        if (!entry) {
          return;
        }
        if (field === 'domain') {
          entry[0] = String(value ?? '');
        } else if (field === 'alias') {
          entry[1] = String(value ?? '');
        }
        syncDomainEntries(entries);
        scheduleDraftSave();
      },
      'domain:remove': ({ args }) => {
        const index = Number(args[0] ?? -1);
        const entries = currentDomainEntries().filter((_, entryIndex) => entryIndex !== index);
        syncDomainEntries(entries);
        scheduleDraftSave();
        render();
      },
      'yaml:setFilter': ({ args }) => {
        state.yamlFilter = String(args[0] ?? 'all');
        render();
      },
      'yaml:toggleFieldState': ({ args }) => {
        const field = String(args[0] ?? '');
        const mode = String(args[1] ?? '');
        const key = `${field}:${mode}`;
        state.yamlFieldStates[key] = state.yamlFieldStates[key] === 'On' ? 'Off' : 'On';
        dirtyWidgetKeys.add('yamlConfig');
        scheduleDraftSave();
        render();
      },
      'template:setActiveField': ({ args }) => {
        state.activeTemplateField = String(args[0] ?? 'articleVideo');
      },
      'template:updateValue': ({ args, value }) => {
        const field = String(args[0] ?? '');
        if (field) {
          state.templateValues[field] = String(value ?? '');
          applyTemplateStateToDraft();
          scheduleDraftSave();
        }
      },
      'template:insertToken': ({ value }) => {
        const field = state.activeTemplateField;
        if (field) {
          state.templateValues[field] =
            `${state.templateValues[field] ?? ''}${String(value ?? '')}`;
          applyTemplateStateToDraft();
          scheduleDraftSave();
          render();
        }
      },
      'output:setReadingPathMode': ({ value }) => {
        state.readingPathMode = String(value ?? 'custom');
        applyTemplateStateToDraft();
        scheduleDraftSave();
        render();
      },
      'output:applyPreset': ({ args }) => {
        applyOutputPreset(String(args[0] ?? ''));
      },
      'highlight:setTheme': ({ value }) => {
        draft.readingSession.highlightTheme = String(
          value ?? 'gradient'
        ) as CompleteOptions['readingSession']['highlightTheme'];
        state.highlightTheme = draft.readingSession.highlightTheme;
        scheduleDraftSave();
        syncHighlightThemeControls();
      },
      'modifier:setEnabled': ({ value }) => {
        const enabled = Boolean(value);
        draft.fragmentClipper.selectionModifierEnabled = enabled;
        state.fragmentModifierEnabled = enabled;
        if (!enabled) {
          draft.fragmentClipper.selectionModifierKeys = [];
          state.modifierKeys = [];
        } else if (!state.modifierKeys.length) {
          state.modifierKeys = ['Alt'];
          draft.fragmentClipper.selectionModifierKeys = ['alt'];
        }
        scheduleDraftSave();
        render();
      },
      'modifier:toggleKey': ({ value }) => {
        const key = String(value ?? '');
        state.modifierKeys = state.modifierKeys.includes(key)
          ? state.modifierKeys.filter((item) => item !== key)
          : [...state.modifierKeys, key];
        state.fragmentModifierEnabled = state.modifierKeys.length > 0;
        draft.fragmentClipper.selectionModifierEnabled = state.fragmentModifierEnabled;
        draft.fragmentClipper.selectionModifierKeys = optionsFromModifierLabels(state.modifierKeys);
        scheduleDraftSave();
        render();
      },
      'options:updateField': ({ args, value }) => {
        const path = String(args[0] ?? '');
        updateDraftPath(path, value);
        scheduleDraftSave();
      },
      'experimental:updateAiConfigField': ({ args, value }) => {
        const field = String(args[0] ?? '') as keyof CompleteOptions['experimentalAi'];
        if (field) {
          draft.experimentalAi[field] = String(value ?? '');
          state.experimentalAiConfig[field] = String(value ?? '');
          scheduleDraftSave();
        }
      },
      'experimental:setPageSummaryEnabled': () => {
        draft.pageSummary.enabled = false;
        state.pageSummaryEnabled = false;
      },
      'experimental:setReadingOverlaySummaryEnabled': () => {
        draft.readingOverlaySummary.enabled = false;
        state.readingOverlaySummaryEnabled = false;
      },
      'experimental:setSubtitleTranslationEnabled': () => {
        draft.subtitleTranslation.enabled = false;
        state.subtitleTranslationEnabled = false;
      },
      'experimental:setSubtitleTargetLanguage': () => {
        state.subtitleTargetLanguage =
          draft.subtitleTranslation.targetLanguage || state.subtitleTargetLanguage;
      },
      'overview:clearUsageData': () => {
        void resetUsageData().finally(() => {
          refreshAppData();
          render();
        });
      },
      'overview:clearAnalyticsData': () => {
        void clearAnalyticsPrivacyData().finally(() => {
          refreshAppData();
          render();
        });
      },
      'overview:updatePrivacyConsent': ({ args, value }) => {
        const field = String(args[0] ?? '') as 'analytics' | 'errorReporting' | 'debugMode';
        if (!['analytics', 'errorReporting', 'debugMode'].includes(field)) {
          return;
        }
        void persistPrivacyPreference(field, Boolean(value)).finally(() => render());
      },
      'maintenance:copyConfig': ({ value }) => {
        void copyConfigurationToClipboard(eventButton(value));
      },
      'maintenance:diagnose': () => {
        maintenanceLog = buildDiagnosticsReport(collectDraftWithWidgets());
        refreshAppData();
        render();
      },
      'maintenance:importConfig': ({ value }) => {
        void importConfigurationWithStatus(eventButton(value));
      },
      'maintenance:repair': () => {
        void repairConfiguration();
      },
      'maintenance:reload': () => {
        void (async () => {
          const loaded = await controller.loadRaw();
          mounted.refreshOptions(loaded);
        })();
      },
      'classifier:updateField': ({ args, value }) => {
        updateClassifierField(String(args[0] ?? ''), value);
      }
    },
    onUnhandledAction: () => {
      controller.scheduleAutoSave(() => draft);
    }
  });

  function dispatch(actionId: string, args: unknown[] = [], value?: unknown, event?: Event): void {
    flushDirtyWidgets();
    actionRuntime.dispatch({ id: actionId, args }, value === undefined ? event : value);
  }

  function createRenderContext() {
    return {
      ...createSchemaContext(),
      el,
      ui: previewUi,
      dispatch,
      mountWidget
    };
  }

  const schemaRenderer = createSchemaRenderer<PreviewStoreState, PreviewContent>(
    {
      getContext: createSchemaContext,
      dispatch: (action, payload) => {
        if (typeof action === 'string') {
          dispatch(action, [], payload);
          return;
        }
        dispatch(action.id, action.args ?? [], payload);
      },
      mutate,
      requestRerender: render,
      getWidgetFactory: (widgetType) => {
        if (widgetType === 'yaml-config') {
          return () => new YamlConfigWidget() as never;
        }
        return null;
      }
    },
    {
      renderView: (view) => renderPreviewView(view as ViewSchema, createRenderContext())
    }
  );

  function syncHighlightThemeControls(): void {
    const theme = isHighlightTheme(state.highlightTheme) ? state.highlightTheme : 'gradient';
    const themeValues = new Set(Object.keys(HIGHLIGHT_THEME_CLASSES));
    mountRoot.querySelectorAll<HTMLButtonElement>('.chips button[data-value]').forEach((button) => {
      if (!themeValues.has(button.dataset.value ?? '')) {
        return;
      }
      const isActive = button.dataset.value === theme;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.classList.toggle('is-active', isActive);
      const chipGroup = button.closest<HTMLElement>('.chips');
      if (chipGroup) {
        chipGroup.dataset.activeValue = theme;
      }
    });

    const highlight = mountRoot.querySelector<HTMLElement>(
      '.highlight-inline-example .inline-highlight'
    );
    if (highlight) {
      highlight.classList.remove(...Object.values(HIGHLIGHT_THEME_CLASSES));
      highlight.classList.add(HIGHLIGHT_THEME_CLASSES[theme]);
    }
  }

  function syncPreviewThemeControls(): void {
    const preference =
      state.interfaceThemePreference === 'light' || state.interfaceThemePreference === 'system'
        ? state.interfaceThemePreference
        : 'dark';
    mountRoot.querySelectorAll<HTMLButtonElement>('.chips button[data-value]').forEach((button) => {
      if (
        button.dataset.value !== 'light' &&
        button.dataset.value !== 'dark' &&
        button.dataset.value !== 'system'
      ) {
        return;
      }
      const isActive = button.dataset.value === preference;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.classList.toggle('is-active', isActive);
      const chipGroup = button.closest<HTMLElement>('.chips');
      if (chipGroup) {
        chipGroup.dataset.activeValue = preference;
      }
    });
  }

  function applySystemThemePreferenceChange(): void {
    if (state.interfaceThemePreference !== 'system') {
      return;
    }
    state.previewTheme = persistTheme('system');
    syncPreviewThemeControls();
  }

  function render(): void {
    const previousMain = mountRoot.querySelector('.main');
    const previousScrollTop = previousMain instanceof HTMLElement ? previousMain.scrollTop : 0;
    flushDirtyWidgets();
    destroyWidgets();
    clear(mountRoot).append(
      buildAppShell({
        el,
        sidebar: renderSidebar(),
        panelStack: renderSectionStack()
      })
    );
    const nextMain = mountRoot.querySelector('.main');
    if (nextMain instanceof HTMLElement) {
      nextMain.scrollTop = previousScrollTop;
      bindScrollSync(nextMain);
    }
    const chartHost = mountRoot.querySelector<HTMLElement>('[data-role="usage-chart-shell"]');
    if (chartHost) {
      previewUi.renderUsageChart(chartHost, appData.overview.history);
    }
    syncPreviewThemeControls();
    syncHighlightThemeControls();
    renderActiveResourceModal();
  }

  function renderSidebar(): HTMLElement {
    const appData = createSchemaContext().appData;
    return buildSidebar({
      el,
      brand: appData.brand,
      settingsTitle: '',
      resourcesTitle: '',
      runtimeTitle: currentLanguage === 'en' ? 'Runtime UI' : '运行时界面',
      navItems: appData.nav,
      sidebarLinks: appData.sidebarLinks,
      surfaceLinks: appData.surfaceLinks,
      activePanel: state.activePanel,
      activeResource: state.activeResource,
      onPanelClick: scrollToPanel,
      onFooterClick: openResource
    });
  }

  function renderSectionStack(): HTMLElement {
    return buildPanelStack({
      el,
      items: appData.nav,
      renderSection: (panelId) => {
        const view = getSettingsView(panelId, createSchemaContext());
        const content = view ? schemaRenderer.renderView(view as never) : el('div');
        return buildScrollSection({ el, panelId, content });
      }
    });
  }

  function openResource(resourceId: string): void {
    if (RUNTIME_SURFACE_RESOURCE_IDS.has(resourceId)) {
      return;
    }
    const meta = getFooterMeta(resourceId);
    if (!meta) {
      return;
    }
    if (meta.openMode === 'page') {
      window.open(meta.href ?? `./${resourceId}.html`, '_blank', 'noopener,noreferrer');
      return;
    }
    state = {
      ...state,
      activeResource: resourceId
    };
    renderActiveResourceModal();
  }

  function renderActiveResourceModal(): void {
    mountRoot.querySelectorAll('.resource-modal-overlay').forEach((modal) => modal.remove());
    if (!state.activeResource) {
      return;
    }
    const view = getFooterView(state.activeResource, createSchemaContext());
    const modal = view ? schemaRenderer.renderView(view as never) : null;
    if (modal) {
      mountRoot.querySelector<HTMLElement>('[data-modal-host="true"]')?.append(modal);
    }
  }

  function scrollToPanel(panelId: string): void {
    state = {
      ...state,
      activePanel: panelId
    };
    const main = mountRoot.querySelector<HTMLElement>('.main');
    const section = mountRoot.querySelector<HTMLElement>(`[data-panel-id="${panelId}"]`);
    if (main && section) {
      const top = Math.max(section.offsetTop - 12, 0);
      if (typeof main.scrollTo === 'function') {
        main.scrollTo({ top, behavior: 'smooth' });
      } else {
        main.scrollTop = top;
      }
    }
    syncActiveLinks();
  }

  function bindScrollSync(main: HTMLElement): void {
    main.addEventListener(
      'scroll',
      () => {
        const sections = Array.from(
          mountRoot.querySelectorAll<HTMLElement>('[data-scroll-section="true"]')
        );
        const threshold = main.scrollTop + 120;
        let nextActive = sections[0]?.dataset.panelId ?? state.activePanel;
        sections.forEach((section) => {
          if (section.offsetTop <= threshold) {
            nextActive = section.dataset.panelId ?? nextActive;
          }
        });
        if (nextActive !== state.activePanel) {
          state = {
            ...state,
            activePanel: nextActive
          };
          syncActiveLinks();
        }
      },
      { passive: true }
    );
  }

  function syncActiveLinks(): void {
    mountRoot.querySelectorAll<HTMLElement>('[data-nav-panel]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.navPanel === state.activePanel);
    });
    mountRoot.querySelectorAll<HTMLElement>('[data-footer-panel]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.footerPanel === state.activeResource);
    });
  }

  function applyTemplateStateToDraft(): void {
    draft.templates.article = state.templateValues.articleVideo ?? draft.templates.article;
    draft.templates.fragment = state.templateValues.fragment ?? draft.templates.fragment;
    draft.templates.ai = state.templateValues.aiChat ?? draft.templates.ai;
    if (state.readingPathMode === 'article') {
      draft.templates.reading = draft.templates.article;
    } else if (state.readingPathMode === 'fragment') {
      draft.templates.reading = draft.templates.fragment;
    } else {
      draft.templates.reading = state.templateValues.readingCustom ?? draft.templates.reading;
    }
  }

  function applyOutputPreset(name: string): void {
    switch (name) {
      case 'Minimal':
        draft.templates = {
          ...draft.templates,
          article: 'Articles/{domain}/{yyyy}/{slug}.md',
          fragment: 'Clips/{domain}/{yyyy}/{slug}.md',
          reading: 'Reading/{domain}/{yyyy}/{slug}.md',
          ai: 'AI/{platform}/{yyyy}/{title}.md'
        };
        draft.domainMappings = {};
        draft.yamlConfig = createPresetYamlConfig('Minimal');
        break;
      case 'Research':
        draft.templates = {
          ...draft.templates,
          article: 'Research/{domain}/{yyyy}/{slug}.md',
          fragment: 'Research/Fragments/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
          reading: 'Research/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
          ai: 'Research/AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md'
        };
        draft.domainMappings = {
          'arxiv.org': 'Arxiv',
          'mp.weixin.qq.com': '公众号',
          'scholar.google.com': 'Scholar'
        };
        draft.yamlConfig = createPresetYamlConfig('Research');
        break;
      case 'Conversation':
        draft.templates = {
          ...draft.templates,
          article: 'Articles/{domain}/{yyyy}/{slug}.md',
          fragment: 'Clips/{domain}/{yyyy}/{slug}.md',
          reading: 'Reading/{domain}/{yyyy}/{slug}.md',
          ai: 'AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md'
        };
        draft.domainMappings = {
          'chatgpt.com': 'ChatGPT',
          'claude.ai': 'Claude',
          'gemini.google.com': 'Gemini'
        };
        draft.yamlConfig = createPresetYamlConfig('Conversation');
        break;
      default:
        return;
    }
    state.templateValues = toTemplateValues(draft);
    state.readingPathMode = resolveReadingPathMode(draft);
    refreshAppData();
    scheduleDraftSave();
    render();
  }

  function updateDraftPath(path: string, value: unknown): void {
    switch (path) {
      case 'aiChat.userName':
        draft.aiChat.userName = String(value ?? '');
        state.aiUserName = draft.aiChat.userName;
        break;
      case 'aiChat.includeTimestamps':
        draft.aiChat.includeTimestamps = Boolean(value);
        state.aiIncludeTimestamps = draft.aiChat.includeTimestamps;
        break;
      case 'deepResearch.pureMode':
        draft.deepResearch.pureMode = Boolean(value);
        state.deepResearchPureMode = draft.deepResearch.pureMode;
        break;
      case 'video.floatingPromptEnabled':
        draft.video.floatingPromptEnabled = Boolean(value);
        state.videoFloatingPromptEnabled = draft.video.floatingPromptEnabled;
        break;
      case 'video.promptButtonLabel':
        draft.video.promptButtonLabel = String(value ?? '');
        state.videoPromptButtonLabel = draft.video.promptButtonLabel;
        break;
      case 'video.promptShortcut':
        draft.video.promptShortcut = String(value ?? '');
        state.videoPromptShortcut = draft.video.promptShortcut;
        break;
      case 'video.promptPosition.x':
        draft.video.promptPosition = {
          ...(draft.video.promptPosition ?? { x: 24, y: 24 }),
          x: Number(value) || 0
        };
        state.videoPromptPositionX = draft.video.promptPosition.x;
        break;
      case 'video.promptPosition.y':
        draft.video.promptPosition = {
          ...(draft.video.promptPosition ?? { x: 24, y: 24 }),
          y: Number(value) || 0
        };
        state.videoPromptPositionY = draft.video.promptPosition.y;
        break;
      case 'readingSession.exportMode':
        draft.readingSession.exportMode = String(
          value ?? 'highlights'
        ) as CompleteOptions['readingSession']['exportMode'];
        state.readingExportMode = draft.readingSession.exportMode;
        break;
      case 'fragmentClipper.useFootnoteFormat':
        draft.fragmentClipper.useFootnoteFormat = Boolean(value);
        state.fragmentUseFootnoteFormat = draft.fragmentClipper.useFootnoteFormat;
        break;
      case 'fragmentClipper.captureContext':
        draft.fragmentClipper.captureContext = Boolean(value);
        state.fragmentCaptureContext = draft.fragmentClipper.captureContext;
        break;
      case 'fragmentClipper.contextLength':
        draft.fragmentClipper.contextLength = Number(value) || draft.fragmentClipper.contextLength;
        state.fragmentContextLength = draft.fragmentClipper.contextLength;
        break;
      case 'fragmentClipper.contextMode':
        draft.fragmentClipper.contextMode = String(
          value ?? 'chars'
        ) as CompleteOptions['fragmentClipper']['contextMode'];
        state.fragmentContextMode = draft.fragmentClipper.contextMode;
        break;
      case 'fragmentClipper.keyboardShortcutsEnabled':
        draft.fragmentClipper.keyboardShortcutsEnabled = Boolean(value);
        state.fragmentKeyboardShortcutsEnabled = draft.fragmentClipper.keyboardShortcutsEnabled;
        break;
      default:
        break;
    }
  }

  function scheduleDraftSave(): void {
    refreshAppData();
    controller.scheduleAutoSave(() => mounted.collectDraft());
  }

  const mounted: MountedProductionStitchShell = {
    cleanup() {
      themeMediaQuery.removeEventListener?.('change', applySystemThemePreferenceChange);
      schemaRenderer.dispose();
      destroyWidgets();
      clear(mountRoot);
    },
    collectDraft() {
      return collectDraftWithWidgets();
    },
    refreshOptions(options = null) {
      draft = mergeOptions(options) as CompleteOptions;
      dirtyWidgetKeys.clear();
      refreshAppData();
      state = applyOptionsToState(state, draft, appData);
      state.interfaceThemePreference = resolveThemePreference(draft);
      state.previewTheme = resolveStoredTheme(draft);
      state.previewTheme = persistTheme(state.interfaceThemePreference);
      render();
    },
    setMessages(nextMessages, nextLanguage) {
      currentMessages = nextMessages;
      currentLanguage = nextLanguage;
      state = {
        ...state,
        previewLanguage: nextLanguage
      };
      render();
    }
  };

  themeMediaQuery.addEventListener?.('change', applySystemThemePreferenceChange);

  render();
  void loadUsageStatsFromStorage();
  return mounted;
}
