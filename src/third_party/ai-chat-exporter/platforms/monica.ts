import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatHtmlToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParseConfig, ParsedMessage, ParsedResult } from '../types';

const MONICA_MESSAGE_SELECTOR = '[class*="chat-message--"]';
const USER_CLASS_HINT = 'chat-question';
const ASSISTANT_CLASS_HINT = 'chat-reply';
const MONICA_NEUTRAL_FALLBACK_TITLE = 'Monica Chat';
// Native Monica browser-title tokens from the source site. These are parser tokens, not extension UI copy.
const MONICA_NATIVE_TITLE_TOKENS = ['Monica', '莫妮卡'] as const;
const MONICA_NATIVE_TITLE_LOOKUP = new Set(
  MONICA_NATIVE_TITLE_TOKENS.map((token) => token.toLowerCase())
);
const MONICA_MODEL_CANDIDATE_SELECTORS = [
  '[class*="reply-header"] span',
  '[class*="header"] span',
  '[class*="model"]',
  '[data-testid*="model"]',
  'header span'
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMonicaNativeTitlePattern(): string {
  return MONICA_NATIVE_TITLE_TOKENS.map(escapeRegExp).join('|');
}

const MONICA_NATIVE_TITLE_SUFFIX_RE = new RegExp(
  `\\s*-\\s*(${buildMonicaNativeTitlePattern()})\\s*$`,
  'iu'
);

function resolveFallbackTitle(config?: ParseConfig): string {
  return config?.fallbackTitle?.trim() || MONICA_NEUTRAL_FALLBACK_TITLE;
}

function isMonicaNativeTitlePlaceholder(title: string): boolean {
  return MONICA_NATIVE_TITLE_LOOKUP.has(title.toLowerCase());
}

function normaliseTitle(rawTitle: string, config?: ParseConfig): string {
  const cleaned = rawTitle.replace(MONICA_NATIVE_TITLE_SUFFIX_RE, '').trim();
  if (!cleaned || isMonicaNativeTitlePlaceholder(cleaned)) {
    return resolveFallbackTitle(config);
  }
  return cleaned;
}

function determineRole(node: HTMLElement): 'user' | 'assistant' {
  const className = node.className;
  if (className.includes(USER_CLASS_HINT)) {
    return 'user';
  }
  if (className.includes(ASSISTANT_CLASS_HINT)) {
    return 'assistant';
  }
  return 'assistant';
}

function pickContentElement(node: HTMLElement): HTMLElement | null {
  const selectors = [
    '[class*="markdown"]',
    '[data-lexical-editor]',
    '[data-slate-editor]',
    'article',
    'pre',
    'code',
    'p'
  ];

  for (const selector of selectors) {
    const el = node.querySelector<HTMLElement>(selector);
    if (el) return el;
  }

  return node;
}

function cleanupContent(fragment: HTMLElement) {
  fragment
    .querySelectorAll('[class*="toolbar"], [class*="reply-header"], button, svg')
    .forEach((el) => el.remove());
}

function normaliseModelCandidate(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (cleaned.length > 40) return null;
  if (cleaned.split(/\s+/).length > 5) return null;
  if (/[。！？…:：]/.test(cleaned)) return null;
  if (
    !/(GPT|Claude|Gemini|Monica|o[0-9]|LLaMA|Llama|Sonnet|Haiku|Pro|Turbo|Qwen|通义|文心|讯飞|DeepSeek|Copilot|Mistral|Yi|Yuanbao|Qianwen|Spark)/i.test(
      cleaned
    )
  ) {
    return null;
  }
  return cleaned;
}

function extractModel(doc: Document): string {
  for (const selector of MONICA_MODEL_CANDIDATE_SELECTORS) {
    const elements = Array.from(doc.querySelectorAll<HTMLElement>(selector));
    for (const el of elements) {
      if (!el) continue;
      const container = el.closest<HTMLElement>(MONICA_MESSAGE_SELECTOR);
      if (container && !container.className.includes(ASSISTANT_CLASS_HINT)) {
        continue;
      }
      const text = el.textContent?.trim() || '';
      if (!text) continue;
      const candidate = normaliseModelCandidate(text);
      if (candidate) {
        return candidate;
      }
    }
  }

  return 'Monica';
}

function extractMonicaChat(doc: Document, config?: ParseConfig): ParsedResult {
  const nodes = Array.from(doc.querySelectorAll<HTMLElement>(MONICA_MESSAGE_SELECTOR));
  if (nodes.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const title = normaliseTitle(doc.title || '', config);
  const model = extractModel(doc);

  const messages: ParsedMessage[] = [];
  let index = 1;

  for (const node of nodes) {
    const content = pickContentElement(node);
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
      role: determineRole(node),
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
    model: model || 'Monica'
  };
}

export const monicaParser: ChatPlatformParser = {
  id: 'monica',
  parse: (doc, config) => extractMonicaChat(doc, config)
};
