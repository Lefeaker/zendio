import type { VaultRouterConfig } from './vault';

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
  clipper: string;
  reading: string;
  ai: string;
}

export interface AiChatOptions {
  includeTimestamps: boolean;
  userName: string;
}

export interface DeepResearchOptions {
  pureMode: boolean;
}

export type FragmentContextMode = 'chars';

export type ReadingExportMode = 'highlights' | 'full';

export interface ReadingSessionOptions {
  exportMode: ReadingExportMode;
}

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
  templates?: Partial<TemplateOptions> & { fragment?: string; reading?: string };
  domainMappings?: Record<string, string>;
  aiChat?: Partial<AiChatOptions>;
  deepResearch?: Partial<DeepResearchOptions>;
  fragmentClipper?: Partial<FragmentClipperOptions>;
  readingSession?: Partial<ReadingSessionOptions>;
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
  readingSession: ReadingSessionOptions;
  classifier: ClassifierOptions;
  domainMappings: Record<string, string>;
}

export interface OptionsState {
  rest: RestOptions;
  templates: TemplateOptions;
  domainMappings: Record<string, string>;
  aiChat?: AiChatOptions;
  deepResearch?: DeepResearchOptions;
  fragmentClipper?: FragmentClipperOptions;
  readingSession?: ReadingSessionOptions;
  classifier?: ClassifierOptions;
  vaultRouter?: VaultRouterConfig;
}
