import { mergeOptions } from '@shared/config/optionsMerger';
import { DEFAULT_DOMAIN_MAPPINGS } from '@shared/constants';
import { DI_TOKENS } from '@shared/di/tokens';
import { resolveRepository } from '@shared/di/serviceRegistry';
import type { IMessagingRepository, IOptionsRepository } from '@shared/repositories';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { PreviewStoreState } from '@options/stitch/types';
import { parseClassifierTaxonomy } from '@options/services/validation';
import { resolveTaxonomy } from '@shared/config/taxonomyMigration';
import {
  createPresetYamlConfig,
  resolveReadingPathMode,
  toTemplateValues
} from './productionStitchStateMapper';

export function createLocalOptionsRepositoryFallback(): IOptionsRepository {
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

export function createLocalMessagingRepositoryFallback(): IMessagingRepository {
  return {
    send<T>() {
      return Promise.resolve(undefined as T);
    },
    onMessage() {
      return () => {};
    }
  };
}

export function resolveOptionsRepositoryFallback(): IOptionsRepository {
  try {
    return resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  } catch {
    return createLocalOptionsRepositoryFallback();
  }
}

export function resolveMessagingRepositoryFallback(): IMessagingRepository {
  try {
    return resolveRepository<IMessagingRepository>(DI_TOKENS.IMessagingRepository);
  } catch {
    return createLocalMessagingRepositoryFallback();
  }
}

export function resolveRoot(root?: HTMLElement | null): HTMLElement {
  const target = root ?? document.getElementById('optionsShellRoot');
  if (!target) {
    throw new Error('[Options] Missing #optionsShellRoot for Stitch shell.');
  }
  return target;
}

export function resolveDefaultDomainMappingRows(draft: CompleteOptions): Array<[string, string]> {
  const entries = Object.entries(draft.domainMappings);
  if (entries.length) {
    return entries;
  }
  draft.domainMappings = { ...DEFAULT_DOMAIN_MAPPINGS };
  return Object.entries(draft.domainMappings);
}

export function mergePartialIntoDraft(
  draft: CompleteOptions,
  setDomainMappingRows: (entries: Array<[string, string]>) => void,
  partial: Partial<CompleteOptions>
): void {
  if (partial.rest) {
    draft.rest = { ...draft.rest, ...partial.rest };
  }
  if (partial.templates) {
    draft.templates = { ...draft.templates, ...partial.templates };
  }
  if (partial.domainMappings) {
    draft.domainMappings = { ...partial.domainMappings };
    setDomainMappingRows(Object.entries(draft.domainMappings));
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

export function applyTemplateStateToDraft(draft: CompleteOptions, state: PreviewStoreState): void {
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

export function applyOutputPresetToDraft(options: {
  draft: CompleteOptions;
  state: PreviewStoreState;
  setDomainMappingRows(entries: Array<[string, string]>): void;
  refreshAppData(): void;
  scheduleDraftSave(): void;
  render(): void;
  name: string;
}): void {
  const { draft, state, name } = options;
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
      options.setDomainMappingRows([]);
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
      options.setDomainMappingRows(Object.entries(draft.domainMappings));
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
      options.setDomainMappingRows(Object.entries(draft.domainMappings));
      draft.yamlConfig = createPresetYamlConfig('Conversation');
      break;
    default:
      return;
  }
  state.templateValues = toTemplateValues(draft);
  state.readingPathMode = resolveReadingPathMode(draft);
  options.refreshAppData();
  options.scheduleDraftSave();
  options.render();
}

export function updateClassifierField(
  draft: CompleteOptions,
  state: PreviewStoreState,
  scheduleDraftSave: () => void,
  field: string,
  value: unknown
): void {
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

export function updateDraftPath(
  draft: CompleteOptions,
  state: PreviewStoreState,
  path: string,
  value: unknown
): void {
  switch (path) {
    case 'aiChat.userName':
      draft.aiChat.userName = String(value ?? '');
      state.aiUserName = draft.aiChat.userName;
      break;
    case 'video.floatingPromptEnabled':
      draft.video.floatingPromptEnabled = Boolean(value);
      state.videoFloatingPromptEnabled = draft.video.floatingPromptEnabled;
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

export function createInitialDraft(
  options?: StoredOptions | CompleteOptions | null
): CompleteOptions {
  return mergeOptions(options) as CompleteOptions;
}
