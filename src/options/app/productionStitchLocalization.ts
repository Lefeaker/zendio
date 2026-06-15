import type { Language, Messages } from '@i18n';
import {
  createSchemaTranslator,
  type SchemaMessageKey,
  type SchemaTranslator
} from '@options/stitch/schema/i18n';
import { createReleaseLanguageOptions } from '@options/stitch/languageOptions';
import type { PreviewContent } from '@options/stitch/types';

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

const OVERVIEW_HERO_PILL_KEYS = [
  'schemaOverviewHeroPillDefaultVaultReady',
  'schemaOverviewHeroPillRoutingActive',
  'schemaOverviewHeroPillYamlConfigured'
] as const satisfies readonly SchemaMessageKey[];

const STORAGE_HERO_PILL_KEYS = [
  'schemaStorageVaultListTitle',
  'schemaStorageRoutingGroupTitle'
] as const satisfies readonly SchemaMessageKey[];

const CAPTURE_SOURCES_HERO_PILL_KEYS = [
  'schemaCaptureSourcesAiChatGroupTitle',
  'schemaCaptureSourcesVideoGroupTitle'
] as const satisfies readonly SchemaMessageKey[];

const CAPTURE_BEHAVIOR_HERO_PILL_KEYS = [
  'schemaCaptureBehaviorReadingGroupTitle',
  'schemaCaptureBehaviorFragmentGroupTitle'
] as const satisfies readonly SchemaMessageKey[];

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

const DOMAIN_MAPPING_NOTE_KEYS = [
  'schemaOutputDomainMappingNoteWeChat',
  'schemaOutputDomainMappingNoteArxiv',
  'schemaOutputDomainMappingNoteChatGpt'
] as const satisfies readonly SchemaMessageKey[];

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

function localizeClipperSurface(
  surface: PreviewContent['surfaces']['clipper'],
  t: SchemaTranslator
): PreviewContent['surfaces']['clipper'] {
  return {
    ...surface,
    selectedText: t('schemaRuntimeClipperSelectedText', surface.selectedText)
  };
}

function localizeReaderSurface(
  surface: PreviewContent['surfaces']['reader'],
  t: SchemaTranslator
): PreviewContent['surfaces']['reader'] {
  return {
    ...surface,
    highlights: surface.highlights.map((highlight, index) => {
      if (index === 0) {
        return {
          ...highlight,
          excerpt: t('schemaRuntimeReaderHighlightOneExcerpt', highlight.excerpt),
          commentPreview: highlight.commentPreview
            ? t('schemaRuntimeReaderHighlightOneComment', highlight.commentPreview)
            : highlight.commentPreview,
          comment: highlight.comment
            ? t('schemaRuntimeReaderHighlightOneComment', highlight.comment)
            : highlight.comment
        };
      }

      if (index === 1) {
        return {
          ...highlight,
          excerpt: t('schemaRuntimeReaderHighlightTwoExcerpt', highlight.excerpt),
          commentPreview: highlight.commentPreview
            ? t('schemaRuntimeReaderHighlightTwoComment', highlight.commentPreview)
            : highlight.commentPreview,
          comment: highlight.comment
            ? t('schemaRuntimeReaderHighlightTwoComment', highlight.comment)
            : highlight.comment
        };
      }

      if (index === 2) {
        return {
          ...highlight,
          fullText: t('schemaRuntimeReaderHighlightThreeFullText', highlight.fullText),
          draft: highlight.draft
            ? t('schemaRuntimeReaderHighlightThreeDraft', highlight.draft)
            : highlight.draft
        };
      }

      return highlight;
    })
  };
}

function localizeVideoSurface(
  surface: PreviewContent['surfaces']['video'],
  t: SchemaTranslator
): PreviewContent['surfaces']['video'] {
  return {
    ...surface,
    captures: surface.captures.map((capture, index) => {
      if (index === 1 && capture.fullText) {
        return {
          ...capture,
          fullText: t('schemaRuntimeVideoCaptureTwoFullText', capture.fullText),
          commentPreview: capture.commentPreview
            ? t('schemaRuntimeVideoCaptureTwoComment', capture.commentPreview)
            : capture.commentPreview,
          comment: capture.comment
            ? t('schemaRuntimeVideoCaptureTwoComment', capture.comment)
            : capture.comment
        };
      }

      if (index === 0) {
        return {
          ...capture,
          commentPreview: capture.commentPreview
            ? t('schemaRuntimeVideoCaptureOneComment', capture.commentPreview)
            : capture.commentPreview,
          comment: capture.comment
            ? t('schemaRuntimeVideoCaptureOneComment', capture.comment)
            : capture.comment
        };
      }

      if (index === 2) {
        return {
          ...capture,
          draft: capture.draft
            ? t('schemaRuntimeVideoCaptureThreeDraft', capture.draft)
            : capture.draft
        };
      }

      return capture;
    })
  };
}

function localizeOutput(
  output: PreviewContent['output'],
  t: SchemaTranslator
): PreviewContent['output'] {
  return {
    ...output,
    domainMappings: output.domainMappings.map(([domain, alias, note], index) => {
      const noteKey = DOMAIN_MAPPING_NOTE_KEYS[index];
      return [
        domain,
        alias,
        noteKey ? t(noteKey, note) : note
      ] as (typeof output.domainMappings)[number];
    }),
    yamlFilters: output.yamlFilters.map((filter) => {
      const key = YAML_FILTER_KEYS[filter.value];
      return {
        ...filter,
        label: key ? t(key, filter.label) : filter.label
      };
    })
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
      ...content.storage,
      hero: {
        ...content.storage.hero,
        pills: localizePills(content.storage.hero.pills, STORAGE_HERO_PILL_KEYS, t)
      }
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
      clipper: localizeClipperSurface(content.surfaces.clipper, t),
      reader: localizeReaderSurface(content.surfaces.reader, t),
      video: localizeVideoSurface(content.surfaces.video, t)
    },
    maintenanceLog:
      content.maintenanceLog === previewContent.maintenanceLog
        ? t('schemaMaintenanceDiagnosisResultLog', content.maintenanceLog)
        : content.maintenanceLog
  };
}
