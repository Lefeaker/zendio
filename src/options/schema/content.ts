import type { Messages } from '@i18n';
import { DEFAULT_RUNTIME_MESSAGES } from '@i18n/locales';
import type { SelectOption } from '@options/schema-runtime';
import type { OptionsSchemaPanelId, OptionsSchemaResourceId } from './model';

type SchemaMessageKey = keyof Messages;

interface SchemaNavCopyItem {
  label: SchemaMessageKey;
  hint: SchemaMessageKey;
}

interface SchemaResourceItemCopy {
  label: SchemaMessageKey;
  hint: SchemaMessageKey;
}

interface SchemaSelectOptionCopy {
  value: string;
  label: SchemaMessageKey;
}

export interface SchemaThemeOption {
  value: 'dark' | 'light';
  label: string;
}

export interface SchemaOverviewThemeCopy {
  title: string;
  options: SchemaThemeOption[];
}

export const SCHEMA_TEMPLATE_TOKENS = [
  '{platform}',
  '{domain}',
  '{yyyy}',
  '{mm}',
  '{dd}',
  '{HHmmss}',
  '{HHmm}',
  '{HH}',
  '{ss}',
  '{slug}',
  '{title}'
] as const;

export const SCHEMA_AI_PLATFORM_LINKS = [
  { label: 'schemaAiPlatformChatGptName', href: 'https://chatgpt.com/' },
  { label: 'schemaAiPlatformClaudeName', href: 'https://claude.ai/' },
  { label: 'schemaAiPlatformGeminiName', href: 'https://gemini.google.com/app' },
  { label: 'schemaAiPlatformKimiName', href: 'https://kimi.moonshot.cn/' },
  { label: 'schemaAiPlatformDeepSeekName', href: 'https://chat.deepseek.com/' },
  { label: 'schemaAiPlatformTongyiName', href: 'https://tongyi.aliyun.com/' },
  { label: 'schemaAiPlatformDoubaoName', href: 'https://www.doubao.com/chat/' },
  { label: 'schemaAiPlatformMonicaName', href: 'https://monica.im/' }
] as const;

export const SCHEMA_LANGUAGE_OPTIONS: ReadonlyArray<SelectOption> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es-ES', label: 'Español' }
];

export const SCHEMA_SUBTITLE_LANGUAGE_OPTIONS: ReadonlyArray<SelectOption> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es-ES', label: 'Español' }
];

export const SCHEMA_NAV_COPY: Record<OptionsSchemaPanelId, SchemaNavCopyItem> = {
  overview: {
    label: 'schemaOverviewTitle',
    hint: 'schemaNavOverviewHint'
  },
  storage: {
    label: 'schemaStorageTitle',
    hint: 'schemaNavStorageHint'
  },
  'capture-sources': {
    label: 'schemaCaptureSourcesTitle',
    hint: 'schemaNavCaptureSourcesHint'
  },
  'capture-behavior': {
    label: 'schemaCaptureBehaviorTitle',
    hint: 'schemaNavCaptureBehaviorHint'
  },
  output: {
    label: 'schemaOutputTitle',
    hint: 'schemaNavOutputHint'
  },
  experimental: {
    label: 'schemaExperimentalTitle',
    hint: 'schemaNavExperimentalHint'
  },
  maintenance: {
    label: 'schemaMaintenanceTitle',
    hint: 'schemaNavMaintenanceHint'
  }
};

export const SCHEMA_RESOURCE_GROUP_COPY = {
  settingsGroupTitle: 'schemaSidebarSettingsGroupTitle',
  resources: {
    id: 'resources',
    title: 'schemaResourcesGroupTitle',
    items: {
      onboarding: {
        label: 'schemaResourceOnboardingTitle',
        hint: 'schemaResourceOnboardingHint'
      },
      'plugin-setup': {
        label: 'schemaResourcePluginSetupTitle',
        hint: 'schemaResourcePluginSetupHint'
      },
      support: {
        label: 'schemaResourceSupportTitle',
        hint: 'schemaResourceSupportHint'
      },
      suggestions: {
        label: 'schemaResourceSuggestionsTitle',
        hint: 'schemaResourceSuggestionsHint'
      },
      contact: {
        label: 'schemaResourceContactTitle',
        hint: 'schemaResourceContactHint'
      },
      changelog: {
        label: 'schemaResourceChangelogTitle',
        hint: 'schemaResourceChangelogHint'
      }
    } satisfies Record<OptionsSchemaResourceId, SchemaResourceItemCopy>
  }
} as const;

export const SCHEMA_SELECT_OPTION_COPY = {
  yamlFilterOptions: [
    { value: 'all', label: 'schemaYamlFilterAllLabel' },
    { value: 'article', label: 'schemaYamlFilterArticleLabel' },
    { value: 'clipper', label: 'schemaYamlFilterClipperLabel' },
    { value: 'video', label: 'schemaYamlFilterVideoLabel' },
    { value: 'ai_chat', label: 'schemaYamlFilterAiChatLabel' }
  ] satisfies ReadonlyArray<SchemaSelectOptionCopy>,
  readingPathModes: [
    { value: 'article', label: 'schemaReadingPathModeArticleLabel' },
    { value: 'fragment', label: 'schemaReadingPathModeFragmentLabel' },
    { value: 'custom', label: 'schemaReadingPathModeCustomLabel' }
  ] satisfies ReadonlyArray<SchemaSelectOptionCopy>
} as const;

export const SCHEMA_PAGE_COPY = {
  overview: {
    heroDescription: 'schemaOverviewHeroDescription',
    groups: {
      usage: 'schemaOverviewUsageGroupTitle',
      interface: 'schemaOverviewInterfaceGroupTitle',
      privacy: 'schemaOverviewPrivacyGroupTitle'
    },
    language: {
      title: 'schemaOverviewLanguageRowTitle',
      description: 'schemaOverviewLanguageRowDescription'
    }
  },
  storage: {
    heroDescription: 'schemaStorageHeroDescription',
    groups: {
      vaults: 'schemaStorageVaultsGroupTitle',
      routing: 'schemaStorageRoutingGroupTitle'
    }
  },
  'capture-sources': {
    heroDescription: 'schemaCaptureSourcesHeroDescription',
    groups: {
      aiChat: 'schemaCaptureSourcesAiChatGroupTitle',
      deepResearch: 'schemaCaptureSourcesDeepResearchGroupTitle',
      video: 'schemaCaptureSourcesVideoGroupTitle'
    },
    aiChat: {
      platformsTitle: 'aiSupportedPlatformsToggle',
      userNameTitle: 'userNameLabel',
      userNameDescription: 'userNameHint',
      userNamePlaceholder: 'userNamePlaceholder',
      timestampsTitle: 'includeTimestampsLabel',
      timestampsDescription: 'includeTimestampsHint'
    },
    deepResearch: {
      pureModeTitle: 'pureModeLabel',
      pureModeDescription: 'pureModeHint',
      reportsNoticeTitle: 'deepResearchConfigTitle',
      reportsNoticeBody: 'multipleReportsInfo'
    },
    state: {
      enabled: 'schemaCommonEnabledState',
      disabled: 'schemaCommonDisabledState'
    }
  },
  'capture-behavior': {
    heroDescription: 'schemaCaptureBehaviorHeroDescription',
    groups: {
      reading: 'schemaCaptureBehaviorReadingGroupTitle',
      fragment: 'schemaCaptureBehaviorFragmentGroupTitle'
    }
  },
  output: {
    heroDescription: 'schemaOutputHeroDescription',
    groups: {
      templates: 'schemaOutputTemplatesGroupTitle',
      domainMappings: 'schemaOutputDomainMappingsGroupTitle',
      yaml: 'schemaOutputYamlGroupTitle'
    }
  },
  experimental: {
    heroDescription: 'schemaExperimentalHeroDescription',
    groups: {
      aiService: 'schemaExperimentalAiServiceGroupTitle',
      pageSummary: 'schemaExperimentalPageSummaryGroupTitle',
      subtitle: 'schemaExperimentalSubtitleGroupTitle'
    },
    aiFields: {
      provider: 'schemaExperimentalProviderFieldLabel',
      model: 'schemaExperimentalModelFieldLabel',
      apiUrl: 'schemaExperimentalApiUrlFieldLabel',
      apiKey: 'schemaExperimentalApiKeyFieldLabel'
    },
    pageSummaryRows: {
      saveSummaryTitle: 'schemaExperimentalPageSummaryToggleTitle',
      saveSummaryDescription: 'schemaExperimentalPageSummaryToggleDescription',
      overlayTitle: 'schemaExperimentalReadingOverlayToggleTitle',
      overlayDescription: 'schemaExperimentalReadingOverlayToggleDescription'
    },
    subtitleRows: {
      toggleTitle: 'schemaExperimentalSubtitleToggleTitle',
      toggleDescription: 'schemaExperimentalSubtitleToggleDescription',
      targetTitle: 'schemaExperimentalSubtitleTargetRowTitle',
      targetDescription: 'schemaExperimentalSubtitleTargetRowDescription'
    },
    state: {
      enabled: 'schemaCommonEnabledState',
      disabled: 'schemaCommonDisabledState'
    }
  },
  maintenance: {
    heroDescription: 'schemaMaintenanceHeroDescription',
    groups: {
      transfer: 'schemaMaintenanceTransferGroupTitle',
      diagnosis: 'schemaMaintenanceDiagnosisGroupTitle'
    },
    transfer: {
      copyButton: 'schemaMaintenanceTransferCopyButton',
      importButton: 'schemaMaintenanceTransferImportButton',
      lastActionTitle: 'schemaMaintenanceTransferLastActionNoticeTitle',
      copySuccess: 'schemaMaintenanceTransferLogCopySuccess',
      importSuccess: 'schemaMaintenanceTransferLogImportSuccess'
    },
    diagnosis: {
      diagnoseButton: 'schemaMaintenanceDiagnosisButton',
      fixButton: 'schemaMaintenanceFixButton',
      reloadButton: 'schemaMaintenanceReloadButton'
    }
  }
} as const;

export const SCHEMA_RESOURCE_COPY = {
  onboarding: {
    title: 'schemaResourceOnboardingTitle',
    hint: 'schemaResourceOnboardingHint'
  },
  pluginSetup: {
    title: 'schemaResourcePluginSetupTitle',
    description: 'schemaResourcePluginSetupDescription',
    sections: {
      recommendedValues: 'schemaResourcePluginSetupRecommendedValuesGroupTitle',
      setupFlow: 'schemaResourcePluginSetupSetupFlowGroupTitle',
      checklist: 'schemaResourcePluginSetupChecklistGroupTitle'
    },
    table: {
      fieldColumn: 'schemaCommonFieldColumnLabel',
      valueColumn: 'schemaCommonValueColumnLabel'
    },
    fields: {
      httpsUrl: 'schemaResourcePluginSetupFieldHttpsUrl',
      httpUrl: 'schemaResourcePluginSetupFieldHttpUrl',
      vault: 'schemaResourcePluginSetupFieldVault',
      apiKey: 'schemaResourcePluginSetupFieldApiKey'
    },
    steps: [
      'schemaResourcePluginSetupStep1',
      'schemaResourcePluginSetupStep2',
      'schemaResourcePluginSetupStep3',
      'schemaResourcePluginSetupStep4',
      'schemaResourcePluginSetupStep5'
    ] as const,
    checklist: [
      'schemaResourcePluginSetupChecklist1',
      'schemaResourcePluginSetupChecklist2',
      'schemaResourcePluginSetupChecklist3',
      'schemaResourcePluginSetupChecklist4',
      'schemaResourcePluginSetupChecklist5'
    ] as const,
    goToStorageButton: 'schemaResourcePluginSetupGoToStorageButton'
  },
  support: {
    title: 'schemaResourceSupportTitle',
    description: 'schemaResourceSupportDescription',
    sections: {
      channels: 'schemaResourceSupportChannelsGroupTitle',
      scope: 'schemaResourceSupportScopeGroupTitle'
    },
    cards: {
      koFiTitle: 'schemaResourceSupportKoFiTitle',
      koFiDescription: 'schemaResourceSupportKoFiDescription',
      afdianTitle: 'schemaResourceSupportAfdianTitle',
      afdianDescription: 'schemaResourceSupportAfdianDescription',
      emailTitle: 'schemaResourceSupportEmailTitle',
      emailDescription: 'schemaResourceSupportEmailDescription'
    },
    scope: [
      'schemaResourceSupportScope1',
      'schemaResourceSupportScope2',
      'schemaResourceSupportScope3',
      'schemaResourceSupportScope4'
    ] as const
  },
  suggestions: {
    title: 'schemaResourceSuggestionsTitle',
    description: 'schemaResourceSuggestionsDescription',
    sections: {
      channels: 'schemaResourceSuggestionsChannelsGroupTitle'
    },
    cards: {
      githubTitle: 'schemaResourceSuggestionsGithubTitle',
      githubDescription: 'schemaResourceSuggestionsGithubDescription',
      redditTitle: 'schemaResourceSuggestionsRedditTitle',
      redditDescription: 'schemaResourceSuggestionsRedditDescription',
      xiaohongshuTitle: 'schemaResourceSuggestionsXiaohongshuTitle',
      xiaohongshuDescription: 'schemaResourceSuggestionsXiaohongshuDescription'
    }
  },
  contact: {
    title: 'schemaResourceContactTitle',
    description: 'schemaResourceContactDescription',
    sections: {
      channels: 'schemaResourceContactChannelsGroupTitle'
    },
    cards: {
      redditTitle: 'schemaResourceContactRedditTitle',
      redditDescription: 'schemaResourceContactRedditDescription',
      githubTitle: 'schemaResourceContactGithubTitle',
      githubDescription: 'schemaResourceContactGithubDescription',
      emailTitle: 'schemaResourceContactEmailTitle',
      emailDescription: 'schemaResourceContactEmailDescription',
      wechatTitle: 'schemaResourceContactWechatTitle',
      wechatDescription: 'schemaResourceContactWechatDescription',
      wechatNote: 'schemaResourceContactWechatNote'
    }
  },
  changelog: {
    title: 'schemaResourceChangelogTitle',
    hint: 'schemaResourceChangelogHint'
  }
} as const;

export const SCHEMA_RESOURCE_PILL_COPY = {
  pluginSetup: [
    'schemaResourcePluginSetupFieldHttpsUrl',
    'schemaResourcePluginSetupFieldHttpUrl',
    'schemaResourcePluginSetupFieldVault',
    'schemaResourcePluginSetupFieldApiKey'
  ] as const,
  support: [
    'schemaResourceSupportKoFiTitle',
    'schemaResourceSupportAfdianTitle',
    'schemaResourceSupportEmailTitle'
  ] as const,
  suggestions: [
    'schemaResourceSuggestionsGithubTitle',
    'schemaResourceSuggestionsRedditTitle',
    'schemaResourceSuggestionsXiaohongshuTitle'
  ] as const,
  contact: [
    'schemaResourceContactRedditTitle',
    'schemaResourceContactGithubTitle',
    'schemaResourceContactEmailTitle'
  ] as const
} as const;

export function resolveSchemaMessage(messages: Messages | null, key: SchemaMessageKey): string {
  return String(messages?.[key] ?? DEFAULT_RUNTIME_MESSAGES[key] ?? '');
}

export function resolveSchemaOptionCopy(
  messages: Messages | null,
  options: ReadonlyArray<SchemaSelectOptionCopy>
): SelectOption[] {
  return options.map((option) => ({
    value: option.value,
    label: resolveSchemaMessage(messages, option.label)
  }));
}

export function resolveSchemaMessageList(
  messages: Messages | null,
  keys: readonly SchemaMessageKey[]
): string[] {
  return keys.map((key) => resolveSchemaMessage(messages, key));
}

export function resolveSchemaOverviewThemeCopy(language: string): SchemaOverviewThemeCopy {
  const normalizedLanguage = language.toLowerCase();

  if (normalizedLanguage.startsWith('zh-tw') || normalizedLanguage.startsWith('zh-hk')) {
    return {
      title: '介面主題',
      options: [
        { value: 'dark', label: '深色' },
        { value: 'light', label: '淺色' }
      ]
    };
  }

  if (normalizedLanguage.startsWith('zh')) {
    return {
      title: '界面主题',
      options: [
        { value: 'dark', label: '暗色' },
        { value: 'light', label: '亮色' }
      ]
    };
  }

  if (normalizedLanguage.startsWith('de')) {
    return {
      title: 'Oberflächenthema',
      options: [
        { value: 'dark', label: 'Dunkel' },
        { value: 'light', label: 'Hell' }
      ]
    };
  }

  if (normalizedLanguage.startsWith('ja')) {
    return {
      title: '表示テーマ',
      options: [
        { value: 'dark', label: 'ダーク' },
        { value: 'light', label: 'ライト' }
      ]
    };
  }

  if (normalizedLanguage.startsWith('ko')) {
    return {
      title: '인터페이스 테마',
      options: [
        { value: 'dark', label: '다크' },
        { value: 'light', label: '라이트' }
      ]
    };
  }

  if (normalizedLanguage.startsWith('es')) {
    return {
      title: 'Tema de la interfaz',
      options: [
        { value: 'dark', label: 'Oscuro' },
        { value: 'light', label: 'Claro' }
      ]
    };
  }

  return {
    title: 'Interface Theme',
    options: [
      { value: 'dark', label: 'Dark' },
      { value: 'light', label: 'Light' }
    ]
  };
}
