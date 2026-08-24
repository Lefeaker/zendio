import { getOutputTemplatePreset } from '@shared/config';
import { mergeOptions } from '@shared/config/optionsMerger';
import { DEFAULT_DOMAIN_MAPPINGS } from '@shared/constants';
import { DI_TOKENS } from '@shared/di/tokens';
import { resolveRepository } from '@shared/di/serviceRegistry';
import type { IMessagingRepository, IOptionsRepository } from '@shared/repositories';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import {
  ClassifierProviderSchema,
  FragmentContextModeSchema,
  ReadingExportModeSchema
} from '@shared/schemas/options.schema';
import { TaxonomyConfigSchema } from '@shared/schemas/taxonomy.schema';
import type { PreviewStoreState } from '@options/stitch/types';
import {
  type OptionsValidationError,
  resolveClassifierTaxonomyEditorText
} from '@options/services/validation';
import {
  createPresetYamlConfig,
  resolveReadingPathMode,
  toTemplateValues
} from './productionStitchStateMapper';
import { updateVideoDraftPath } from './productionStitchVideoDraftState';
import { UnavailableOptionsRepository } from '../../infrastructure/repositories/UnavailableOptionsRepository';

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
    return new UnavailableOptionsRepository();
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
  const { rest, templates, domainMappings, vaultRouter, yamlConfig, ...remaining } = partial;
  if (rest) {
    draft.rest = { ...draft.rest, ...rest };
  }
  if (templates) {
    draft.templates = { ...draft.templates, ...templates };
  }
  if (domainMappings) {
    draft.domainMappings = { ...domainMappings };
    setDomainMappingRows(Object.entries(draft.domainMappings));
  }
  if (vaultRouter) {
    draft.vaultRouter = vaultRouter;
  }
  if (yamlConfig !== undefined) {
    draft.yamlConfig = yamlConfig;
  }
  Object.assign(draft, remaining);
}
export function applyTemplateStateToDraft(draft: CompleteOptions, state: PreviewStoreState): void {
  draft.templates.article = state.templateValues.articleVideo ?? draft.templates.article;
  draft.templates.video = state.templateValues.video ?? draft.templates.video;
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
  const preset = getOutputTemplatePreset(name);
  if (!preset) {
    return;
  }

  draft.templates = {
    ...draft.templates,
    ...preset.templates
  };
  draft.domainMappings = { ...preset.domainMappings };
  options.setDomainMappingRows(Object.entries(draft.domainMappings));
  draft.yamlConfig = createPresetYamlConfig(preset.name);
  state.templateValues = toTemplateValues(draft);
  state.readingPathMode = resolveReadingPathMode(draft);
  options.refreshAppData();
  options.scheduleDraftSave();
  options.render();
}

export type ClassifierFieldUpdateResult =
  | { success: true }
  | { success: false; error: OptionsValidationError };
export function updateClassifierField(
  draft: CompleteOptions,
  state: PreviewStoreState,
  scheduleDraftSave: () => void,
  field: string,
  value: unknown
): ClassifierFieldUpdateResult {
  switch (field) {
    case 'enabled':
      draft.classifier.enabled = Boolean(value);
      state.classifierEnabled = draft.classifier.enabled;
      break;
    case 'provider':
      {
        const provider = ClassifierProviderSchema.safeParse(String(value ?? 'ollama'));
        draft.classifier.provider = provider.success ? provider.data : 'ollama';
      }
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
    case 'taxonomy': {
      const editorText = String(value ?? '');
      const result = resolveClassifierTaxonomyEditorText(editorText);
      if (!result.success) {
        return result;
      }
      draft.classifier.taxonomy = TaxonomyConfigSchema.parse(result.taxonomy);
      state.classifierTaxonomyText = editorText;
      break;
    }
    default:
      return { success: true };
  }
  scheduleDraftSave();
  return { success: true };
}
export function updateDraftPath(
  draft: CompleteOptions,
  state: PreviewStoreState,
  path: string,
  value: unknown
): void {
  if (updateVideoDraftPath(draft, state, path, value)) {
    return;
  }
  switch (path) {
    case 'aiChat.userName':
      draft.aiChat.userName = String(value ?? '');
      state.aiUserName = draft.aiChat.userName;
      break;
    case 'readingSession.exportMode':
      {
        const exportMode = ReadingExportModeSchema.safeParse(String(value ?? 'highlights'));
        draft.readingSession.exportMode = exportMode.success ? exportMode.data : 'highlights';
      }
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
      {
        const contextMode = FragmentContextModeSchema.safeParse(String(value ?? 'chars'));
        draft.fragmentClipper.contextMode = contextMode.success ? contextMode.data : 'chars';
      }
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
  return mergeOptions(options);
}
