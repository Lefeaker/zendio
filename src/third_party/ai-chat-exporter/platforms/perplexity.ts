import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatHtmlToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult } from '../types';

const MESSAGE_SELECTORS = [
  '[data-testid="user-message"]',
  '[data-testid="assistant-message"]',
  '[data-message-author]',
  '[data-role="message"]'
].join(',');

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

function detectRole(node: HTMLElement): 'user' | 'assistant' {
  const author = (
    node.dataset.messageAuthor ??
    node.dataset.role ??
    node.getAttribute('data-testid') ??
    node.className
  ).toLowerCase();

  if (/(user|query|prompt|human)/.test(author)) {
    return 'user';
  }
  return 'assistant';
}

function pickMessageBody(node: HTMLElement): HTMLElement | null {
  const selectors = [
    '[data-testid="message-content"]',
    '[class*="prose"]',
    '[class*="markdown"]',
    'article',
    'main',
    'p'
  ];

  for (const selector of selectors) {
    const match = node.querySelector<HTMLElement>(selector);
    if (match) return match;
  }

  return node;
}

function cleanupBody(fragment: HTMLElement): void {
  fragment
    .querySelectorAll(
      'button, svg, [aria-label*="copy" i], [data-testid*="toolbar"], [class*="toolbar"]'
    )
    .forEach((element) => element.remove());
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
  const nodes = Array.from(doc.querySelectorAll<HTMLElement>(MESSAGE_SELECTORS));
  if (nodes.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const messages: ParsedMessage[] = [];
  let index = 1;

  for (const node of nodes) {
    const body = pickMessageBody(node);
    if (!body) continue;

    const clone = body.cloneNode(true) as HTMLElement;
    cleanupBody(clone);

    const text = clone.textContent?.trim() ?? '';
    if (!text) continue;

    const html = clone.innerHTML || '';
    const markdown = chatHtmlToMarkdown(html || text);
    if (!markdown.trim()) continue;

    messages.push({
      id: `msg-${index++}`,
      role: detectRole(node),
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
