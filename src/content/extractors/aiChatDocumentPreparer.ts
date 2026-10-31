import type { PlatformId } from '../../third_party/ai-chat-exporter/types';
import { prepareGrokDocumentForExtraction } from './grokDocumentPreparer';
import { prepareChatGPTDocumentForExtraction } from './chatgptDocumentPreparer';
import type { AIChatImagePreparation } from './aiChatImagePreparation';
import { imageContentSignature } from '../../third_party/ai-chat-exporter/shared/messageImages';
import { aiChatSnapshotSignature } from './aiChatSnapshotSignature';
import { extractionErrors } from '../../shared/errors/extractionErrors';

type AIChatDocumentPreparer = (doc: Document, images?: AIChatImagePreparation) => Promise<Document>;

const DEEPSEEK_PRINTABLE_VIRTUAL_LIST_SELECTOR = '.ds-virtual-list--printable';
const DEEPSEEK_MESSAGE_SELECTOR = '.ds-message';
const DEEPSEEK_ASSISTANT_CONTENT_SELECTOR = '.ds-assistant-message-main-content';
const DEEPSEEK_SCROLL_SETTLE_ATTEMPTS = 6;
const DEEPSEEK_MIN_SCROLL_STEP_PX = 480;

type CollectedMessage = {
  element: HTMLElement;
  key: string;
  stableId: string;
  signature: string;
};

function normalizeMessageText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function waitForFrame(doc: Document): Promise<void> {
  return new Promise((resolve) => {
    const win = doc.defaultView;
    let frame: number | undefined;
    const finish = () => {
      clearTimeout(timer);
      if (frame !== undefined) win?.cancelAnimationFrame(frame);
      resolve();
    };
    const timer = setTimeout(finish, 100);
    if (win?.requestAnimationFrame) {
      frame = win.requestAnimationFrame(() => {
        frame = win.requestAnimationFrame(finish);
      });
    }
  });
}

function getMountedMessageSignature(container: HTMLElement): string {
  return Array.from(container.querySelectorAll<HTMLElement>(DEEPSEEK_MESSAGE_SELECTOR))
    .map((element) => aiChatSnapshotSignature(element, 'deepseek'))
    .filter(Boolean)
    .join('\n---\n');
}

async function waitForDeepSeekVirtualListToSettle(container: HTMLElement): Promise<void> {
  let previousSignature = '';
  let stableReads = 0;

  for (let attempt = 0; attempt < DEEPSEEK_SCROLL_SETTLE_ATTEMPTS; attempt += 1) {
    await waitForFrame(container.ownerDocument);
    const currentSignature = getMountedMessageSignature(container);
    if (currentSignature === previousSignature) {
      stableReads += 1;
      if (stableReads >= 1) return;
    } else {
      stableReads = 0;
      previousSignature = currentSignature;
    }
  }
}

function setScrollTop(container: HTMLElement, scrollTop: number): void {
  const EventCtor = container.ownerDocument.defaultView?.Event ?? Event;
  container.scrollTop = scrollTop;
  container.dispatchEvent(new EventCtor('scroll', { bubbles: true }));
}

function findDeepSeekVirtualMessageScroller(doc: Document): HTMLElement | null {
  const candidates = Array.from(
    doc.querySelectorAll<HTMLElement>(DEEPSEEK_PRINTABLE_VIRTUAL_LIST_SELECTOR)
  );

  return (
    candidates.find((candidate) => {
      const hasMessages = Boolean(candidate.querySelector(DEEPSEEK_MESSAGE_SELECTOR));
      const hasScrollableRange = candidate.scrollHeight > Math.max(candidate.clientHeight, 0);
      return hasMessages && hasScrollableRange;
    }) ?? null
  );
}

function getDeepSeekMessageRoleKey(element: HTMLElement): 'assistant' | 'user' {
  return element.querySelector(DEEPSEEK_ASSISTANT_CONTENT_SELECTOR) ? 'assistant' : 'user';
}

function getDeepSeekStableId(element: HTMLElement): string {
  return (
    element.getAttribute('data-message-id') ||
    element.id ||
    element.closest('[data-virtual-list-item-key]')?.getAttribute('data-virtual-list-item-key') ||
    ''
  );
}

function getDeepSeekMessageKey(element: HTMLElement, container: HTMLElement): string {
  const id = getDeepSeekStableId(element);
  if (id) return `${getDeepSeekMessageRoleKey(element)}\u0000${id}`;
  const offset =
    container.clientHeight > 0
      ? Math.round(
          container.scrollTop +
            element.getBoundingClientRect().top -
            container.getBoundingClientRect().top
        )
      : '';
  return `${id || offset}\u0000${getDeepSeekMessageRoleKey(element)}\u0000${normalizeMessageText(element.textContent)}\u0000${imageContentSignature(element)}`;
}

function cloneDeepSeekMessageElement(message: HTMLElement): HTMLElement {
  const clone = message.ownerDocument.createElement(message.tagName.toLowerCase());
  for (const attribute of Array.from(message.attributes)) {
    clone.setAttribute(attribute.name, attribute.value);
  }
  for (const child of Array.from(message.childNodes)) {
    clone.appendChild(child.cloneNode(true));
  }
  return clone;
}

function collectMountedDeepSeekMessages(container: HTMLElement): CollectedMessage[] {
  const messages: CollectedMessage[] = [];
  for (const message of Array.from(
    container.querySelectorAll<HTMLElement>(DEEPSEEK_MESSAGE_SELECTOR)
  )) {
    const text = normalizeMessageText(message.textContent);
    if (!text && !message.querySelector('img, image-query, uploaded-image')) continue;

    messages.push({
      element: message,
      key: getDeepSeekMessageKey(message, container),
      stableId: getDeepSeekStableId(message),
      signature: aiChatSnapshotSignature(message, 'deepseek')
    });
  }
  return messages;
}

function messageWindowAlreadyCollected(
  collectedMessages: CollectedMessage[],
  windowMessages: CollectedMessage[]
): boolean {
  if (windowMessages.length === 0) return true;
  if (windowMessages.length > collectedMessages.length) return false;

  for (let start = 0; start <= collectedMessages.length - windowMessages.length; start += 1) {
    if (
      windowMessages.every(
        (message, offset) => message.key === collectedMessages[start + offset]?.key
      )
    ) {
      return true;
    }
  }

  return false;
}

function getDeepSeekWindowOverlapLength(
  collectedMessages: CollectedMessage[],
  windowMessages: CollectedMessage[]
): number {
  const maxOverlap = Math.min(collectedMessages.length, windowMessages.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    const collectedOffset = collectedMessages.length - size;
    const hasOverlap = windowMessages
      .slice(0, size)
      .every((message, offset) => message.key === collectedMessages[collectedOffset + offset]?.key);
    if (hasOverlap) return size;
  }

  return 0;
}

function mergeDeepSeekMessageWindow(
  collectedMessages: CollectedMessage[],
  windowMessages: CollectedMessage[],
  images?: AIChatImagePreparation
): void {
  if (windowMessages.length === 0) return;
  for (const message of windowMessages) {
    const previous = message.stableId && collectedMessages.find((item) => item.key === message.key);
    if (previous && previous.signature !== message.signature)
      throw extractionErrors.aiChatPreparationIncomplete({
        type: 'ai_chat',
        platform: 'deepseek',
        messageCount: collectedMessages.length,
        parserDiagnosticCodes: ['deepseek_message_changed']
      });
  }
  const append = (messages: CollectedMessage[]) => {
    for (const message of messages) {
      collectedMessages.push({
        ...message,
        element:
          images?.clone(message.element, `deepseek-${collectedMessages.length}`) ??
          cloneDeepSeekMessageElement(message.element)
      });
    }
  };
  if (collectedMessages.length === 0) {
    append(windowMessages);
    return;
  }

  const overlapLength = getDeepSeekWindowOverlapLength(collectedMessages, windowMessages);
  if (overlapLength > 0) {
    append(windowMessages.slice(overlapLength));
    return;
  }

  if (!messageWindowAlreadyCollected(collectedMessages, windowMessages)) {
    append(windowMessages);
  }
}

function getDeepSeekScrollPositions(container: HTMLElement): number[] {
  const clientHeight = Math.max(container.clientHeight, 1);
  const maxScrollTop = Math.max(container.scrollHeight - clientHeight, 0);
  const scrollStep = Math.max(Math.floor(clientHeight * 0.8), DEEPSEEK_MIN_SCROLL_STEP_PX);
  const positions: number[] = [];

  for (let position = 0; position < maxScrollTop; position += scrollStep) {
    positions.push(position);
  }
  positions.push(maxScrollTop);

  return [...new Set(positions)];
}

function createHydratedDeepSeekDocument(
  sourceDoc: Document,
  messages: CollectedMessage[]
): Document {
  const hydratedDoc = sourceDoc.implementation.createHTMLDocument(sourceDoc.title);
  hydratedDoc.documentElement.lang = sourceDoc.documentElement.lang;

  const main = hydratedDoc.createElement('main');
  const list = hydratedDoc.createElement('div');
  list.className = 'ds-virtual-list-visible-items';

  for (const message of messages) {
    list.appendChild(hydratedDoc.importNode(message.element, true));
  }

  main.appendChild(list);
  hydratedDoc.body.appendChild(main);

  return hydratedDoc;
}

async function prepareDeepSeekDocumentForExtraction(
  doc: Document,
  images?: AIChatImagePreparation
): Promise<Document> {
  const scroller = findDeepSeekVirtualMessageScroller(doc);
  if (!scroller) return doc;

  const originalMessageCount = scroller.querySelectorAll(DEEPSEEK_MESSAGE_SELECTOR).length;
  const originalScrollTop = scroller.scrollTop;
  const messages: CollectedMessage[] = [];
  const sourceUrl = doc.URL;
  const stillCurrent = () =>
    doc.URL === sourceUrl &&
    scroller.isConnected &&
    findDeepSeekVirtualMessageScroller(doc) === scroller;
  const assertCurrent = () => {
    if (!stillCurrent())
      throw extractionErrors.aiChatPreparationIncomplete({
        type: 'ai_chat',
        platform: 'deepseek',
        messageCount: messages.length,
        parserDiagnosticCodes: ['deepseek_conversation_changed']
      });
    images?.assertCurrent();
  };

  try {
    for (const position of getDeepSeekScrollPositions(scroller)) {
      assertCurrent();
      setScrollTop(scroller, position);
      await waitForDeepSeekVirtualListToSettle(scroller);
      assertCurrent();
      mergeDeepSeekMessageWindow(messages, collectMountedDeepSeekMessages(scroller), images);
      await images?.flush();
      assertCurrent();
    }
  } finally {
    if (stillCurrent()) {
      setScrollTop(scroller, originalScrollTop);
      await waitForDeepSeekVirtualListToSettle(scroller);
      assertCurrent();
    }
  }

  if (!images && messages.length <= originalMessageCount) {
    return doc;
  }

  return createHydratedDeepSeekDocument(doc, messages);
}

export const AI_CHAT_DOCUMENT_PREPARERS: Partial<Record<PlatformId, AIChatDocumentPreparer>> = {
  deepseek: prepareDeepSeekDocumentForExtraction,
  chatgpt: prepareChatGPTDocumentForExtraction,
  grok: prepareGrokDocumentForExtraction
};

export async function prepareAIChatDocumentForExtraction(
  platform: PlatformId,
  doc: Document,
  images?: AIChatImagePreparation
): Promise<Document> {
  return AI_CHAT_DOCUMENT_PREPARERS[platform]?.(doc, images) ?? doc;
}
