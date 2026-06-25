import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { cloneHTMLElement } from '../shared/dom';
import { chatElementToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult } from '../types';
import {
  cleanupPerplexityBody,
  collectPerplexityMessageCandidates,
  pickPerplexityMessageBody
} from './assistantFamilyHelpers';

const MODEL_SELECTORS = [
  '[data-testid="model-name"]',
  '[data-testid="thread-model"]',
  '[class*="model"]',
  'header [class*="chip"]',
  'header span'
];

function normaliseTitle(rawTitle: string): string {
  return rawTitle.replace(/\s*[-|]\s*Perplexity.*$/i, '').trim() || DEFAULT_CHAT_TITLE;
}

function extractModel(doc: Document): string | undefined {
  for (const selector of MODEL_SELECTORS) {
    for (const element of Array.from(doc.querySelectorAll<HTMLElement>(selector))) {
      const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (!text || text.length > 40) {
        continue;
      }
      if (/(Sonar|Claude|GPT|Gemini|Llama|Mistral|DeepSeek|Perplexity)/i.test(text)) {
        return text;
      }
    }
  }
  return undefined;
}

function extractPerplexityChat(doc: Document): ParsedResult {
  const candidates = collectPerplexityMessageCandidates(doc);
  if (candidates.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const messages: ParsedMessage[] = [];
  let index = 1;

  for (const { node, role } of candidates) {
    const body = pickPerplexityMessageBody(node);
    if (!body) continue;

    const clone = cloneHTMLElement(body);
    if (!clone) continue;

    cleanupPerplexityBody(clone);

    const text = clone.textContent?.trim() ?? '';
    if (!text) continue;

    const markdown = chatElementToMarkdown(clone);
    if (!markdown.trim()) continue;

    const html = clone.innerHTML || '';
    messages.push({
      id: `msg-${index++}`,
      role,
      ...(html ? { html } : {}),
      md: markdown,
      text: markdown
    });
  }

  const result: ParsedResult = {
    title: normaliseTitle(doc.title || ''),
    messages,
    assets: []
  };

  const model = extractModel(doc);
  if (model) {
    result.model = model;
  }

  return result;
}

export const perplexityParser: ChatPlatformParser = {
  id: 'perplexity',
  parse: (doc) => extractPerplexityChat(doc)
};
