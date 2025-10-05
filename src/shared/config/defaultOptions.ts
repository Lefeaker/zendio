import { DEFAULT_DOMAIN_MAPPINGS, DEFAULT_CLASSIFIER_TAXONOMY } from '../constants';
import type { OptionsState } from '../types';

export const DEFAULT_OPTIONS: OptionsState = {
  rest: {
    baseUrl: 'https://127.0.0.1:27124/',
    httpsUrl: 'https://127.0.0.1:27124/',
    httpUrl: 'http://127.0.0.1:27123/',
    vault: 'YourVault',
    apiKey: ''
  },
  templates: {
    article: 'Articles/{domain}/{yyyy}/{slug}.md',
    fragment: 'Clippings/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
    clipper: 'Clippings/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
    reading: 'Reading/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
    ai: 'AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md'
  },
  domainMappings: { ...DEFAULT_DOMAIN_MAPPINGS },
  classifier: {
    enabled: false,
    provider: 'ollama',
    endpoint: 'http://localhost:11434/api/chat',
    model: 'llama3.1',
    apiKey: '',
    taxonomy: DEFAULT_CLASSIFIER_TAXONOMY
  },
  deepResearch: {
    pureMode: false
  },
  aiChat: {
    includeTimestamps: false,
    userName: 'USER'
  },
  fragmentClipper: {
    useFootnoteFormat: true,
    captureContext: false,
    contextLength: 200,
    contextMode: 'chars'
  },
  readingSession: {
    exportMode: 'highlights'
  }
};
