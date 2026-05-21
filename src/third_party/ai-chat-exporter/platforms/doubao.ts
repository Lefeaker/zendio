import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatHtmlToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult } from '../types';

const DOUBAO_MESSAGE_SELECTOR = '[class*="message-block-container"]';
const DOUBAO_ASSISTANT_AVATAR_SELECTOR = 'img[alt*="豆包"]';
const DOUBAO_MARKDOWN_CLASS_HINT = 'flow-markdown-body';
const DOUBAO_HEADER_SELECTORS = [
  '[class*="trigger-wrapper"]',
  '[class*="title-"]',
  '[class*="model"]',
  '[data-testid*="model"]',
  'header span',
  'header button',
  '[class*="header"] button',
  '[class*="header"] span'
];
function normaliseTitle(rawTitle: string): string {
  const cleaned = rawTitle.replace(/\s*-\s*(豆包|Doubao)\s*$/i, '').trim();
  return cleaned || DEFAULT_CHAT_TITLE;
}

function determineRole(container: HTMLElement): 'user' | 'assistant' {
  if (container.querySelector(DOUBAO_ASSISTANT_AVATAR_SELECTOR)) {
    return 'assistant';
  }
  const bubble = container.querySelector<HTMLElement>('[class*="container-"]');
  const className = bubble?.className || '';
  if (className.includes(DOUBAO_MARKDOWN_CLASS_HINT)) {
    return 'assistant';
  }
  return 'user';
}

function pickContentElement(container: HTMLElement): HTMLElement | null {
  const order = [
    '[class*="flow-markdown-body"]',
    '[data-lexical-editor]',
    '[data-slate-editor]',
    '[class*="send-text"]',
    '[class*="markdown"]',
    'article',
    'pre',
    'code'
  ];

  for (const selector of order) {
    const el = container.querySelector<HTMLElement>(selector);
    if (el) return el;
  }

  return container.querySelector<HTMLElement>('[class*="container-"]');
}

function cleanupContent(fragment: HTMLElement) {
  fragment
    .querySelectorAll('[class*="toolbar"], [class*="message-action"], button, svg')
    .forEach((el) => el.remove());
}

function normaliseModelText(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (cleaned.length > 32) return null;
  if (/[。！？…:：]/.test(cleaned)) return null;
  if (!/(豆包|Doubao|旗舰|极速|标准|轻量|体验|Pro|Plus|Turbo|AI)/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function extractModel(doc: Document): string {
  for (const selector of DOUBAO_HEADER_SELECTORS) {
    const elements = Array.from(doc.querySelectorAll<HTMLElement>(selector));
    for (const el of elements) {
      if (!el || el.closest(DOUBAO_MESSAGE_SELECTOR)) {
        continue;
      }
      const candidate = normaliseModelText(el.textContent);
      if (candidate) {
        return candidate;
      }
    }
  }
  return '豆包';
}

function extractDoubaoChat(doc: Document): ParsedResult {
  const containers = Array.from(doc.querySelectorAll<HTMLElement>(DOUBAO_MESSAGE_SELECTOR));
  if (containers.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const title = normaliseTitle(doc.title || '') || '豆包对话';
  const model = extractModel(doc);

  const messages: ParsedMessage[] = [];
  let index = 1;

  for (const container of containers) {
    const content = pickContentElement(container);
    if (!content) continue;

    const textContent = content.textContent?.trim() || '';
    if (!textContent) continue;

    const fragment = content.cloneNode(true) as HTMLElement;
    cleanupContent(fragment);

    const html = fragment.innerHTML || '';
    const markdown = chatHtmlToMarkdown(html || textContent);
    if (!markdown.trim()) continue;

    const message: ParsedMessage = {
      id: `msg-${index++}`,
      role: determineRole(container),
      md: markdown,
      text: markdown
    };

    const resolvedHtml = html || undefined;
    if (resolvedHtml !== undefined) {
      message.html = resolvedHtml;
    }

    messages.push(message);
  }

  return {
    title: title || '豆包对话',
    messages,
    assets: [],
    model: model || '豆包'
  };
}

export const doubaoParser: ChatPlatformParser = {
  id: 'doubao',
  parse: (doc) => extractDoubaoChat(doc)
};
