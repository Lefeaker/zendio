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

export type FragmentModifierKey = 'alt' | 'meta' | 'ctrl' | 'shift';

export type ReadingExportMode = 'highlights' | 'full';

export type ReaderHighlightTheme = 'gradient' | 'purple' | 'neonYellow' | 'neonGreen' | 'neonOrange';

export interface ReadingSessionOptions {
  exportMode: ReadingExportMode;
  highlightTheme: ReaderHighlightTheme;
}

export interface VideoOptions {
  floatingPromptEnabled: boolean;
}

export interface FragmentClipperOptions {
  useFootnoteFormat: boolean;
  captureContext: boolean;
  contextLength: number;
  contextMode: FragmentContextMode;
  selectionModifierEnabled: boolean;
  selectionModifierKeys: FragmentModifierKey[];
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
  video?: Partial<VideoOptions>;
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
  video: VideoOptions;
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
  video?: VideoOptions;
  classifier?: ClassifierOptions;
  vaultRouter?: VaultRouterConfig;
}
