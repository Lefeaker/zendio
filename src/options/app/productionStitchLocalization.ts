import type { Language, Messages } from '@i18n';
import {
  createSchemaTranslator,
  type SchemaMessageKey,
  type SchemaTranslator
} from '@options/stitch/schema/i18n';
import { createReleaseLanguageOptions } from '@options/stitch/languageOptions';
import type { PreviewContent } from '@options/stitch/types';
import { localizeRuntimeCaptureSurfaces } from './productionStitchSurfaceLocalization';

const NAV_LABEL_KEYS = {
  overview: 'schemaOverviewTitle',
  storage: 'schemaStorageTitle',
  'capture-sources': 'schemaCaptureSourcesTitle',
  'capture-behavior': 'schemaCaptureBehaviorTitle',
  output: 'schemaOutputTitle',
  maintenance: 'schemaMaintenanceTitle'
} satisfies Record<string, SchemaMessageKey>;

const NAV_HINT_KEYS = {
  overview: 'schemaNavOverviewHint',
  storage: 'schemaNavStorageHint',
  'capture-sources': 'schemaNavCaptureSourcesHint',
  'capture-behavior': 'schemaNavCaptureBehaviorHint',
  output: 'schemaNavOutputHint',
  maintenance: 'schemaNavMaintenanceHint'
} satisfies Record<string, SchemaMessageKey>;

const SIDEBAR_LABEL_KEYS = {
  onboarding: 'schemaResourceOnboardingTitle',
  'plugin-setup': 'schemaResourcePluginSetupTitle',
  support: 'schemaResourceSupportTitle',
  suggestions: 'schemaResourceSuggestionsTitle',
  contact: 'schemaResourceContactTitle',
  changelog: 'schemaResourceChangelogTitle'
} satisfies Record<string, SchemaMessageKey>;

const SIDEBAR_HINT_KEYS = {
  onboarding: 'schemaResourceOnboardingHint',
  'plugin-setup': 'schemaResourcePluginSetupHint',
  support: 'schemaResourceSupportHint',
  suggestions: 'schemaResourceSuggestionsHint',
  contact: 'schemaResourceContactHint',
  changelog: 'schemaResourceChangelogHint'
} satisfies Record<string, SchemaMessageKey>;

const SURFACE_LABEL_KEYS = {
  clipper: 'schemaRuntimeClipperTitle',
  reader: 'schemaRuntimeReaderTitle',
  video: 'schemaRuntimeVideoTitle',
  'video-floating-prompt': 'schemaRuntimeVideoFloatingPromptTitle',
  'task-success': 'schemaRuntimeTaskSuccessTitle'
} satisfies Record<string, SchemaMessageKey>;

const SURFACE_HINT_KEYS = {
  clipper: 'schemaRuntimeClipperHint',
  reader: 'schemaRuntimeReaderHint',
  video: 'schemaRuntimeVideoHint',
  'video-floating-prompt': 'schemaRuntimeVideoFloatingPromptHint',
  'task-success': 'schemaRuntimeTaskSuccessHint'
} satisfies Record<string, SchemaMessageKey>;

const OVERVIEW_HERO_PILL_KEYS: readonly SchemaMessageKey[] = [
  'schemaOverviewHeroPillDefaultVaultReady',
  'schemaOverviewHeroPillRoutingActive',
  'schemaOverviewHeroPillYamlConfigured'
] satisfies readonly SchemaMessageKey[];

const STORAGE_HERO_PILL_KEYS: readonly SchemaMessageKey[] = [
  'schemaStorageVaultListTitle',
  'schemaStorageRoutingGroupTitle'
] satisfies readonly SchemaMessageKey[];

const CAPTURE_SOURCES_HERO_PILL_KEYS: readonly SchemaMessageKey[] = [
  'schemaCaptureSourcesAiChatGroupTitle',
  'schemaCaptureSourcesVideoGroupTitle'
] satisfies readonly SchemaMessageKey[];

const CAPTURE_BEHAVIOR_HERO_PILL_KEYS: readonly SchemaMessageKey[] = [
  'schemaCaptureBehaviorReadingGroupTitle',
  'schemaCaptureBehaviorFragmentGroupTitle'
] satisfies readonly SchemaMessageKey[];

const LANGUAGE_OPTION_KEYS: Record<string, SchemaMessageKey> = {
  en: 'schemaOverviewLanguageOptionEn',
  'zh-CN': 'schemaOverviewLanguageOptionZhCn',
  ja: 'schemaOverviewLanguageOptionJa',
  de: 'schemaOverviewLanguageOptionDe',
  fr: 'schemaOverviewLanguageOptionFr',
  'es-ES': 'schemaOverviewLanguageOptionEsEs',
  'es-419': 'schemaOverviewLanguageOptionEs419',
  it: 'schemaOverviewLanguageOptionIt',
  ko: 'schemaOverviewLanguageOptionKo',
  'pt-BR': 'schemaOverviewLanguageOptionPtBr',
  ru: 'schemaOverviewLanguageOptionRu',
  'zh-TW': 'schemaOverviewLanguageOptionZhTw'
};

const SUBTITLE_LANGUAGE_KEYS: Record<string, SchemaMessageKey> = {
  'zh-CN': 'schemaOverviewLanguageOptionZhCn',
  en: 'schemaOverviewLanguageOptionEn',
  ja: 'schemaOverviewLanguageOptionJa',
  ko: 'schemaOverviewLanguageOptionKo',
  de: 'schemaOverviewLanguageOptionDe',
  es: 'schemaOverviewLanguageOptionEsEs'
};

const YAML_FILTER_KEYS: Record<string, SchemaMessageKey> = {
  all: 'schemaYamlFilterAllLabel',
  article: 'schemaYamlFilterArticleLabel',
  clipper: 'schemaYamlFilterClipperLabel',
  video: 'schemaYamlFilterVideoLabel',
  ai_chat: 'schemaYamlFilterAiChatLabel'
};

const ROUTING_TYPE_OPTION_KEYS: Record<string, SchemaMessageKey> = {
  Domain: 'domainLabel',
  Keyword: 'ruleTypeKeyword',
  'URL Pattern': 'ruleTypeUrlPattern'
};

const SAMPLE_VAULT_KEYS: Record<string, SchemaMessageKey> = {
  'Research Vault': 'schemaPreviewSampleVaultResearch',
  'Inbox Vault': 'schemaPreviewSampleVaultInbox',
  'Archive Vault': 'schemaPreviewSampleVaultArchive',
  'Video Vault': 'schemaPreviewSampleVaultVideo'
};

const DOMAIN_MAPPING_NOTE_KEYS: readonly SchemaMessageKey[] = [
  'schemaOutputDomainMappingNoteWeChat',
  'schemaOutputDomainMappingNoteArxiv',
  'schemaOutputDomainMappingNoteChatGpt'
] satisfies readonly SchemaMessageKey[];

function localizePills(
  pills: string[],
  keys: readonly SchemaMessageKey[],
  t: SchemaTranslator
): string[] {
  return pills.map((pill, index) => {
    const key = keys[index];
    return key ? t(key, pill) : pill;
  });
}

function localizeSelectOptions(
  options: PreviewContent['experimental']['subtitleLanguages'],
  keys: Partial<Record<string, SchemaMessageKey>>,
  t: SchemaTranslator
): PreviewContent['experimental']['subtitleLanguages'] {
  return options.map((option) => {
    const key = keys[option.value];
    return {
      ...option,
      label: key ? t(key, option.label) : option.label
    };
  });
}

function localizeLanguageOptions(t: SchemaTranslator): PreviewContent['languageOptions'] {
  return createReleaseLanguageOptions((code, metadata) => {
    const key = LANGUAGE_OPTION_KEYS[code];
    return key ? t(key, metadata.englishName) : metadata.englishName;
  });
}

function localizeNavItems(
  items: PreviewContent['nav'],
  labelKeys: Partial<Record<string, SchemaMessageKey>>,
  hintKeys: Partial<Record<string, SchemaMessageKey>>,
  t: SchemaTranslator
): PreviewContent['nav'] {
  return items.map((item) => {
    const labelKey = labelKeys[item.id];
    const hintKey = hintKeys[item.id];
    return {
      ...item,
      label: labelKey ? t(labelKey, item.label) : item.label,
      hint: hintKey ? t(hintKey, item.hint) : item.hint
    };
  });
}

function localizeSampleValue(
  value: string,
  previewValue: string,
  key: SchemaMessageKey | undefined,
  t: SchemaTranslator
): string {
  return value === previewValue && key ? t(key, previewValue) : value;
}

function localizeSampleVaultLabel(label: string, t: SchemaTranslator): string {
  const key = SAMPLE_VAULT_KEYS[label];
  return key ? t(key, label) : label;
}

function localizeStorage(
  storage: PreviewContent['storage'],
  previewStorage: PreviewContent['storage'],
  t: SchemaTranslator
): PreviewContent['storage'] {
  return {
    ...storage,
    hero: {
      ...storage.hero,
      pills: localizePills(storage.hero.pills, STORAGE_HERO_PILL_KEYS, t)
    },
    routingTypeOptions: storage.routingTypeOptions.map((option) => ({
      ...option,
      label: ROUTING_TYPE_OPTION_KEYS[option.value]
        ? t(ROUTING_TYPE_OPTION_KEYS[option.value], option.label)
        : option.label
    })),
    vaults: storage.vaults.map((vault, index) => ({
      ...vault,
      name: localizeSampleValue(
        vault.name,
        previewStorage.vaults[index]?.name ?? vault.name,
        SAMPLE_VAULT_KEYS[vault.name] ??
          SAMPLE_VAULT_KEYS[previewStorage.vaults[index]?.name ?? ''],
        t
      )
    })),
    routingRules: storage.routingRules.map((rule, index) => ({
      ...rule,
      target: localizeSampleValue(
        rule.target,
        previewStorage.routingRules[index]?.target ?? rule.target,
        SAMPLE_VAULT_KEYS[rule.target] ??
          SAMPLE_VAULT_KEYS[previewStorage.routingRules[index]?.target ?? ''],
        t
      )
    }))
  };
}

function localizeOutput(
  output: PreviewContent['output'],
  t: SchemaTranslator
): PreviewContent['output'] {
  type DomainMappingRow = PreviewContent['output']['domainMappings'][number];
  const localizeDomainMapping = (
    [domain, alias, note]: DomainMappingRow,
    index: number
  ): DomainMappingRow => {
    const noteKey = DOMAIN_MAPPING_NOTE_KEYS[index];
    return [domain, alias, noteKey ? t(noteKey, note) : note];
  };

  return {
    ...output,
    domainMappings: output.domainMappings.map(localizeDomainMapping),
    yamlFilters: output.yamlFilters.map((filter) => {
      const key = YAML_FILTER_KEYS[filter.value];
      return {
        ...filter,
        label: key ? t(key, filter.label) : filter.label
      };
    })
  };
}

function localizeTaskSuccessSurface(
  surface: PreviewContent['surfaces']['taskSuccess'],
  t: SchemaTranslator
): PreviewContent['surfaces']['taskSuccess'] {
  return {
    ...surface,
    likeToast: {
      ...surface.likeToast,
      detail: t('schemaPreviewTaskSuccessLikeToastDetail', surface.likeToast.detail)
    },
    dislikeToast: {
      ...surface.dislikeToast,
      detail: t('schemaPreviewTaskSuccessDislikeToastDetail', surface.dislikeToast.detail)
    }
  };
}

export function localizeStitchContent(
  content: PreviewContent,
  options: { language: Language; messages: Messages | null; previewContent?: PreviewContent }
): PreviewContent {
  const t = createSchemaTranslator(options.messages);
  const previewContent = options.previewContent ?? content;

  return {
    ...content,
    rendererLabels: {
      ...content.rendererLabels,
      resourcePendingBadge: t(
        'schemaRendererResourcePendingBadge',
        content.rendererLabels.resourcePendingBadge
      ),
      resourceOpenAction: t(
        'schemaRendererResourceOpenAction',
        content.rendererLabels.resourceOpenAction
      ),
      highlightExamplePrefix: t(
        'schemaRendererHighlightExamplePrefix',
        content.rendererLabels.highlightExamplePrefix
      ),
      highlightExampleText: t(
        'schemaRendererHighlightExampleText',
        content.rendererLabels.highlightExampleText
      ),
      highlightExampleSuffix: t(
        'schemaRendererHighlightExampleSuffix',
        content.rendererLabels.highlightExampleSuffix
      )
    },
    nav: localizeNavItems(content.nav, NAV_LABEL_KEYS, NAV_HINT_KEYS, t),
    sidebarLinks: localizeNavItems(content.sidebarLinks, SIDEBAR_LABEL_KEYS, SIDEBAR_HINT_KEYS, t),
    surfaceLinks: localizeNavItems(
      content.surfaceLinks.length > 0 ? content.surfaceLinks : previewContent.surfaceLinks,
      SURFACE_LABEL_KEYS,
      SURFACE_HINT_KEYS,
      t
    ),
    overview: {
      ...content.overview,
      hero: {
        ...content.overview.hero,
        pills: localizePills(content.overview.hero.pills, OVERVIEW_HERO_PILL_KEYS, t)
      }
    },
    languageOptions: localizeLanguageOptions(t),
    storage: {
      ...localizeStorage(content.storage, previewContent.storage, t)
    },
    captureSources: {
      ...content.captureSources,
      hero: {
        ...content.captureSources.hero,
        pills: localizePills(content.captureSources.hero.pills, CAPTURE_SOURCES_HERO_PILL_KEYS, t)
      }
    },
    captureBehavior: {
      ...content.captureBehavior,
      hero: {
        ...content.captureBehavior.hero,
        pills: localizePills(content.captureBehavior.hero.pills, CAPTURE_BEHAVIOR_HERO_PILL_KEYS, t)
      }
    },
    output: localizeOutput(content.output, t),
    experimental: {
      ...content.experimental,
      subtitleLanguages: localizeSelectOptions(
        content.experimental.subtitleLanguages,
        SUBTITLE_LANGUAGE_KEYS,
        t
      )
    },
    surfaces: {
      ...content.surfaces,
      ...localizeRuntimeCaptureSurfaces(content.surfaces, previewContent.surfaces, t, {
        localizeSampleValue: (value, previewValue, key) =>
          localizeSampleValue(value, previewValue, key, t),
        localizeSampleVaultLabel: (label) => localizeSampleVaultLabel(label, t)
      }),
      taskSuccess: localizeTaskSuccessSurface(content.surfaces.taskSuccess, t)
    },
    maintenanceLog:
      content.maintenanceLog === previewContent.maintenanceLog
        ? t('schemaMaintenanceDiagnosisResultLog', content.maintenanceLog)
        : content.maintenanceLog
  };
}
