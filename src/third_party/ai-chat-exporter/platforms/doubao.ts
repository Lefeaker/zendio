import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatHtmlToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParseConfig, ParsedMessage, ParsedResult } from '../types';

const DOUBAO_MESSAGE_SELECTOR =
  '[class*="message-block-container"], [class~="semi-chat-message"], [data-testid="message_user"], [data-testid="message_assistant"]';
// Native tokens from Doubao's own DOM/browser title. These are parser tokens, not extension UI copy.
const DOUBAO_NATIVE_BRAND_TOKENS = ['豆包', 'Doubao'] as const;
const DOUBAO_NATIVE_ASSISTANT_AVATAR_ALT_TOKEN = DOUBAO_NATIVE_BRAND_TOKENS[0];
const DOUBAO_NATIVE_CJK_MODEL_TOKENS = ['旗舰', '极速', '标准', '轻量', '体验'] as const;
const DOUBAO_NATIVE_MODEL_TOKENS = [
  ...DOUBAO_NATIVE_BRAND_TOKENS,
  ...DOUBAO_NATIVE_CJK_MODEL_TOKENS,
  'Pro',
  'Plus',
  'Turbo',
  'AI'
] as const;
const DOUBAO_NEUTRAL_FALLBACK_TITLE = 'Doubao Chat';
const DOUBAO_NEUTRAL_FALLBACK_MODEL = 'Doubao';
const DOUBAO_ASSISTANT_AVATAR_SELECTOR = `img[alt*="${DOUBAO_NATIVE_ASSISTANT_AVATAR_ALT_TOKEN}"]`;
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTokenRegExp(tokens: readonly string[], flags: string): RegExp {
  return new RegExp(tokens.map(escapeRegExp).join('|'), flags);
}

function resolveFallbackTitle(config?: ParseConfig): string {
  return config?.fallbackTitle?.trim() || DOUBAO_NEUTRAL_FALLBACK_TITLE;
}

function normaliseTitle(rawTitle: string, config?: ParseConfig): string {
  const brandSuffixPattern = buildTokenRegExp(DOUBAO_NATIVE_BRAND_TOKENS, 'iu');
  const cleaned = rawTitle
    .replace(new RegExp(`\\s*-\\s*(${brandSuffixPattern.source})\\s*$`, 'iu'), '')
    .trim();
  if (!cleaned) {
    return resolveFallbackTitle(config);
  }

  const normalized = cleaned.toLowerCase();
  if (DOUBAO_NATIVE_BRAND_TOKENS.some((token) => token.toLowerCase() === normalized)) {
    return resolveFallbackTitle(config);
  }

  return cleaned;
}

function determineRole(container: HTMLElement): 'user' | 'assistant' {
  const roleAttr = [
    container.getAttribute('data-role'),
    container.getAttribute('data-testid'),
    container.getAttribute('aria-label'),
    container.className
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

  if (/assistant|message_assistant|bot|doubao/.test(roleAttr)) {
    return 'assistant';
  }
  if (/user|message_user|human/.test(roleAttr)) {
    return 'user';
  }

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
  if (!buildTokenRegExp(DOUBAO_NATIVE_MODEL_TOKENS, 'iu').test(cleaned)) {
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
  return DOUBAO_NEUTRAL_FALLBACK_MODEL;
}

function extractDoubaoChat(doc: Document, config?: ParseConfig): ParsedResult {
  const containers = Array.from(doc.querySelectorAll<HTMLElement>(DOUBAO_MESSAGE_SELECTOR));
  if (containers.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const title = normaliseTitle(doc.title || '', config);
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
    title,
    messages,
    assets: [],
    model
  };
}

export const doubaoParser: ChatPlatformParser = {
  id: 'doubao',
  parse: (doc, config) => extractDoubaoChat(doc, config)
};
