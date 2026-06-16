import { DEFAULT_DOMAIN_MAPPINGS } from '../constants';
import { DEFAULT_CLASSIFIER_TAXONOMY_MIGRATED } from './taxonomyMigration';
import type { CompleteOptions } from '../types';
import { getDefaultFragmentClipper, getDefaultRestOptions, getDefaultTemplates } from './appConfig';

const REST_DEFAULTS = getDefaultRestOptions();
const TEMPLATE_DEFAULTS = getDefaultTemplates();
const FRAGMENT_DEFAULTS = getDefaultFragmentClipper();

export const DEFAULT_OPTIONS: CompleteOptions = {
  interfaceTheme: 'system',
  rest: {
    baseUrl: REST_DEFAULTS.baseUrl,
    httpsUrl: REST_DEFAULTS.httpsUrl,
    httpUrl: REST_DEFAULTS.httpUrl,
    vault: REST_DEFAULTS.vault,
    apiKey: REST_DEFAULTS.apiKey
  },
  templates: {
    article: TEMPLATE_DEFAULTS.article,
    fragment: TEMPLATE_DEFAULTS.fragment,
    reading: TEMPLATE_DEFAULTS.reading,
    ai: TEMPLATE_DEFAULTS.ai
  },
  domainMappings: { ...DEFAULT_DOMAIN_MAPPINGS },
  classifier: {
    enabled: false,
    provider: 'ollama',
    endpoint: 'http://localhost:11434/api/chat',
    model: 'llama3.1',
    apiKey: '',
    taxonomy: DEFAULT_CLASSIFIER_TAXONOMY_MIGRATED
  },
  deepResearch: {
    pureMode: false
  },
  aiChat: {
    includeTimestamps: false,
    userName: 'USER'
  },
  fragmentClipper: {
    useFootnoteFormat: FRAGMENT_DEFAULTS.useFootnoteFormat,
    captureContext: FRAGMENT_DEFAULTS.captureContext,
    contextLength: FRAGMENT_DEFAULTS.contextLength,
    contextMode: FRAGMENT_DEFAULTS.contextMode,
    selectionModifierEnabled: FRAGMENT_DEFAULTS.selectionModifierEnabled,
    selectionModifierKeys: [...FRAGMENT_DEFAULTS.selectionModifierKeys],
    keyboardShortcutsEnabled: FRAGMENT_DEFAULTS.keyboardShortcutsEnabled
  },
  readingSession: {
    exportMode: 'highlights',
    highlightTheme: 'gradient'
  },
  video: {
    floatingPromptEnabled: true,
    promptButtonLabel: 'Clip video',
    promptShortcut: 'Alt+V',
    controlBarAutoPause: true,
    controlBarScreenshot: true,
    commentEditorAutoPause: false,
    screenshotAttachment: {
      locationTemplate: './assets/${noteFileName}',
      fileNameTemplate: "file-${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}.jpg",
      markdownUrlFormat: ''
    }
  },
  experimentalAi: {
    provider: 'compatible',
    model: 'gpt-4.1-mini',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiKey: ''
  },
  pageSummary: {
    enabled: false
  },
  readingOverlaySummary: {
    enabled: false
  },
  subtitleTranslation: {
    enabled: false,
    targetLanguage: 'zh-CN'
  }
};
