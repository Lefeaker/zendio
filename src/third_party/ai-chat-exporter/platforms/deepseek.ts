import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatElementToMarkdown } from '../shared/markdown';
import type {
  ChatPlatformParser,
  ParseConfig,
  ParseDiagnostic,
  ParsedMessage,
  ParsedResult
} from '../types';
import {
  collectChineseFamilyMessageContainers,
  removeChineseFamilyChrome,
  resolveChineseFamilyRoleFromAttributes,
  resolveChineseFamilyRoleFromToken,
  type ChineseFamilyMessageRole
} from './chineseFamily';

const DEEPSEEK_MESSAGE_CONTAINER_SELECTORS = [
  '.ds-message',
  '[data-virtual-list-item-key*="message"]',
  '[data-message-role]',
  '[data-role="user"]',
  '[data-role="assistant"]',
  'article[data-message-author-role]',
  '[class~="message"]',
  '[class*="message-row"]',
  '[class*="MessageRow"]',
  '[class*="chat-message"]',
  '[class*="ChatMessage"]'
];
const DEEPSEEK_USER_MESSAGE_SELECTOR = '[class*="user"], [class*="User"]';
const DEEPSEEK_ASSISTANT_MESSAGE_SELECTOR =
  '[class*="assistant"], [class*="Assistant"], [class*="bot"]';
const DEEPSEEK_TITLE_REPLACE_TEXT = ' - DeepSeek';
const DEEPSEEK_CONTENT_SELECTORS = [
  '[data-message-content]',
  '.ds-assistant-message-main-content',
  '.ds-markdown',
  '[class*="markdown"]',
  '[class*="message-content"]',
  '[class*="content"]',
  '[class*="text"]',
  'article',
  'pre',
  'p'
];
const DEEPSEEK_NO_CONTAINERS_DIAGNOSTIC_CODE = 'deepseek_no_message_containers';
const DEEPSEEK_NO_MESSAGES_DIAGNOSTIC_CODE = 'deepseek_no_messages';

function deepSeekDiagnostic(code: string): ParseDiagnostic {
  return { code, severity: 'warning', detail: 'deepseek' };
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function collectDeepSeekMessageContainers(doc: Document): HTMLElement[] {
  return collectChineseFamilyMessageContainers(doc, DEEPSEEK_MESSAGE_CONTAINER_SELECTORS, {
    shouldSkip: (element) =>
      Boolean(element.closest('[class*="toolbar"], [class*="action"], nav, aside'))
  });
}

function roleFromAttributes(element: HTMLElement): ChineseFamilyMessageRole | undefined {
  return resolveChineseFamilyRoleFromAttributes(element, [
    'data-message-role',
    'data-role',
    'data-virtual-list-item-key',
    'data-testid',
    'aria-label',
    'class'
  ]);
}

function resolveDeepSeekRole(element: HTMLElement, index: number): ChineseFamilyMessageRole {
  const direct = roleFromAttributes(element);
  if (direct) return direct;

  const ancestor = element.closest<HTMLElement>(
    '[data-message-role], [data-role], [class*="user"], [class*="User"], [class*="assistant"], [class*="Assistant"], [class*="bot"]'
  );
  const ancestorRole = ancestor ? roleFromAttributes(ancestor) : undefined;
  if (ancestorRole) return ancestorRole;

  if (element.matches(DEEPSEEK_USER_MESSAGE_SELECTOR)) return 'user';
  if (element.matches(DEEPSEEK_ASSISTANT_MESSAGE_SELECTOR)) return 'assistant';

  const roleDescendant = element.querySelector<HTMLElement>(
    '[data-message-role], [data-role], [aria-label*="user" i], [aria-label*="assistant" i], [class*="user"], [class*="User"], [class*="assistant"], [class*="Assistant"], [class*="bot"]'
  );
  const descendantRole = roleDescendant ? roleFromAttributes(roleDescendant) : undefined;
  if (descendantRole) return descendantRole;

  return (
    resolveChineseFamilyRoleFromToken(element.textContent) ??
    (index % 2 === 0 ? 'user' : 'assistant')
  );
}

function pickDeepSeekContentElement(element: HTMLElement): HTMLElement {
  for (const selector of DEEPSEEK_CONTENT_SELECTORS) {
    const content = element.querySelector<HTMLElement>(selector);
    if (content) return content;
  }

  return element;
}

function cleanupDeepSeekContent(fragment: HTMLElement): void {
  removeChineseFamilyChrome(fragment, [
    '.ds-markdown-cite',
    '[class*="cite"]',
    '[class*="toolbar"]',
    '[class*="action"]',
    'button',
    'svg'
  ]);
}

function extractDeepSeekChatData(doc: Document, config?: ParseConfig): ParsedResult {
  const messageContainers = collectDeepSeekMessageContainers(doc);
  if (messageContainers.length === 0) {
    return {
      title: DEFAULT_CHAT_TITLE,
      messages: [],
      assets: [],
      diagnostics: [deepSeekDiagnostic(DEEPSEEK_NO_CONTAINERS_DIAGNOSTIC_CODE)]
    };
  }

  let title = doc.title.replace(DEEPSEEK_TITLE_REPLACE_TEXT, '').trim();
  if (!title) {
    const sidebarTitle = doc.querySelector('[class*="conversation-title"], [class*="chat-title"]');
    if (sidebarTitle?.textContent) {
      title = sidebarTitle.textContent.trim();
    }
  }
  if (!title) {
    const fallbackTitle = config?.fallbackTitle?.trim();
    if (!fallbackTitle) {
      throw new Error('Missing fallback title for deepseek export');
    }
    title = fallbackTitle;
  }

  let model = '';
  const modelSelectors = [
    '[class*="model"], [class*="Model"]',
    '[data-testid*="model"]',
    'select option[selected]'
  ];
  for (const selector of modelSelectors) {
    const elements = Array.from(doc.querySelectorAll(selector));
    for (const el of elements) {
      const text = el.textContent?.trim();
      if (text && text.match(/DeepSeek|R1|Chat/i)) {
        model = text;
        break;
      }
    }
    if (model) break;
  }

  if (!model) {
    const bodyText = doc.body.textContent || '';
    const modelMatch = bodyText.match(
      /DeepSeek[\s-]*(?:V3|R1|Coder|Chat|General|Math|Reasoning|Vision|Turbo|Pro)\b/i
    );
    if (modelMatch) {
      model = modelMatch[0];
    }
  }

  if (!model) {
    model = 'DeepSeek';
  }

  const messages: ParsedMessage[] = [];
  const seenMarkdown = new Set<string>();
  let chatIndex = 1;

  for (const [index, container] of messageContainers.entries()) {
    const role = resolveDeepSeekRole(container, index);
    const contentElem = pickDeepSeekContentElement(container);

    const fragment = contentElem.cloneNode(true) as HTMLElement;
    cleanupDeepSeekContent(fragment);
    const markdown = chatElementToMarkdown(fragment);
    const normalizedMarkdown = normalizeText(markdown);

    if (normalizedMarkdown && !seenMarkdown.has(normalizedMarkdown)) {
      seenMarkdown.add(normalizedMarkdown);
      const html = fragment.innerHTML;
      messages.push({
        id: `msg-${chatIndex++}`,
        role,
        html,
        md: markdown,
        text: markdown
      });
    }
  }

  const parsedResult: ParsedResult = { title, messages, assets: [] };

  if (model.trim()) {
    parsedResult.model = model.trim();
  }

  if (messages.length === 0) {
    parsedResult.diagnostics = [deepSeekDiagnostic(DEEPSEEK_NO_MESSAGES_DIAGNOSTIC_CODE)];
  }

  return parsedResult;
}

export const deepseekParser: ChatPlatformParser = {
  id: 'deepseek',
  parse: (doc, config) => extractDeepSeekChatData(doc, config)
};
