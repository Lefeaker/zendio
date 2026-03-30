export type PlatformId =
  | 'chatgpt'
  | 'claude'
  | 'copilot'
  | 'gemini'
  | 'tongyi'
  | 'deepseek'
  | 'kimi'
  | 'doubao'
  | 'monica'
  | 'perplexity';

export type ParsedMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  html?: string;
  md?: string;
  text?: string;
  timestamp?: string;
};

export type ChatAsset = {
  url: string;
  filename?: string;
};

export type ParsedResult = {
  title: string;
  messages: ParsedMessage[];
  assets: ChatAsset[];
  model?: string;
  createdAt?: string;
};

export type DeepResearchConfig = {
  pureMode?: boolean;
};

export type ParseConfig = {
  deepResearch?: DeepResearchConfig;
};

export interface ChatPlatformParser {
  id: PlatformId;
  aliases?: string[];
  parse(doc: Document, config?: ParseConfig): ParsedResult;
}
