import type {
  StoredOptions,
  OptionsState,
  ClassifierOptions,
  FragmentClipperOptions,
  ReadingSessionOptions,
  DeepResearchOptions,
  AiChatOptions
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

function mergeFragmentClipperOptions(source?: StoredOptions['fragmentClipper']): FragmentClipperOptions | undefined {
  const defaults = DEFAULT_OPTIONS.fragmentClipper;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  return {
    useFootnoteFormat: base.useFootnoteFormat ?? defaults?.useFootnoteFormat ?? true,
    captureContext: base.captureContext ?? defaults?.captureContext ?? false,
    contextLength: base.contextLength ?? defaults?.contextLength ?? 200,
    contextMode: base.contextMode ?? defaults?.contextMode ?? 'chars'
  };
}

function mergeReadingSessionOptions(source?: StoredOptions['readingSession']): ReadingSessionOptions | undefined {
  const defaults = DEFAULT_OPTIONS.readingSession;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  return {
    exportMode: base.exportMode ?? defaults?.exportMode ?? 'highlights'
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

  const templates = {
    article: source.templates?.article || defaults.templates.article,
    fragment: source.templates?.fragment || defaults.templates.fragment,
    clipper: source.templates?.clipper || source.templates?.fragment || defaults.templates.clipper,
    reading: source.templates?.reading
      || source.templates?.fragment
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
    vaultRouter: source.vaultRouter
  };

  return options;
}
