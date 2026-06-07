import type { Language, Messages } from '@i18n';
import {
  createSchemaTranslator,
  type SchemaMessageKey,
  type SchemaTranslator
} from '@options/stitch/schema/i18n';
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
          excerpt: t('schemaRuntimeReaderHighlightOneExcerpt', highlight.excerpt)
        };
      }

      if (index === 1) {
        return {
          ...highlight,
          excerpt: t('schemaRuntimeReaderHighlightTwoExcerpt', highlight.excerpt)
        };
      }

      if (index === 2) {
        return {
          ...highlight,
          fullText: t('schemaRuntimeReaderHighlightThreeFullText', highlight.fullText)
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
          fullText: t('schemaRuntimeVideoCaptureTwoFullText', capture.fullText)
        };
      }

      return capture;
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
