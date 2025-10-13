import type {
  StoredOptions,
  OptionsState,
  ClassifierOptions,
  FragmentClipperOptions,
  ReadingSessionOptions,
  DeepResearchOptions,
  AiChatOptions,
  VideoOptions,
  ReaderHighlightTheme
} from '../types';
import { DEFAULT_OPTIONS } from './defaultOptions';

function mergeClassifierOptions(source?: StoredOptions['classifier']): ClassifierOptions | undefined {
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
    taxonomy: base.taxonomy ?? defaults?.taxonomy ?? {}
  };
}

const READER_HIGHLIGHT_THEMES: ReadonlyArray<ReaderHighlightTheme> = [
  'gradient',
  'purple',
  'neonYellow',
  'neonGreen',
  'neonOrange'
];

function resolveReaderHighlightTheme(theme: unknown, fallback: ReaderHighlightTheme): ReaderHighlightTheme {
  return READER_HIGHLIGHT_THEMES.includes(theme as ReaderHighlightTheme)
    ? (theme as ReaderHighlightTheme)
    : fallback;
}

function mergeFragmentClipperOptions(source?: StoredOptions['fragmentClipper']): FragmentClipperOptions | undefined {
  const defaults = DEFAULT_OPTIONS.fragmentClipper;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  const rawKeys = Array.isArray(base.selectionModifierKeys)
    ? base.selectionModifierKeys
    : defaults?.selectionModifierKeys ?? [];
  const selectionModifierKeys = rawKeys.filter((key): key is FragmentClipperOptions['selectionModifierKeys'][number] => {
    return key === 'alt' || key === 'meta' || key === 'ctrl' || key === 'shift';
  });

  return {
    useFootnoteFormat: base.useFootnoteFormat ?? defaults?.useFootnoteFormat ?? true,
    captureContext: base.captureContext ?? defaults?.captureContext ?? false,
    contextLength: base.contextLength ?? defaults?.contextLength ?? 200,
    contextMode: base.contextMode ?? defaults?.contextMode ?? 'chars',
    selectionModifierEnabled: base.selectionModifierEnabled ?? defaults?.selectionModifierEnabled ?? false,
    selectionModifierKeys
  };
}

function mergeReadingSessionOptions(source?: StoredOptions['readingSession']): ReadingSessionOptions | undefined {
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

function mergeDeepResearchOptions(source?: StoredOptions['deepResearch']): DeepResearchOptions | undefined {
  const defaults = DEFAULT_OPTIONS.deepResearch;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  return {
    pureMode: base.pureMode ?? defaults?.pureMode ?? false
  };
}

function mergeAiChatOptions(source?: StoredOptions['aiChat']): AiChatOptions | undefined {
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

function mergeVideoOptions(source?: StoredOptions['video']): VideoOptions | undefined {
  const defaults = DEFAULT_OPTIONS.video;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  return {
    floatingPromptEnabled: base.floatingPromptEnabled ?? defaults?.floatingPromptEnabled ?? true
  };
}

export function mergeOptions(stored?: StoredOptions | null): OptionsState {
  const source = stored ?? {};
  const defaults = DEFAULT_OPTIONS;

  const rest = {
    baseUrl: source.rest?.baseUrl || defaults.rest.baseUrl,
    httpsUrl: source.rest?.httpsUrl || defaults.rest.httpsUrl,
    httpUrl: source.rest?.httpUrl || defaults.rest.httpUrl,
    vault: source.rest?.vault || defaults.rest.vault,
    apiKey: source.rest?.apiKey || defaults.rest.apiKey,
    rootDir: source.rest?.rootDir ?? defaults.rest.rootDir
  };

  const storedTemplates = source.templates ?? {};
  const legacyClipper = typeof storedTemplates === 'object'
    ? (storedTemplates as Record<string, unknown>).clipper
    : undefined;
  const legacyClipperString = typeof legacyClipper === 'string' ? legacyClipper : undefined;

  const templates = {
    article: source.templates?.article || defaults.templates.article,
    fragment: source.templates?.fragment || legacyClipperString || defaults.templates.fragment,
    reading: source.templates?.reading
      || source.templates?.fragment
      || legacyClipperString
      || defaults.templates.reading,
    ai: source.templates?.ai || defaults.templates.ai
  };

  const domainMappings = source.domainMappings ? { ...source.domainMappings } : { ...defaults.domainMappings };

  const options: OptionsState = {
    rest,
    templates,
    domainMappings,
    classifier: mergeClassifierOptions(source.classifier),
    deepResearch: mergeDeepResearchOptions(source.deepResearch),
    fragmentClipper: mergeFragmentClipperOptions(source.fragmentClipper),
    readingSession: mergeReadingSessionOptions(source.readingSession),
    aiChat: mergeAiChatOptions(source.aiChat),
    video: mergeVideoOptions(source.video),
    vaultRouter: source.vaultRouter
  };

  return options;
}
