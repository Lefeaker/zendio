import type {
  StoredOptions,
  CompleteOptions,
  ClassifierOptions,
  FragmentClipperOptions,
  ReadingSessionOptions,
  DeepResearchOptions,
  AiChatOptions,
  ReaderHighlightTheme,
  RestOptions,
  ExperimentalAiOptions,
  PageSummaryOptions,
  ReadingOverlaySummaryOptions,
  PrivacyPreferencesOptions,
  SubtitleTranslationOptions
} from '../types';
import type { StoredOptions as SchemaStoredOptions } from '../schemas/options.schema';
import { DEFAULT_OPTIONS } from './defaultOptions';
import { sanitizeVaultRouterConfig, sanitizeYamlConfigValue } from './optionsSanitizer';
import { resolveTaxonomy } from './taxonomyMigration';
import { mergeVideoOptions } from './videoOptionsMerger';
import { isFragmentSelectionTriggerMode } from './selectionTriggerMode';
export { omitLegacyRestRootDir, omitLegacyRestRootDirFromOptions } from './legacyRestRootDir';

function mergeClassifierOptions(
  source?: StoredOptions['classifier'] | SchemaStoredOptions['classifier']
): ClassifierOptions | undefined {
  const defaults = DEFAULT_OPTIONS.classifier;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  return {
    enabled: base.enabled ?? defaults?.enabled ?? false,
    provider: base.provider || defaults?.provider || 'ollama',
    endpoint: base.endpoint || defaults?.endpoint || 'http://localhost:11434/api/chat',
    apiKey: base.apiKey || defaults?.apiKey || '',
    model: base.model || defaults?.model || 'llama3.1',
    taxonomy: resolveTaxonomy(base.taxonomy ?? defaults?.taxonomy)
  };
}

const READER_HIGHLIGHT_THEMES: ReadonlyArray<ReaderHighlightTheme> = [
  'gradient',
  'purple',
  'neonYellow',
  'neonGreen',
  'neonOrange'
];

function resolveReaderHighlightTheme(
  theme: unknown,
  fallback: ReaderHighlightTheme
): ReaderHighlightTheme {
  return READER_HIGHLIGHT_THEMES.includes(theme as ReaderHighlightTheme)
    ? (theme as ReaderHighlightTheme)
    : fallback;
}

function mergeFragmentClipperOptions(
  source?: StoredOptions['fragmentClipper'] | SchemaStoredOptions['fragmentClipper']
): FragmentClipperOptions | undefined {
  const defaults = DEFAULT_OPTIONS.fragmentClipper;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  const rawKeys = Array.isArray(base.selectionModifierKeys)
    ? base.selectionModifierKeys
    : (defaults?.selectionModifierKeys ?? []);
  const normalizedModifierKeys = rawKeys.filter(
    (key): key is FragmentClipperOptions['selectionModifierKeys'][number] => {
      return key === 'alt' || key === 'meta' || key === 'ctrl' || key === 'shift';
    }
  );
  const selectionModifierKeys =
    normalizedModifierKeys.length > 0
      ? [normalizedModifierKeys[0]]
      : [...(defaults?.selectionModifierKeys ?? ['shift'])];

  return {
    useFootnoteFormat: base.useFootnoteFormat ?? defaults?.useFootnoteFormat ?? true,
    captureContext: base.captureContext ?? defaults?.captureContext ?? false,
    contextLength: base.contextLength ?? defaults?.contextLength ?? 200,
    contextMode: base.contextMode ?? defaults?.contextMode ?? 'chars',
    selectionTriggerMode: isFragmentSelectionTriggerMode(base.selectionTriggerMode)
      ? base.selectionTriggerMode
      : (defaults?.selectionTriggerMode ?? 'modifier'),
    selectionModifierKeys,
    keyboardShortcutsEnabled:
      base.keyboardShortcutsEnabled ?? defaults?.keyboardShortcutsEnabled ?? true
  };
}

function mergeReadingSessionOptions(
  source?: StoredOptions['readingSession'] | SchemaStoredOptions['readingSession']
): ReadingSessionOptions | undefined {
  const defaults = DEFAULT_OPTIONS.readingSession;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  return {
    exportMode: base.exportMode ?? defaults?.exportMode ?? 'highlights',
    highlightTheme: resolveReaderHighlightTheme(
      base.highlightTheme ?? defaults?.highlightTheme,
      defaults?.highlightTheme ?? 'gradient'
    )
  };
}

function mergeDeepResearchOptions(
  source?: StoredOptions['deepResearch'] | SchemaStoredOptions['deepResearch']
): DeepResearchOptions | undefined {
  const defaults = DEFAULT_OPTIONS.deepResearch;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  return {
    pureMode: base.pureMode ?? defaults?.pureMode ?? false
  };
}

function mergeAiChatOptions(
  source?: StoredOptions['aiChat'] | SchemaStoredOptions['aiChat']
): AiChatOptions | undefined {
  const defaults = DEFAULT_OPTIONS.aiChat;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  return {
    includeTimestamps: base.includeTimestamps ?? defaults?.includeTimestamps ?? false,
    userName: base.userName || defaults?.userName || 'USER'
  };
}

function mergeExperimentalAiOptions(
  source?: StoredOptions['experimentalAi'] | SchemaStoredOptions['experimentalAi']
): ExperimentalAiOptions | undefined {
  const defaults = DEFAULT_OPTIONS.experimentalAi;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  return {
    provider:
      (base.provider ?? defaults?.provider ?? '').trim() || defaults?.provider || 'compatible',
    model: (base.model ?? defaults?.model ?? '').trim() || defaults?.model || 'gpt-4.1-mini',
    apiUrl:
      (base.apiUrl ?? defaults?.apiUrl ?? '').trim() ||
      defaults?.apiUrl ||
      'https://api.openai.com/v1/chat/completions',
    apiKey: (base.apiKey ?? defaults?.apiKey ?? '').trim() || defaults?.apiKey || ''
  };
}

function mergePageSummaryOptions(
  source?: StoredOptions['pageSummary'] | SchemaStoredOptions['pageSummary']
): PageSummaryOptions | undefined {
  const defaults = DEFAULT_OPTIONS.pageSummary;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  return {
    enabled: base.enabled ?? defaults?.enabled ?? false
  };
}

function mergeReadingOverlaySummaryOptions(
  source?: StoredOptions['readingOverlaySummary'] | SchemaStoredOptions['readingOverlaySummary']
): ReadingOverlaySummaryOptions | undefined {
  const defaults = DEFAULT_OPTIONS.readingOverlaySummary;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  return {
    enabled: base.enabled ?? defaults?.enabled ?? false
  };
}

function mergeSubtitleTranslationOptions(
  source?: StoredOptions['subtitleTranslation'] | SchemaStoredOptions['subtitleTranslation']
): SubtitleTranslationOptions | undefined {
  const defaults = DEFAULT_OPTIONS.subtitleTranslation;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  return {
    enabled: base.enabled ?? defaults?.enabled ?? false,
    targetLanguage:
      (base.targetLanguage ?? defaults?.targetLanguage ?? '').trim() ||
      defaults?.targetLanguage ||
      'zh-CN'
  };
}

function mergePrivacyPreferencesOptions(
  source?: StoredOptions['privacyPreferences'] | SchemaStoredOptions['privacyPreferences']
): PrivacyPreferencesOptions | undefined {
  const defaults = DEFAULT_OPTIONS.privacyPreferences;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  const analytics = base.analytics ?? defaults?.analytics ?? false;
  const errorReporting = base.errorReporting ?? defaults?.errorReporting ?? false;
  return {
    analytics,
    errorReporting,
    debugMode:
      analytics && errorReporting ? (base.debugMode ?? defaults?.debugMode ?? false) : false
  };
}

function sanitizeVaultRouter(source: unknown): StoredOptions['vaultRouter'] {
  return sanitizeVaultRouterConfig(source);
}

function requireMerged<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('OPTIONS_DEFAULT_MISSING');
  }
  return value;
}

export function mergeOptions(stored?: StoredOptions | SchemaStoredOptions | null): CompleteOptions {
  const source = stored ?? {};
  const defaults = DEFAULT_OPTIONS;

  const rest: RestOptions = {
    baseUrl: source.rest?.baseUrl || defaults.rest.baseUrl,
    vault: source.rest?.vault || defaults.rest.vault,
    apiKey: source.rest?.apiKey || defaults.rest.apiKey
  };

  const sourceHttpsUrl = source.rest?.httpsUrl;
  const defaultHttpsUrl = defaults.rest.httpsUrl;
  if (sourceHttpsUrl !== undefined || defaultHttpsUrl !== undefined) {
    const resolvedHttpsUrl = sourceHttpsUrl || defaultHttpsUrl;
    if (resolvedHttpsUrl !== undefined) {
      rest.httpsUrl = resolvedHttpsUrl;
    }
  }

  const sourceHttpUrl = source.rest?.httpUrl;
  const defaultHttpUrl = defaults.rest.httpUrl;
  if (sourceHttpUrl !== undefined || defaultHttpUrl !== undefined) {
    const resolvedHttpUrl = sourceHttpUrl || defaultHttpUrl;
    if (resolvedHttpUrl !== undefined) {
      rest.httpUrl = resolvedHttpUrl;
    }
  }

  const sourceLocalFolderId = source.rest?.localFolderId;
  if (sourceLocalFolderId !== undefined) {
    rest.localFolderId = sourceLocalFolderId;
  }

  const sourceLocalFolderName = source.rest?.localFolderName;
  if (sourceLocalFolderName !== undefined) {
    rest.localFolderName = sourceLocalFolderName;
  }

  const templates = {
    article: source.templates?.article || defaults.templates.article,
    video: source.templates?.video || defaults.templates.video,
    fragment: source.templates?.fragment || defaults.templates.fragment,
    reading: source.templates?.reading || source.templates?.fragment || defaults.templates.reading,
    ai: source.templates?.ai || defaults.templates.ai
  };

  const domainMappings = source.domainMappings
    ? { ...source.domainMappings }
    : { ...defaults.domainMappings };

  const options: CompleteOptions = {
    interfaceTheme:
      source.interfaceTheme === 'light' ||
      source.interfaceTheme === 'dark' ||
      source.interfaceTheme === 'system'
        ? source.interfaceTheme
        : (defaults.interfaceTheme ?? 'system'),
    rest,
    templates,
    domainMappings,
    classifier: requireMerged(mergeClassifierOptions(source.classifier)),
    deepResearch: requireMerged(mergeDeepResearchOptions(source.deepResearch)),
    fragmentClipper: requireMerged(mergeFragmentClipperOptions(source.fragmentClipper)),
    readingSession: requireMerged(mergeReadingSessionOptions(source.readingSession)),
    aiChat: requireMerged(mergeAiChatOptions(source.aiChat)),
    video: requireMerged(mergeVideoOptions(source.video)),
    experimentalAi: requireMerged(mergeExperimentalAiOptions(source.experimentalAi)),
    pageSummary: requireMerged(mergePageSummaryOptions(source.pageSummary)),
    readingOverlaySummary: requireMerged(
      mergeReadingOverlaySummaryOptions(source.readingOverlaySummary)
    ),
    subtitleTranslation: requireMerged(mergeSubtitleTranslationOptions(source.subtitleTranslation)),
    privacyPreferences: requireMerged(mergePrivacyPreferencesOptions(source.privacyPreferences))
  };

  const vaultRouter = sanitizeVaultRouter(source.vaultRouter);
  if (vaultRouter !== undefined) {
    options.vaultRouter = vaultRouter;
  }

  const yamlConfig = sanitizeYamlConfigValue(source.yamlConfig);
  if (yamlConfig !== undefined) {
    options.yamlConfig = yamlConfig;
  }

  return options;
}

export const optionsMerger = {
  merge: (stored?: StoredOptions | SchemaStoredOptions | null) => mergeOptions(stored)
};
