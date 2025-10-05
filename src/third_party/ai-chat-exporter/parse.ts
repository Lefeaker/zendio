import { EMPTY_RESULT, resolveParser } from './registry';
import { chatHtmlToMarkdown } from './shared/markdown';
import type { ParseConfig, ParsedResult } from './types';

export type { ParsedMessage, ParsedResult, ParseConfig, DeepResearchConfig, ChatAsset } from './types';
export { chatHtmlToMarkdown };

export function parseChatDOM(platform: string, doc: Document, config?: ParseConfig): ParsedResult {
  const parser = resolveParser(platform);
  if (!parser) {
    return EMPTY_RESULT;
  }
  return parser.parse(doc, config);
}
