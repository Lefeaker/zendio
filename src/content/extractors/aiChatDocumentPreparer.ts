import type { PlatformId } from '../../third_party/ai-chat-exporter/types';

const DEEPSEEK_PRINTABLE_VIRTUAL_LIST_SELECTOR = '.ds-virtual-list--printable';
const DEEPSEEK_MESSAGE_SELECTOR = '.ds-message';
const DEEPSEEK_ASSISTANT_CONTENT_SELECTOR = '.ds-assistant-message-main-content';
const DEEPSEEK_SCROLL_SETTLE_ATTEMPTS = 6;
const DEEPSEEK_MIN_SCROLL_STEP_PX = 480;

type CollectedMessage = {
  element: HTMLElement;
  key: string;
};

function normalizeMessageText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function waitForFrame(doc: Document): Promise<void> {
  const win = doc.defaultView;
  if (win?.requestAnimationFrame) {
    return new Promise((resolve) => {
      win.requestAnimationFrame(() => {
        win.requestAnimationFrame(() => resolve());
      });
    });
  }

  return new Promise((resolve) => {
    if (win?.setTimeout) {
      win.setTimeout(resolve, 0);
      return;
    }

    globalThis.setTimeout(resolve, 0);
  });
}

function getMountedMessageSignature(container: HTMLElement): string {
  return Array.from(container.querySelectorAll<HTMLElement>(DEEPSEEK_MESSAGE_SELECTOR))
    .map((element) => normalizeMessageText(element.textContent))
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

function getDeepSeekMessageKey(element: HTMLElement): string {
  return `${getDeepSeekMessageRoleKey(element)}\u0000${normalizeMessageText(element.textContent)}`;
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
    if (!text) continue;

    messages.push({
      element: cloneDeepSeekMessageElement(message),
      key: getDeepSeekMessageKey(message)
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
  windowMessages: CollectedMessage[]
): void {
  if (windowMessages.length === 0) return;
  if (collectedMessages.length === 0) {
    collectedMessages.push(...windowMessages);
    return;
  }

  const overlapLength = getDeepSeekWindowOverlapLength(collectedMessages, windowMessages);
  if (overlapLength > 0) {
    collectedMessages.push(...windowMessages.slice(overlapLength));
    return;
  }

  if (!messageWindowAlreadyCollected(collectedMessages, windowMessages)) {
    collectedMessages.push(...windowMessages);
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

async function prepareDeepSeekDocumentForExtraction(doc: Document): Promise<Document> {
  const scroller = findDeepSeekVirtualMessageScroller(doc);
  if (!scroller) return doc;

  const originalMessageCount = scroller.querySelectorAll(DEEPSEEK_MESSAGE_SELECTOR).length;
  const originalScrollTop = scroller.scrollTop;
  const messages: CollectedMessage[] = [];

  try {
    for (const position of getDeepSeekScrollPositions(scroller)) {
      setScrollTop(scroller, position);
      await waitForDeepSeekVirtualListToSettle(scroller);
      mergeDeepSeekMessageWindow(messages, collectMountedDeepSeekMessages(scroller));
    }
  } finally {
    setScrollTop(scroller, originalScrollTop);
    await waitForDeepSeekVirtualListToSettle(scroller);
  }

  if (messages.length <= originalMessageCount) {
    return doc;
  }

  return createHydratedDeepSeekDocument(doc, messages);
}

export async function prepareAIChatDocumentForExtraction(
  platform: PlatformId,
  doc: Document
): Promise<Document> {
  if (platform === 'deepseek') {
    return prepareDeepSeekDocumentForExtraction(doc);
  }

  return doc;
}
