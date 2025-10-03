import type { VaultRouterConfig } from '../../background/vault-router';

export type ClassifierProvider = 'openai' | 'compatible' | 'ollama';

export interface RestOptions {
  baseUrl: string;
  httpsUrl?: string;
  httpUrl?: string;
  vault: string;
  apiKey: string;
  rootDir?: string;
}

export interface TemplateOptions {
  article: string;
  fragment: string;
  ai: string;
}

export interface AiChatOptions {
  includeTimestamps: boolean;
  userName: string;
}

export interface DeepResearchOptions {
  pureMode: boolean;
}

export type FragmentContextMode = 'chars' | 'sentences';

export interface FragmentClipperOptions {
  useFootnoteFormat: boolean;
  captureContext: boolean;
  contextLength: number;
  contextMode: FragmentContextMode;
}

export interface ClassifierOptions {
  enabled: boolean;
  provider: ClassifierProvider;
  endpoint: string;
  apiKey: string;
  model: string;
  taxonomy: unknown;
}

export interface StoredOptions {
  rest?: Partial<RestOptions> & { baseUrl?: string };
  templates?: Partial<TemplateOptions> & { fragment?: string };
  domainMappings?: Record<string, string>;
  aiChat?: Partial<AiChatOptions>;
  deepResearch?: Partial<DeepResearchOptions>;
  fragmentClipper?: Partial<FragmentClipperOptions>;
  classifier?: Partial<ClassifierOptions>;
  vaultRouter?: VaultRouterConfig;
  [key: string]: unknown;
}

export interface CompleteOptions extends StoredOptions {
  rest: RestOptions;
  templates: TemplateOptions;
  aiChat: AiChatOptions;
  deepResearch: DeepResearchOptions;
  fragmentClipper: FragmentClipperOptions;
  classifier: ClassifierOptions;
  domainMappings: Record<string, string>;
}
