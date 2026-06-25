import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatHtmlToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult } from '../types';

const MESSAGE_SELECTORS =
  '[data-testid="user-message"],[data-testid="assistant-message"],[data-message-author],[data-role="message"]';
const CURRENT_USER_SELECTORS =
  '[data-testid*="question" i],[data-testid*="query" i],[aria-label*="question" i],[aria-label*="query" i],[class*="query"]';
const CURRENT_ASSISTANT_SELECTORS =
  '[data-testid*="answer" i],[data-testid*="response" i],[aria-label*="answer" i],[aria-label*="response" i],[class*="answer"],[class*="response"]';
const SUPPRESSED_MESSAGE_CONTAINER_SELECTOR =
  'aside,nav,footer,[role="navigation"],[aria-label*="source" i],[aria-label*="citation" i],[aria-label*="related" i],[class*="source"],[class*="citation"],[class*="sidebar"],[class*="toolbar"],[class*="action"],[data-testid*="toolbar" i]';
const CLEANUP_SELECTORS =
  'button,svg,aside,nav,footer,[role="navigation"],[aria-label*="copy" i],[aria-label*="share" i],[aria-label*="edit" i],[aria-label*="source" i],[aria-label*="citation" i],[aria-label*="related" i],[data-testid*="toolbar" i],[class*="toolbar"],[class*="action"],[class*="source"],[class*="citation"],[class*="sidebar"]';

const MODEL_SELECTORS = [
  '[data-testid="model-name"]',
  '[data-testid="thread-model"]',
  '[class*="model"]',
  'header [class*="chip"]',
  'header span'
];

type MessageCandidate = {
  node: HTMLElement;
  role: 'user' | 'assistant';
};

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
  fragment.querySelectorAll(CLEANUP_SELECTORS).forEach((element) => element.remove());
}

function isSuppressedContainer(node: HTMLElement): boolean {
  return Boolean(
    node.matches(SUPPRESSED_MESSAGE_CONTAINER_SELECTOR) ||
    node.closest(SUPPRESSED_MESSAGE_CONTAINER_SELECTOR)
  );
}

function hasMessageText(node: HTMLElement): boolean {
  const body = pickMessageBody(node);
  if (!body) {
    return false;
  }

  const clone = body.cloneNode(true) as HTMLElement;
  cleanupBody(clone);
  return Boolean(clone.textContent?.trim());
}

function documentOrder(left: MessageCandidate, right: MessageCandidate): number {
  if (left.node === right.node) {
    return 0;
  }

  const relation = left.node.compareDocumentPosition(right.node);
  if (relation & Node.DOCUMENT_POSITION_PRECEDING) {
    return 1;
  }
  if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
    return -1;
  }
  return 0;
}

function uniqueCandidates(candidates: readonly MessageCandidate[]): MessageCandidate[] {
  const byNode = new Map<HTMLElement, MessageCandidate>();

  for (const candidate of candidates) {
    if (isSuppressedContainer(candidate.node) || !hasMessageText(candidate.node)) {
      continue;
    }
    byNode.set(candidate.node, candidate);
  }

  return Array.from(byNode.values()).sort(documentOrder);
}

function collectCurrentCandidates(doc: Document): MessageCandidate[] {
  const candidates: MessageCandidate[] = [];

  for (const node of Array.from(doc.querySelectorAll<HTMLElement>(CURRENT_USER_SELECTORS))) {
    candidates.push({ node, role: 'user' });
  }

  for (const node of Array.from(doc.querySelectorAll<HTMLElement>(CURRENT_ASSISTANT_SELECTORS))) {
    candidates.push({ node, role: 'assistant' });
  }

  return uniqueCandidates(candidates);
}

function collectOrderedSectionCandidates(doc: Document): MessageCandidate[] {
  const conversation = doc.querySelector<HTMLElement>(
    'main [aria-label*="conversation" i], main [role="main"], main'
  );
  if (!conversation) {
    return [];
  }

  const sections = Array.from(conversation.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !isSuppressedContainer(child) && hasMessageText(child)
  );

  if (sections.length < 2 || sections.length % 2 !== 0) {
    return [];
  }

  return sections.map((node, index) => ({
    node,
    role: index % 2 === 0 ? 'user' : 'assistant'
  }));
}

function collectMessageCandidates(doc: Document): MessageCandidate[] {
  const legacyNodes = Array.from(doc.querySelectorAll<HTMLElement>(MESSAGE_SELECTORS));
  if (legacyNodes.length > 0) {
    return legacyNodes.map((node) => ({ node, role: detectRole(node) }));
  }

  const currentCandidates = collectCurrentCandidates(doc);
  if (currentCandidates.length > 0) {
    return currentCandidates;
  }

  return collectOrderedSectionCandidates(doc);
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
  const candidates = collectMessageCandidates(doc);
  if (candidates.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const messages: ParsedMessage[] = [];
  let index = 1;

  for (const { node, role } of candidates) {
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
