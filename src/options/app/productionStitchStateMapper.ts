import { normalizeUsageStats } from '@shared/constants';
import { prepareUsageHistory } from '@options/stitch/usageHistory';
import { resolveExtensionVersionLabel } from './productionStitchVersion';
import type { CompleteOptions, InterfaceTheme, StoredOptions } from '@shared/types/options';
import type { UsageStats } from '@shared/types/usage';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';
import type {
  PreviewContent,
  PreviewStoreState,
  RoutingRule,
  VaultRecord
} from '@options/stitch/types';
import { normalizeFragmentModifierKeys } from './fragmentModifierOptions';

export { resolveExtensionVersionLabel } from './productionStitchVersion';

export const RUNTIME_SURFACE_RESOURCE_IDS = new Set(['clipper', 'reader', 'video', 'task-success']);
export const LEGACY_USAGE_STATS_STORAGE_KEY = 'usage_stats';
export const HIGHLIGHT_THEME_CLASSES: Record<
  CompleteOptions['readingSession']['highlightTheme'],
  string
> = {
  gradient: 'highlight-gradient',
  purple: 'highlight-purple',
  neonYellow: 'highlight-neon-yellow',
  neonGreen: 'highlight-neon-green',
  neonOrange: 'highlight-neon-orange'
};

export function isHighlightTheme(
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

export function createInitialStitchState(appData: PreviewContent): PreviewStoreState {
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
    privacyAnalytics: false,
    privacyErrorReporting: false,
    privacyDebugMode: false,
    privacyStatus: '',
    classifierEnabled: false,
    classifierProvider: 'ollama',
    classifierEndpoint: 'http://localhost:11434/api/chat',
    classifierModel: 'llama3.1',
    classifierApiKey: '',
    classifierTaxonomyText: '',
    videoFloatingPromptEnabled: true,
    videoCommentEditorAutoPause: false,
    videoScreenshotAttachmentLocationTemplate: './assets/${noteFileName}',
    videoScreenshotAttachmentFileNameTemplate:
      "file-${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}.jpg",
    videoScreenshotAttachmentMarkdownUrlFormat: '',
    fragmentUseFootnoteFormat: true,
    fragmentCaptureContext: true,
    fragmentContextLength: 200,
    fragmentContextMode: 'chars',
    fragmentKeyboardShortcutsEnabled: true,
    fragmentModifierEnabled: true,
    modifierKeys: ['shift'],
    activeLocalFolderVaultIndex: null,
    yamlFieldStates: createYamlFieldStates(appData),
    routingRules: appData.storage.routingRules.map((rule) => ({ ...rule })),
    templateValues: { ...appData.output.templateDefaults },
    activeTemplateField: 'articleVideo',
    pendingTemplateFocus: null,
    pendingTemplateSelection: null,
    maintenanceLog: appData.maintenanceLog
  };
}

export function resolveThemePreference(
  options?: StoredOptions | CompleteOptions | null
): InterfaceTheme {
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
  return 'system';
}

function resolveSystemPreviewTheme(): PreviewStoreState['previewTheme'] {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

export function resolveStoredTheme(
  options?: StoredOptions | CompleteOptions | null
): PreviewStoreState['previewTheme'] {
  const preference = resolveThemePreference(options);
  return preference === 'system' ? resolveSystemPreviewTheme() : preference;
}

export function persistTheme(preference: InterfaceTheme): PreviewStoreState['previewTheme'] {
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

export function createThemeMediaQuery(): Pick<
  MediaQueryList,
  'addEventListener' | 'removeEventListener'
> {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return {
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    };
  }
}

export function createPresetYamlConfig(
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

function toVaultRecord(options: CompleteOptions): VaultRecord[] {
  const routerVaults = options.vaultRouter?.vaults ?? [];
  if (routerVaults.length) {
    const defaultVaultId = options.vaultRouter?.defaultVaultId;
    return routerVaults.map((vault) => {
      const isDefault = Boolean(vault.isDefault || vault.id === defaultVaultId);
      return {
        id: vault.id,
        name: vault.name || vault.vault,
        ...(vault.localFolderId ? { localFolderId: vault.localFolderId } : {}),
        ...(vault.localFolderName ? { localFolderName: vault.localFolderName } : {}),
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
      ...(options.rest.localFolderId ? { localFolderId: options.rest.localFolderId } : {}),
      ...(options.rest.localFolderName ? { localFolderName: options.rest.localFolderName } : {}),
      https: options.rest.httpsUrl ?? options.rest.baseUrl,
      http: options.rest.httpUrl ?? options.rest.baseUrl,
      key: options.rest.apiKey,
      enabled: true,
      isDefault: true
    }
  ];
}

export function toRoutingRules(options: CompleteOptions): RoutingRule[] {
  const vaultById = new Map((options.vaultRouter?.vaults ?? []).map((vault) => [vault.id, vault]));
  const seenIds = new Set<string>();
  const seen = new Set<string>();
  const rules = [
    ...(options.vaultRouter?.rules ?? []),
    ...(options.vaultRouter?.vaults ?? []).flatMap((vault) => vault.rules ?? [])
  ].filter((rule) => {
    const canonicalKey = [
      rule.type,
      rule.pattern.trim().toLowerCase(),
      rule.vaultId,
      rule.priority,
      rule.enabled
    ].join('\u0000');
    const duplicate = seen.has(canonicalKey) || (rule.id ? seenIds.has(rule.id) : false);
    if (rule.id) {
      seenIds.add(rule.id);
    }
    seen.add(canonicalKey);
    return !duplicate;
  });

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

export function toTemplateValues(options: CompleteOptions): Record<string, string> {
  return {
    articleVideo: options.templates.article,
    fragment: options.templates.fragment,
    readingCustom: options.templates.reading,
    aiChat: options.templates.ai
  };
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

function usageStatsToOverview(
  overview: PreviewContent['overview'],
  usageStats: UsageStats
): PreviewContent['overview'] {
  const total = usageStats.aiChatSaves + usageStats.fragmentSaves + usageStats.articleSaves;
  return {
    ...overview,
    stats: [
      { label: 'Total saved', value: total },
      { label: 'AI conversations', value: usageStats.aiChatSaves },
      { label: 'Reading + Video + Fragment', value: usageStats.fragmentSaves },
      { label: 'Articles', value: usageStats.articleSaves }
    ],
    history: prepareUsageHistory(usageStats).map((entry) => ({
      label: usageHistoryLabel(entry.date),
      value: entry.aiChat + entry.fragment + entry.article
    }))
  };
}

export function resolveReadingPathMode(options: CompleteOptions): string {
  if (options.templates.reading === options.templates.article) {
    return 'article';
  }
  if (options.templates.reading === options.templates.fragment) {
    return 'fragment';
  }
  return 'custom';
}

function modifierKeysFromOptions(keys: readonly string[]): string[] {
  return normalizeFragmentModifierKeys(keys);
}

export function applyOptionsToState(
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
    classifierEnabled: options.classifier.enabled,
    classifierProvider: options.classifier.provider,
    classifierEndpoint: options.classifier.endpoint,
    classifierModel: options.classifier.model,
    classifierApiKey: options.classifier.apiKey,
    classifierTaxonomyText: JSON.stringify(options.classifier.taxonomy, null, 2),
    videoFloatingPromptEnabled: options.video.floatingPromptEnabled,
    videoCommentEditorAutoPause: options.video.commentEditorAutoPause,
    videoScreenshotAttachmentLocationTemplate: options.video.screenshotAttachment.locationTemplate,
    videoScreenshotAttachmentFileNameTemplate: options.video.screenshotAttachment.fileNameTemplate,
    videoScreenshotAttachmentMarkdownUrlFormat:
      options.video.screenshotAttachment.markdownUrlFormat,
    fragmentUseFootnoteFormat: options.fragmentClipper.useFootnoteFormat,
    fragmentCaptureContext: options.fragmentClipper.captureContext,
    fragmentContextLength: options.fragmentClipper.contextLength,
    fragmentContextMode: options.fragmentClipper.contextMode,
    fragmentKeyboardShortcutsEnabled: options.fragmentClipper.keyboardShortcutsEnabled,
    fragmentModifierEnabled: options.fragmentClipper.selectionModifierEnabled,
    modifierKeys: modifierKeysFromOptions(options.fragmentClipper.selectionModifierKeys),
    routingRules: toRoutingRules(options),
    templateValues: toTemplateValues(options),
    readingPathMode: resolveReadingPathMode(options),
    yamlFieldStates: createYamlFieldStates(appData),
    maintenanceLog: appData.maintenanceLog
  };
}

export function createProductionContent(
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
      title: 'Zendio',
      subtitle: resolveExtensionVersionLabel()
    },
    surfaceLinks: [],
    overview: usageStatsToOverview(base.overview, usageStats),
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
