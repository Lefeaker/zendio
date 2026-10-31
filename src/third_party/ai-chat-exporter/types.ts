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
  | 'perplexity'
  | 'grok';

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

export type ParseDiagnosticSeverity = 'info' | 'warning' | 'error';

export type ParseDiagnostic = {
  code: string;
  severity: ParseDiagnosticSeverity;
  detail?: string;
};

export const PARSER_NOT_FOUND_DIAGNOSTIC_CODE = 'parser_not_found' as const;

export type ParsedResult = {
  title: string;
  messages: ParsedMessage[];
  assets: ChatAsset[];
  model?: string;
  createdAt?: string;
  diagnostics?: ParseDiagnostic[];
};

export type DeepResearchConfig = {
  pureMode?: boolean;
};

export type ParseConfig = {
  deepResearch?: DeepResearchConfig;
  fallbackTitle?: string;
  imageResolver?: (node: HTMLElement) => string;
};

export type AIChatImageCandidate = {
  node: HTMLElement;
  messageRoot?: HTMLElement;
  slotKey: string;
  sourceUrl?: string;
  alt?: string;
};

export interface ChatPlatformParser {
  id: PlatformId;
  aliases?: string[];
  collectImages?(root: ParentNode, config?: ParseConfig): readonly AIChatImageCandidate[];
  parse(doc: Document, config?: ParseConfig): ParsedResult;
}
