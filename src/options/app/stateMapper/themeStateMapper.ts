import { resolveExtensionVersionLabel } from '../productionStitchVersion';
import type { CompleteOptions, InterfaceTheme, StoredOptions } from '@shared/types/options';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import { normalizeFragmentModifierKeys } from '../fragmentModifierOptions';
import { createYamlFieldStates, toTemplateValues } from './yamlStateMapper';
import { toRoutingRules } from './vaultStateMapper';

export { resolveExtensionVersionLabel } from '../productionStitchVersion';

export const RUNTIME_SURFACE_RESOURCE_IDS = new Set(['clipper', 'reader', 'video', 'task-success']);
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
