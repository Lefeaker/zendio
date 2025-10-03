import type {
  AiChatOptions,
  ClassifierOptions,
  CompleteOptions,
  DeepResearchOptions,
  FragmentClipperOptions,
  RestOptions,
  StoredOptions,
  TemplateOptions
} from '../../shared/types/options';
import { DEFAULT_CLASSIFIER_TAXONOMY, DEFAULT_DOMAIN_MAPPINGS } from '../utils/defaults';
import { getElementById } from '../utils/dom';
import { renderDomainMappings, collectDomainMappings } from './domainMappings';
import { parseClassifierTaxonomy } from '../services/validation';
import { getVaultRouterConfig } from '../state/vaultRouterStore';

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'rest',
  'templates',
  'domainMappings',
  'aiChat',
  'deepResearch',
  'fragmentClipper',
  'classifier',
  'vaultRouter'
]);

export function renderOptionsForm(options: StoredOptions = {}): void {
  applyRestOptions(options.rest);
  applyTemplateOptions(options.templates);
  applyAiChatOptions(options.aiChat);
  applyDeepResearchOptions(options.deepResearch);
  applyFragmentClipperOptions(options.fragmentClipper);
  applyClassifierOptions(options.classifier);

  const mappings = options.domainMappings && Object.keys(options.domainMappings).length > 0
    ? options.domainMappings
    : DEFAULT_DOMAIN_MAPPINGS;
  renderDomainMappings(mappings);
}

export function collectOptionsFromForm(previous: StoredOptions | null): CompleteOptions {
  const rest = collectRestOptions(previous?.rest);
  const templates = collectTemplateOptions(previous?.templates);
  const domainMappings = collectDomainMappings();
  const aiChat = collectAiChatOptions(previous?.aiChat);
  const deepResearch = collectDeepResearchOptions(previous?.deepResearch);
  const fragmentClipper = collectFragmentClipperOptions(previous?.fragmentClipper);
  const classifier = collectClassifierOptions(previous?.classifier);

  const options: CompleteOptions = {
    rest,
    templates,
    domainMappings,
    aiChat,
    deepResearch,
    fragmentClipper,
    classifier
  };

  const vaultRouter = getVaultRouterConfig();
  if (vaultRouter) {
    options.vaultRouter = vaultRouter;
  }

  if (previous) {
    for (const [key, value] of Object.entries(previous)) {
      if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
        (options as Record<string, unknown>)[key] = value;
      }
    }
  }

  return options;
}

export function bindOptionsFormEvents(): void {
  const classifierToggle = getElementById<HTMLInputElement>('clsEnable');
  classifierToggle.addEventListener('change', () => {
    updateClassifierVisibility(classifierToggle.checked);
  });

  const fragmentToggle = getElementById<HTMLInputElement>('fragmentCaptureContext');
  fragmentToggle.addEventListener('change', () => {
    updateFragmentContextVisibility(fragmentToggle.checked);
  });
}

function applyRestOptions(rest?: StoredOptions['rest']): void {
  const restHttpsUrl = getElementById<HTMLInputElement>('restHttpsUrl');
  const restHttpUrl = getElementById<HTMLInputElement>('restHttpUrl');
  const restVault = getElementById<HTMLInputElement>('restVault');
  const restKey = getElementById<HTMLInputElement>('restKey');

  restHttpsUrl.value = rest?.httpsUrl || 'https://127.0.0.1:27124/';
  restHttpUrl.value = rest?.httpUrl || 'http://127.0.0.1:27123/';
  restVault.value = rest?.vault || 'YourVault';
  restKey.value = rest?.apiKey || '';
}

function applyTemplateOptions(templates?: StoredOptions['templates']): void {
  const tplArticle = getElementById<HTMLInputElement>('tplArticle');
  const tplFragment = getElementById<HTMLInputElement>('tplFragment');
  const tplAI = getElementById<HTMLInputElement>('tplAI');

  tplArticle.value = templates?.article || 'Articles/{domain}/{yyyy}/{slug}.md';
  tplFragment.value = templates?.fragment || 'Fragments/{yyyy}/{mm}/{dd}/{title}.md';
  tplAI.value = templates?.ai || 'AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md';
}

function applyAiChatOptions(aiChat?: StoredOptions['aiChat']): void {
  const includeTimestamps = getElementById<HTMLInputElement>('aiIncludeTimestamps');
  const userName = getElementById<HTMLInputElement>('aiUserName');

  includeTimestamps.checked = aiChat?.includeTimestamps ?? false;
  userName.value = aiChat?.userName || 'USER';
}

function applyDeepResearchOptions(deepResearch?: StoredOptions['deepResearch']): void {
  const pureMode = getElementById<HTMLInputElement>('deepResearchPureMode');
  pureMode.checked = deepResearch?.pureMode ?? false;
}

function applyFragmentClipperOptions(fragmentClipper?: StoredOptions['fragmentClipper']): void {
  const useFootnote = getElementById<HTMLInputElement>('fragmentUseFootnote');
  const captureContext = getElementById<HTMLInputElement>('fragmentCaptureContext');
  const contextLength = getElementById<HTMLInputElement>('fragmentContextLength');
  const contextMode = getElementById<HTMLSelectElement>('fragmentContextMode');

  useFootnote.checked = fragmentClipper?.useFootnoteFormat ?? true;
  const capture = fragmentClipper?.captureContext ?? false;
  captureContext.checked = capture;
  contextLength.value = String(fragmentClipper?.contextLength ?? 200);
  contextMode.value = fragmentClipper?.contextMode ?? 'chars';

  updateFragmentContextVisibility(capture);
}

function applyClassifierOptions(classifier?: StoredOptions['classifier']): void {
  const enable = getElementById<HTMLInputElement>('clsEnable');
  const provider = getElementById<HTMLSelectElement>('clsProvider');
  const endpoint = getElementById<HTMLInputElement>('clsEndpoint');
  const model = getElementById<HTMLInputElement>('clsModel');
  const apiKey = getElementById<HTMLInputElement>('clsKey');
  const taxonomy = getElementById<HTMLTextAreaElement>('clsTax');

  const normalized = classifier ?? {};

  enable.checked = !!normalized.enabled;
  provider.value = normalized.provider || 'ollama';
  endpoint.value = normalized.endpoint || 'http://localhost:11434/api/chat';
  model.value = normalized.model || 'llama3.1';
  apiKey.value = normalized.apiKey || '';

  let taxonomyString = JSON.stringify(DEFAULT_CLASSIFIER_TAXONOMY, null, 2);
  try {
    if (normalized.taxonomy) {
      taxonomyString = JSON.stringify(normalized.taxonomy, null, 2);
    }
  } catch {
    taxonomyString = JSON.stringify(DEFAULT_CLASSIFIER_TAXONOMY, null, 2);
  }
  taxonomy.value = taxonomyString;

  updateClassifierVisibility(enable.checked);
}

function collectRestOptions(previous?: StoredOptions['rest']): RestOptions {
  const restHttpsUrl = getElementById<HTMLInputElement>('restHttpsUrl').value.trim();
  const restHttpUrl = getElementById<HTMLInputElement>('restHttpUrl').value.trim();
  const restVault = getElementById<HTMLInputElement>('restVault').value.trim() || 'YourVault';
  const restKey = getElementById<HTMLInputElement>('restKey').value.trim();

  const baseUrl = restHttpsUrl || restHttpUrl || 'https://127.0.0.1:27124/';

  return {
    baseUrl,
    httpsUrl: restHttpsUrl || undefined,
    httpUrl: restHttpUrl || undefined,
    vault: restVault,
    apiKey: restKey,
    rootDir: previous?.rootDir
  };
}

function collectTemplateOptions(_previous?: StoredOptions['templates']): TemplateOptions {
  const article = getElementById<HTMLInputElement>('tplArticle').value.trim() || 'Articles/{domain}/{yyyy}/{slug}.md';
  const fragment = getElementById<HTMLInputElement>('tplFragment').value.trim() || 'Fragments/{yyyy}/{mm}/{dd}/{title}.md';
  const ai = getElementById<HTMLInputElement>('tplAI').value.trim() || 'AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md';

  return {
    article,
    fragment,
    ai
  };
}

function collectAiChatOptions(_previous?: StoredOptions['aiChat']): AiChatOptions {
  const includeTimestamps = getElementById<HTMLInputElement>('aiIncludeTimestamps').checked;
  const userName = getElementById<HTMLInputElement>('aiUserName').value.trim() || 'USER';

  return {
    includeTimestamps,
    userName
  };
}

function collectDeepResearchOptions(_previous?: StoredOptions['deepResearch']): DeepResearchOptions {
  const pureMode = getElementById<HTMLInputElement>('deepResearchPureMode').checked;
  return {
    pureMode
  };
}

function collectFragmentClipperOptions(_previous?: StoredOptions['fragmentClipper']): FragmentClipperOptions {
  const useFootnote = getElementById<HTMLInputElement>('fragmentUseFootnote').checked;
  const captureContext = getElementById<HTMLInputElement>('fragmentCaptureContext').checked;
  const contextLengthValue = parseInt(getElementById<HTMLInputElement>('fragmentContextLength').value, 10);
  const contextModeValue = getElementById<HTMLSelectElement>('fragmentContextMode').value as FragmentClipperOptions['contextMode'];

  return {
    useFootnoteFormat: useFootnote,
    captureContext,
    contextLength: Number.isFinite(contextLengthValue) ? contextLengthValue : 200,
    contextMode: contextModeValue || 'chars'
  };
}

function collectClassifierOptions(_previous?: StoredOptions['classifier']): ClassifierOptions {
  const enable = getElementById<HTMLInputElement>('clsEnable').checked;
  const provider = getElementById<HTMLSelectElement>('clsProvider').value as ClassifierOptions['provider'];
  const endpoint = getElementById<HTMLInputElement>('clsEndpoint').value.trim();
  const model = getElementById<HTMLInputElement>('clsModel').value.trim();
  const apiKey = getElementById<HTMLInputElement>('clsKey').value.trim();
  const taxonomyInput = getElementById<HTMLTextAreaElement>('clsTax').value || '';

  return {
    enabled: enable,
    provider: provider || 'ollama',
    endpoint,
    model,
    apiKey,
    taxonomy: parseClassifierTaxonomy(taxonomyInput)
  };
}

function updateFragmentContextVisibility(enabled: boolean): void {
  const contextLengthGroup = getElementById<HTMLDivElement>('contextLengthGroup');
  const contextModeGroup = getElementById<HTMLDivElement>('contextModeGroup');

  contextLengthGroup.style.display = enabled ? 'block' : 'none';
  contextModeGroup.style.display = enabled ? 'block' : 'none';
}

function updateClassifierVisibility(enabled: boolean): void {
  const config = getElementById<HTMLDivElement>('classifierConfig');
  config.style.display = enabled ? 'block' : 'none';
}
