import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatHtmlToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParseConfig, ParsedMessage, ParsedResult } from '../types';

const KIMI_MESSAGE_CONTAINER_SELECTOR =
  '[class*="message"], [class*="Message"], [class*="chat-content-item"]';
const KIMI_USER_MESSAGE_SELECTOR =
  '[class*="user"], [class*="User"], [class*="chat-content-item-user"]';
const KIMI_ASSISTANT_MESSAGE_SELECTOR =
  '[class*="assistant"], [class*="Assistant"], [class*="kimi"], [class*="chat-content-item-assistant"]';
const KIMI_TITLE_REPLACE_TEXT = ' - Kimi';

const KIMI_USER_CONTENT_SELECTORS = [
  '[class*="segment-text"]',
  '[class*="segment-content"]',
  '[class*="content"], [class*="text"]'
];

const KIMI_ASSISTANT_CONTENT_SELECTORS = [
  '[class*="segment-content"]',
  '[class*="segment-markdown"]',
  '[class*="content"], [class*="markdown"], article'
];

const KIMI_REMOVABLE_SECTION_SELECTORS = [
  '[class*="search-plus"]',
  '[class*="product-widget"]',
  '[class*="recommend-prompt"]',
  '[class*="memory-section"]',
  '[class*="create-card"]',
  '[class*="okc-task-bar"]',
  '[class*="okc-continue-button"]',
  '[class*="drop-file-mask"]',
  '[class*="segment-code-header"]',
  '[class*="segment-assistant-actions"]',
  '[class*="share-action"]',
  '[class*="share-btn"]',
  '[class*="share-button"]',
  '[class*="share-icon"]',
  '[data-block-type="feed"]'
];

const KIMI_ACTION_CONTAINER_SELECTOR =
  '[class*="segment-code-header"], [class*="table-actions"], [class*="segment-assistant-actions"], [class*="segment-actions"], header[class*="table"]';

const KIMI_ACTION_TEXTS = new Set(['分享', '复制', '预览', '重试', '编辑']);

const KIMI_BLOCK_HEADER_SELECTOR =
  '[class*="segment-block-header"], header[class*="table"], [class*="table-actions"]';

function queryFirst(element: HTMLElement, selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const match = element.querySelector(selector);
    if (match) return match as HTMLElement;
  }
  return null;
}

function sanitizeKimiContent(element: HTMLElement): HTMLElement {
  const ownerDocument = element.ownerDocument || document;
  const clone = element.cloneNode(true) as HTMLElement;

  for (const selector of KIMI_REMOVABLE_SECTION_SELECTORS) {
    Array.from(clone.querySelectorAll(selector)).forEach((node) => node.remove());
  }

  Array.from(clone.querySelectorAll('span, button, a, div')).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const text = node.textContent?.trim();
    if (!text) return;
    if (
      text.toLowerCase() === 'share' ||
      text.toLowerCase() === 'copy' ||
      KIMI_ACTION_TEXTS.has(text)
    ) {
      const actionContainer = node.closest(KIMI_ACTION_CONTAINER_SELECTOR);
      if (actionContainer) {
        node.remove();
      }
    }
  });

  Array.from(clone.querySelectorAll(KIMI_BLOCK_HEADER_SELECTOR)).forEach((header) => {
    const label = extractHeaderLabel(header)?.trim();

    const table = findNextTable(header);

    if (table && label) {
      table.setAttribute('data-kimi-label', label);
      const fragment = ownerDocument.createDocumentFragment();
      fragment.appendChild(table);
      header.replaceWith(fragment);
      return;
    }

    if (label) {
      const paragraph = ownerDocument.createElement('p');
      paragraph.textContent = label;
      header.replaceWith(paragraph);
    } else {
      header.remove();
    }
  });

  return clone;
}

function findNextTable(header: Element): HTMLElement | null {
  let sibling = header.nextElementSibling;
  while (sibling) {
    if (sibling instanceof HTMLElement) {
      if (sibling.tagName.toLowerCase() === 'table') {
        return sibling;
      }
      const nested = sibling.querySelector('table');
      if (nested) {
        return nested as HTMLElement;
      }
    }
    sibling = sibling.nextElementSibling;
  }

  const parent = header.parentElement;
  if (parent) {
    const withinParent = parent.querySelector('table');
    if (withinParent) {
      return withinParent as HTMLElement;
    }
  }

  return null;
}

function extractHeaderLabel(header: Element): string | undefined {
  const labelSelectors = [
    '[class*="table-name"]',
    '[class*="table-title"]',
    '[class*="tag"]',
    '[class*="label"]'
  ];

  for (const selector of labelSelectors) {
    const candidate = header.querySelector(selector);
    const text = candidate?.textContent?.replace(/分享|复制/gi, '').trim();
    if (text) return text;
  }

  for (const child of Array.from(header.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.replace(/分享|复制/gi, '').trim();
      if (text) return text.split(/\s+/)[0];
    } else if (child instanceof HTMLElement) {
      const text = child.textContent?.replace(/分享|复制/gi, '').trim();
      if (text) return text;
    }
  }

  return undefined;
}

function extractKimiChatData(doc: Document, config?: ParseConfig): ParsedResult {
  const messageContainers = Array.from(doc.querySelectorAll(KIMI_MESSAGE_CONTAINER_SELECTOR));
  if (messageContainers.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  let title = doc.title.replace(KIMI_TITLE_REPLACE_TEXT, '').trim();
  if (!title) {
    const sidebarTitle = doc.querySelector('[class*="conversation-title"], [class*="chat-title"]');
    if (sidebarTitle?.textContent) {
      title = sidebarTitle.textContent.trim();
    }
  }
  if (!title) {
    title = config?.fallbackTitle?.trim() || 'Kimi Chat';
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
      if (text && text.match(/Kimi|Moonshot|MoA/i)) {
        model = text;
        break;
      }
    }
    if (model) break;
  }

  if (!model) {
    const bodyText = doc.body.textContent || '';
    const modelMatch = bodyText.match(/Kimi[\s-]*(1\.5|2\.0|Pro|Plus|Max)|Moonshot\s*(AI)?/i);
    if (modelMatch) {
      model = modelMatch[0];
    }
  }

  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  for (const container of messageContainers) {
    const element = container as HTMLElement;
    let role: 'user' | 'assistant' = 'assistant';
    let contentElem: HTMLElement | null = null;

    if (element.matches(KIMI_USER_MESSAGE_SELECTOR)) {
      role = 'user';
      contentElem = queryFirst(element, KIMI_USER_CONTENT_SELECTORS);
    } else if (element.matches(KIMI_ASSISTANT_MESSAGE_SELECTOR)) {
      role = 'assistant';
      contentElem = queryFirst(element, KIMI_ASSISTANT_CONTENT_SELECTORS);
    }

    if (!contentElem) {
      contentElem = element;
    }

    const sanitizedContent = sanitizeKimiContent(contentElem);
    const html = sanitizedContent.innerHTML;
    const markdown = chatHtmlToMarkdown(html);

    if (markdown.trim()) {
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

  return parsedResult;
}

export const kimiParser: ChatPlatformParser = {
  id: 'kimi',
  parse: (doc, config) => extractKimiChatData(doc, config)
};
