import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatHtmlToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult } from '../types';

const CHATGPT_ARTICLE_SELECTOR = 'article';
const CHATGPT_HEADER_SELECTOR = 'h5';
const CHATGPT_TITLE_REPLACE_TEXT = ' - ChatGPT';
const CHATGPT_MESSAGE_ROOT_SELECTOR = `${CHATGPT_ARTICLE_SELECTOR}, [data-message-author-role]`;
const CHATGPT_CONTENT_SELECTORS = [
  '[data-message-content-part="text"]',
  '.markdown.prose',
  '.markdown',
  '[class*="markdown"]',
  '.whitespace-pre-wrap',
  '[class*="whitespace-pre-wrap"]'
] as const;
const CHATGPT_CHROME_SELECTOR = [
  '[data-testid*="toolbar" i]',
  '[class*="toolbar" i]',
  '[aria-label*="Copy" i]',
  '[aria-label*="Regenerate" i]',
  '[aria-label*="Edit" i]',
  'button',
  '[role="button"]'
].join(', ');
// Native role labels rendered by ChatGPT's own DOM. These are source-site parser tokens.
const CHATGPT_NATIVE_USER_ROLE_LABELS = ['You said', 'You', '您说', '您'] as const;
const CHATGPT_NATIVE_ASSISTANT_ROLE_LABELS = ['ChatGPT said', 'ChatGPT 说'] as const;
const CHATGPT_NATIVE_ROLE_LABELS = [
  ...CHATGPT_NATIVE_USER_ROLE_LABELS,
  ...CHATGPT_NATIVE_ASSISTANT_ROLE_LABELS
] as const;
const CHATGPT_NATIVE_USER_ROLE_LOOKUP = new Set(
  CHATGPT_NATIVE_USER_ROLE_LABELS.map((label) => normalizeHeaderLabel(label))
);

function normalizeHeaderLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[：:]\s*$/u, '')
    .trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripNativeRoleLabels(markdown: string): string {
  const labelPattern = CHATGPT_NATIVE_ROLE_LABELS.map(escapeRegExp).join('|');
  return markdown
    .replace(new RegExp(`^(${labelPattern})[：:]\\s*`, 'gimu'), '')
    .replace(new RegExp(`(${labelPattern})[：:]\\s*`, 'giu'), '')
    .trim();
}

function collectChatGPTMessageRoots(doc: Document): HTMLElement[] {
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(CHATGPT_MESSAGE_ROOT_SELECTOR));
  const roots: HTMLElement[] = [];

  for (const candidate of candidates) {
    if (roots.some((root) => root !== candidate && root.contains(candidate))) {
      continue;
    }

    roots.push(candidate);
  }

  return roots;
}

function pickChatGPTContent(root: HTMLElement): HTMLElement {
  for (const selector of CHATGPT_CONTENT_SELECTORS) {
    const content = root.querySelector<HTMLElement>(selector);
    if (content) {
      return content;
    }
  }

  return root;
}

function removeChatGPTChrome(fragment: HTMLElement): void {
  fragment.querySelectorAll(CHATGPT_CHROME_SELECTOR).forEach((element) => element.remove());
}

function resolveExplicitChatGPTRole(root: HTMLElement): ParsedMessage['role'] | null {
  const explicitRole =
    root.getAttribute('data-message-author-role')?.trim() ||
    root
      .querySelector<HTMLElement>('[data-message-author-role]')
      ?.getAttribute('data-message-author-role') ||
    '';

  if (explicitRole === 'user' || explicitRole === 'assistant') {
    return explicitRole;
  }

  return null;
}

function resolveChatGPTRole(root: HTMLElement, header: string): ParsedMessage['role'] {
  const explicitRole = resolveExplicitChatGPTRole(root);
  if (explicitRole) {
    return explicitRole;
  }

  const normalizedHeader = normalizeHeaderLabel(header);
  const isUser =
    CHATGPT_NATIVE_USER_ROLE_LOOKUP.has(normalizedHeader) || root.classList.contains('user');

  return isUser ? 'user' : 'assistant';
}

function extractChatGPTChatData(doc: Document): ParsedResult {
  const messageRoots = collectChatGPTMessageRoots(doc);
  if (messageRoots.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const title = doc.title.replace(CHATGPT_TITLE_REPLACE_TEXT, '').trim() || DEFAULT_CHAT_TITLE;
  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  let model = '';

  const modelButtons = Array.from(doc.querySelectorAll('button, [role="button"]'));
  for (const btn of modelButtons) {
    const text = btn.textContent?.trim() || '';
    const match = text.match(
      /^(GPT-[0-9.]+[a-z]*|o1(?:-mini|-preview)?|ChatGPT\s*[0-9.]*[a-z]*)$/i
    );
    if (match) {
      model = match[1];
      break;
    }
  }

  if (!model) {
    const selectors = [
      '[class*="model"]',
      '[class*="Model"]',
      '[data-testid*="model"]',
      '.text-token-text-secondary',
      'select option[selected]'
    ];

    for (const selector of selectors) {
      const elements = Array.from(doc.querySelectorAll(selector));
      for (const el of elements) {
        const text = el.textContent?.trim() || '';
        const match = text.match(
          /(GPT-[0-9.]+[a-z]*|o1(?:-mini|-preview)?|ChatGPT\s*[0-9.]*[a-z]*)/i
        );
        if (match) {
          model = match[1];
          break;
        }
      }
      if (model) break;
    }
  }

  if (!model) {
    const bodyText = doc.body.textContent || '';
    const modelMatch = bodyText.match(
      /(?:Model|模型)[:\s]*(GPT-[0-9.]+[a-z]*|o1(?:-mini|-preview)?|ChatGPT\s*[0-9.]*[a-z]*)/i
    );
    if (modelMatch) {
      model = modelMatch[1];
    }
  }

  if (model) {
    model = model.trim();
  }

  for (const messageRoot of messageRoots) {
    const header = messageRoot.querySelector(CHATGPT_HEADER_SELECTOR)?.textContent?.trim() || '';
    const content = pickChatGPTContent(messageRoot);
    const fragment = content.cloneNode(true) as HTMLElement;
    removeChatGPTChrome(fragment);

    const html = fragment.innerHTML;
    let markdown = chatHtmlToMarkdown(html);

    if (!markdown.trim()) continue;

    markdown = stripNativeRoleLabels(markdown);
    if (!markdown.trim()) continue;

    messages.push({
      id: `msg-${chatIndex++}`,
      role: resolveChatGPTRole(messageRoot, header),
      html,
      md: markdown,
      text: markdown
    });
  }

  const parsedResult: ParsedResult = { title, messages, assets: [] };

  const resolvedModel = model || undefined;
  if (resolvedModel) {
    parsedResult.model = resolvedModel;
  }

  return parsedResult;
}

export const chatgptParser: ChatPlatformParser = {
  id: 'chatgpt',
  parse: (doc) => extractChatGPTChatData(doc)
};
