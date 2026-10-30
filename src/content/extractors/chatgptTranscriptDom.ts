export const CHATGPT_SCROLL_OWNER = '[data-app-action-timeline-scroll]';
const TURN_SELECTOR = '[data-turn-key]';
const HIDDEN = '[hidden], [aria-hidden="true"]';
const BODY_SELECTOR = '[data-user-message-bubble], [data-markdown-text-style="assistant-message"]';

export type ChatGPTTurn = { key: string; element: HTMLElement; signature: string; top: number };
export type ChatGPTViewport = {
  bottomDistance: number;
  anchorKey: string | undefined;
  offset: number;
};

export function findChatGPTScrollOwner(doc: Document): HTMLElement | undefined {
  const owners = Array.from(doc.querySelectorAll<HTMLElement>(CHATGPT_SCROLL_OWNER)).filter(
    (element) => element.clientHeight > 0 && !element.closest(HIDDEN)
  );
  return owners.length === 1 ? owners[0] : undefined;
}

export function chatGPTIsGenerating(owner: HTMLElement): boolean {
  return Array.from(
    owner.querySelectorAll(
      '[data-talvt-turn-state="in_progress"], [data-thread-user-message-navigation-content] [role="status"][aria-busy="true"]'
    )
  ).some((element) => !element.closest(HIDDEN));
}

export function chatGPTHistoryIsLoading(owner: HTMLElement): boolean {
  return Array.from(owner.querySelectorAll<HTMLElement>('[data-loading-indicator]')).some(
    (element) =>
      !element.closest(HIDDEN) &&
      owner.ownerDocument.defaultView?.getComputedStyle(element).display !== 'none'
  );
}

export function readChatGPTTurns(owner: HTMLElement): ChatGPTTurn[] {
  const ownerTop = owner.getBoundingClientRect().top;
  return Array.from(owner.querySelectorAll<HTMLElement>(TURN_SELECTOR))
    .filter((element) => !element.closest(HIDDEN))
    .map((element) => ({
      key: element.getAttribute('data-turn-key') ?? '',
      element,
      signature: Array.from(element.querySelectorAll(BODY_SELECTOR))
        .map((body) => body.textContent ?? '')
        .join('\u0000'),
      top: owner.scrollTop + element.getBoundingClientRect().top - ownerTop
    }));
}

export function moveChatGPTScroll(owner: HTMLElement, position: number): void {
  owner.scrollTop = Math.max(0, position);
  const EventCtor = owner.ownerDocument.defaultView?.Event ?? Event;
  owner.dispatchEvent(new EventCtor('scroll', { bubbles: true }));
}

export function waitForChatGPTPaint(doc: Document): Promise<void> {
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

export async function settleChatGPTWindow(
  owner: HTMLElement,
  stillCurrent: () => boolean
): Promise<ChatGPTTurn[] | null> {
  let previous = '';
  let stableReads = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await waitForChatGPTPaint(owner.ownerDocument);
    if (!stillCurrent()) return null;
    const turns = readChatGPTTurns(owner);
    const signature = JSON.stringify([
      owner.scrollHeight,
      owner.scrollTop,
      turns.map((turn) => [turn.key, turn.signature, turn.element.getBoundingClientRect().height])
    ]);
    stableReads = signature === previous ? stableReads + 1 : 0;
    if (turns.length > 0 && stableReads >= 2) return turns;
    previous = signature;
  }
  return null;
}

export function captureChatGPTViewport(owner: HTMLElement): ChatGPTViewport {
  const ownerTop = owner.getBoundingClientRect().top;
  const anchor = readChatGPTTurns(owner).find(
    (turn) => turn.element.getBoundingClientRect().bottom > ownerTop
  );
  return {
    bottomDistance: Math.max(0, owner.scrollHeight - owner.clientHeight - owner.scrollTop),
    anchorKey: anchor?.key,
    offset: anchor ? anchor.top - owner.scrollTop : 0
  };
}

export async function restoreChatGPTViewport(
  owner: HTMLElement,
  viewport: ChatGPTViewport,
  positions: Map<string, number>,
  stillCurrent: () => boolean
): Promise<boolean> {
  if (!stillCurrent()) return false;
  const maxTop = Math.max(0, owner.scrollHeight - owner.clientHeight);
  const anchorPosition = viewport.anchorKey ? positions.get(viewport.anchorKey) : undefined;
  const position =
    viewport.bottomDistance <= 2
      ? maxTop
      : anchorPosition !== undefined
        ? anchorPosition - viewport.offset
        : maxTop - viewport.bottomDistance;
  moveChatGPTScroll(owner, position);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await waitForChatGPTPaint(owner.ownerDocument);
    if (!stillCurrent()) return false;
    if (viewport.bottomDistance <= 2) {
      const bottom = Math.max(0, owner.scrollHeight - owner.clientHeight);
      if (Math.abs(owner.scrollTop - bottom) <= 2) return true;
      moveChatGPTScroll(owner, bottom);
      continue;
    }
    const anchor = readChatGPTTurns(owner).find((turn) => turn.key === viewport.anchorKey);
    if (!anchor) continue;
    const delta = anchor.top - owner.scrollTop - viewport.offset;
    if (Math.abs(delta) <= 2) return true;
    moveChatGPTScroll(owner, owner.scrollTop + delta);
  }
  return false;
}
