import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { chatElementToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParseConfig, ParsedMessage, ParsedResult } from '../types';

import {
  cloneMessageWithImages,
  collectMessageImages,
  queryMessageElements,
  removePreservingMessageImages
} from '../shared/messageImages';

const KIMI_MESSAGE_CONTAINER_SELECTOR =
  '[class*="message"], [class*="Message"], [class*="chat-content-item"]';
const KIMI_USER_MESSAGE_SELECTOR =
  '.chat-content-item-user, .user-message, .UserMessage, :is(.message, .Message, .chat-content-item):is(.user, .User)';
const KIMI_ASSISTANT_MESSAGE_SELECTOR =
  '.chat-content-item-assistant, .assistant-message, .AssistantMessage, .kimi-assistant, :is(.message, .Message, .chat-content-item):is(.assistant, .Assistant)';
const KIMI_TITLE_REPLACE_TEXT = ' - Kimi';

type KimiMessageRoot = { element: HTMLElement; role: 'user' | 'assistant' };
const KIMI_MESSAGE_ITEM_SELECTOR = '.message, .Message, .chat-content-item';
const KIMI_MESSAGE_LIST_SELECTOR =
  '.message-list, .MessageList, .kimi-message-list, .assistant-message-list, .user-message-list, .chat-content-item-list';
const KIMI_HIDDEN_SELECTOR =
  '[hidden], [aria-hidden="true"], [style*="display: none"], [style*="display:none"]';

function kimiMessageRole(element: HTMLElement): KimiMessageRoot['role'] | undefined {
  if (element.matches(KIMI_USER_MESSAGE_SELECTOR)) return 'user';
  if (element.matches(KIMI_ASSISTANT_MESSAGE_SELECTOR)) return 'assistant';
  return undefined;
}

function collectKimiMessageRoots(root: ParentNode): KimiMessageRoot[] | null {
  const candidates = queryMessageElements(root, KIMI_MESSAGE_CONTAINER_SELECTOR)
    .filter(
      (element) => !element.closest(`${KIMI_HIDDEN_SELECTOR}, ${KIMI_REMOVABLE_SECTION_SELECTOR}`)
    )
    .map((element) => ({
      element,
      role: kimiMessageRole(element),
      identity: ['data-conversation-turn-id', 'data-archer-id', 'data-message-id']
        .map((attribute) => element.getAttribute(attribute)?.trim())
        .find(Boolean)
    }));
  const authorities = candidates.filter((candidate) => candidate.role || candidate.identity);
  // Only explicit role/identity descendants establish independent messages.
  // Unlabelled generic descendants are fragments, regardless of their count.
  const messages = candidates.filter(
    (candidate) =>
      authorities.includes(candidate) ||
      (candidate.element.matches(KIMI_MESSAGE_ITEM_SELECTOR) &&
        !candidate.element.matches(KIMI_MESSAGE_LIST_SELECTOR) &&
        !authorities.some((owner) => candidate.element.contains(owner.element)))
  );
  const roots = messages.filter(
    (candidate) =>
      !messages.some((other) => other !== candidate && other.element.contains(candidate.element))
  );
  const resolved: KimiMessageRoot[] = [];
  for (const { element } of roots) {
    const owned = authorities.filter((candidate) => element.contains(candidate.element));
    const roles = new Set(owned.flatMap(({ role }) => (role ? [role] : [])));
    const identities = new Set(owned.flatMap(({ identity }) => (identity ? [identity] : [])));
    if (roles.size > 1 || identities.size > 1) return null;
    resolved.push({ element, role: roles.values().next().value ?? 'assistant' });
  }
  return resolved;
}

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
  '[class*="segment-user-actions"]',
  '[class*="share-action"]',
  '[class*="share-btn"]',
  '[class*="share-button"]',
  '[class*="share-icon"]',
  '[data-block-type="feed"]'
];
const KIMI_REMOVABLE_SECTION_SELECTOR = KIMI_REMOVABLE_SECTION_SELECTORS.join(',');

const KIMI_ACTION_CONTAINER_SELECTOR =
  '[class*="segment-code-header"], [class*="table-actions"], [class*="segment-assistant-actions"], [class*="segment-actions"], header[class*="table"]';

// Native Kimi action labels rendered by the source site. These are parser tokens.
const KIMI_ACTION_TEXTS = new Set(['分享', '复制', '预览', '重试', '编辑']);
const KIMI_INLINE_ACTION_TEXT_RE = /分享|复制/gi;

const KIMI_BLOCK_HEADER_SELECTOR =
  '[class*="segment-block-header"], header[class*="table"], [class*="table-actions"]';

function sanitizeKimiContent(element: HTMLElement): HTMLElement {
  const ownerDocument = element.ownerDocument || document;
  const clone = element.cloneNode(true) as HTMLElement;

  for (const selector of KIMI_REMOVABLE_SECTION_SELECTORS) {
    Array.from(clone.querySelectorAll(selector)).forEach(removePreservingMessageImages);
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
    const text = candidate?.textContent?.replace(KIMI_INLINE_ACTION_TEXT_RE, '').trim();
    if (text) return text;
  }

  for (const child of Array.from(header.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.replace(KIMI_INLINE_ACTION_TEXT_RE, '').trim();
      if (text) return text.split(/\s+/)[0];
    } else if (child instanceof HTMLElement) {
      const text = child.textContent?.replace(KIMI_INLINE_ACTION_TEXT_RE, '').trim();
      if (text) return text;
    }
  }

  return undefined;
}

function extractKimiChatData(doc: Document, config?: ParseConfig): ParsedResult {
  const messageContainers = collectKimiMessageRoots(doc);
  if (!messageContainers) {
    return {
      title: DEFAULT_CHAT_TITLE,
      messages: [],
      assets: [],
      diagnostics: [{ code: 'kimi_message_ownership_conflict', severity: 'error' }]
    };
  }
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
    const fallbackTitle = config?.fallbackTitle?.trim();
    if (!fallbackTitle) {
      throw new Error('Missing fallback title for kimi export');
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

  for (const { element, role } of messageContainers) {
    const sanitizedContent = sanitizeKimiContent(
      cloneMessageWithImages(element, [element], KIMI_REMOVABLE_SECTION_SELECTOR)
    );
    const markdown = chatElementToMarkdown(sanitizedContent, config?.imageResolver);

    if (markdown.trim()) {
      const html = sanitizedContent.innerHTML;
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
  collectImages: (root) =>
    collectMessageImages(
      'kimi',
      (collectKimiMessageRoots(root) ?? []).map((message) => message.element),
      KIMI_REMOVABLE_SECTION_SELECTOR
    ),
  parse: (doc, config) => extractKimiChatData(doc, config)
};
