import { extractionErrors } from '../../shared/errors/extractionErrors';
import type { AIChatImagePreparation } from './aiChatImagePreparation';
import { aiChatSnapshotSignature } from './aiChatSnapshotSignature';

const TRANSCRIPT_SELECTOR = '[data-transcript-renderer="plane"]';
const MESSAGE_SELECTOR =
  '[role="article"][data-testid="user-message"], [role="article"][data-testid="assistant-message"]';
const STRUCTURAL_ROW_KEYS = new Set([
  'transcript:top-inset',
  'transcript:bottom-spacing',
  'transcript:submit-spacer'
]);
const MAX_WINDOWS = 200;
const MAX_DURATION_MS = 12_000;
type ConversationOwner = {
  url: string;
  title: string;
  scope: Element | null;
  scroller: HTMLElement | null;
};
const inFlightPreparations = new WeakMap<
  Document,
  {
    owner: ConversationOwner;
    images: AIChatImagePreparation | undefined;
    promise: Promise<Document>;
  }
>();

type CollectedTurn = { key: string; element: HTMLElement };

function captureOwner(doc: Document): ConversationOwner {
  const scope = doc.querySelector('#grok-content-area, #grok-page-content');
  return {
    url: doc.URL,
    title: doc.title,
    scope,
    scroller: scope?.querySelector<HTMLElement>(TRANSCRIPT_SELECTOR) ?? null
  };
}

function isCurrentOwner(doc: Document, owner: ConversationOwner): boolean {
  const current = captureOwner(doc);
  return (
    current.url === owner.url &&
    current.title === owner.title &&
    current.scope === owner.scope &&
    current.scroller === owner.scroller
  );
}

function failPreparation(doc: Document, messageCount: number, diagnostic: string): never {
  throw extractionErrors.aiChatPreparationIncomplete({
    type: 'ai_chat',
    platform: 'grok',
    messageCount,
    url: doc.URL,
    parserDiagnosticCodes: [diagnostic]
  });
}

function waitForPaint(doc: Document): Promise<void> {
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

function signature(scroller: HTMLElement, images?: AIChatImagePreparation): string {
  const rows = Array.from(scroller.querySelectorAll('[data-plane-row]'))
    .map(
      (row) =>
        `${row.getAttribute('data-plane-row')}:${Array.from(
          row.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR),
          (message) => images?.contentSignature(message) ?? aiChatSnapshotSignature(message, 'grok')
        ).join('|')}`
    )
    .join('|');
  return rows ? `${scroller.scrollHeight}:${rows}` : '';
}

async function waitForWindow(
  scroller: HTMLElement,
  images?: AIChatImagePreparation
): Promise<boolean> {
  let previous = '';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitForPaint(scroller.ownerDocument);
    const current = signature(scroller, images);
    if (current && current === previous) return true;
    previous = current;
  }
  return false;
}

function setScrollTop(scroller: HTMLElement, position: number): void {
  scroller.scrollTop = position;
  const EventCtor = scroller.ownerDocument.defaultView?.Event ?? Event;
  scroller.dispatchEvent(new EventCtor('scroll', { bubbles: true }));
}

function collectWindow(scroller: HTMLElement, messageCount: number): CollectedTurn[] {
  const turns: CollectedTurn[] = [];
  for (const row of Array.from(scroller.querySelectorAll<HTMLElement>('[data-plane-row]'))) {
    const key = row.getAttribute('data-plane-row');
    const elements = row.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR);
    if (key && STRUCTURAL_ROW_KEYS.has(key) && elements.length === 0) continue;
    const element = elements[0];
    if (elements.length !== 1 || !element || !key || !/^(?:response|gateway):\S+$/.test(key)) {
      failPreparation(scroller.ownerDocument, messageCount, 'grok_transcript_message_unresolved');
    }
    turns.push({ key, element });
  }
  return turns;
}

function mergeWindow(
  doc: Document,
  collected: Map<string, HTMLElement>,
  turns: CollectedTurn[],
  signatures: Map<string, string>,
  images?: AIChatImagePreparation
): void {
  if (collected.size > 0) {
    const keys = Array.from(collected.keys());
    const start = keys.indexOf(turns[0]?.key ?? '');
    if (
      start < 0 ||
      turns.some((turn, offset) => {
        const expected = keys[start + offset];
        return expected !== undefined && turn.key !== expected;
      })
    ) {
      failPreparation(doc, collected.size, 'grok_transcript_window_gap');
    }
  }
  for (const turn of turns) {
    const previous = collected.get(turn.key);
    const contentSignature =
      images?.contentSignature(turn.element) ?? aiChatSnapshotSignature(turn.element, 'grok');
    if (previous && signatures.get(turn.key) !== contentSignature)
      failPreparation(doc, collected.size, 'grok_transcript_content_changed');
    if (!previous)
      collected.set(
        turn.key,
        images?.clone(turn.element, turn.key) ?? doc.importNode(turn.element, true)
      );
    signatures.set(turn.key, contentSignature);
  }
}

function createPreparedDocument(
  doc: Document,
  collected: Map<string, HTMLElement>,
  title: string
): Document {
  const prepared = doc.implementation.createHTMLDocument(title);
  prepared.documentElement.lang = doc.documentElement.lang;
  const root = prepared.createElement('main');
  root.id = 'grok-content-area';
  for (const turn of collected.values()) root.appendChild(prepared.importNode(turn, true));
  prepared.body.appendChild(root);
  return prepared;
}

async function collectGrokDocument(
  doc: Document,
  owner: ConversationOwner,
  images?: AIChatImagePreparation
): Promise<Document> {
  const { scope, scroller } = owner;
  if (scope?.querySelector('.grok-bot[data-state="working"]')) {
    failPreparation(doc, 0, 'grok_response_in_progress');
  }
  if (!scroller) return doc;
  if (scroller.getAttribute('aria-busy') === 'true') {
    failPreparation(doc, 0, 'grok_transcript_loading');
  }
  if (scroller.clientHeight <= 0) {
    failPreparation(doc, 0, 'grok_transcript_viewport_unavailable');
  }
  if (scroller.scrollHeight <= scroller.clientHeight) {
    collectWindow(scroller, 0);
    return doc;
  }

  const originalScrollTop = scroller.scrollTop;
  const deadline = performance.now() + MAX_DURATION_MS;
  const collected = new Map<string, HTMLElement>();
  const signatures = new Map<string, string>();
  let position = 0;

  try {
    for (let windowIndex = 0; windowIndex < MAX_WINDOWS; windowIndex += 1) {
      images?.assertCurrent();
      if (performance.now() >= deadline + (images?.imageWaitMs ?? 0)) break;
      if (!isCurrentOwner(doc, owner)) {
        failPreparation(doc, collected.size, 'grok_conversation_changed');
      }
      setScrollTop(scroller, position);
      const stable = await waitForWindow(scroller, images);
      if (!isCurrentOwner(doc, owner)) {
        failPreparation(doc, collected.size, 'grok_conversation_changed');
      }
      if (!stable) {
        failPreparation(doc, collected.size, 'grok_transcript_unstable');
      }
      if (
        !scroller.isConnected ||
        scroller.getAttribute('aria-busy') === 'true' ||
        scope?.querySelector('.grok-bot[data-state="working"]')
      ) {
        failPreparation(doc, collected.size, 'grok_transcript_loading');
      }
      if (windowIndex === 0 && !scroller.querySelector('[data-plane-row="transcript:top-inset"]')) {
        failPreparation(doc, 0, 'grok_transcript_start_missing');
      }
      const turns = collectWindow(scroller, collected.size);
      if (turns.length === 0) failPreparation(doc, collected.size, 'grok_transcript_window_empty');
      mergeWindow(doc, collected, turns, signatures, images);
      await images?.flush();
      if (!isCurrentOwner(doc, owner))
        failPreparation(doc, collected.size, 'grok_conversation_changed');

      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      if (scroller.scrollTop >= maxScrollTop - 1) {
        if (
          !scroller.querySelector(
            '[data-plane-row="transcript:bottom-spacing"], [data-plane-row="transcript:submit-spacer"]'
          )
        ) {
          failPreparation(doc, collected.size, 'grok_transcript_end_missing');
        }
        return createPreparedDocument(doc, collected, owner.title);
      }
      const lastRow = turns.at(-1)?.element.closest('[data-plane-row]');
      const rowAdvance =
        (lastRow?.getBoundingClientRect().bottom ?? 0) -
        scroller.getBoundingClientRect().top -
        scroller.clientHeight / 2;
      position = Math.min(
        maxScrollTop,
        scroller.scrollTop + Math.max(1, Math.floor(scroller.clientHeight * 0.75), rowAdvance)
      );
    }
    return failPreparation(doc, collected.size, 'grok_transcript_budget_exhausted');
  } finally {
    if (isCurrentOwner(doc, owner)) {
      setScrollTop(scroller, originalScrollTop);
      await waitForWindow(scroller, images);
      if (!isCurrentOwner(doc, owner)) {
        failPreparation(doc, collected.size, 'grok_conversation_changed');
      }
    }
  }
}

export async function prepareGrokDocumentForExtraction(
  doc: Document,
  images?: AIChatImagePreparation
): Promise<Document> {
  const existing = inFlightPreparations.get(doc);
  if (existing) {
    if (!isCurrentOwner(doc, existing.owner) || existing.images !== images) {
      failPreparation(doc, 0, 'grok_conversation_changed');
    }
    return existing.promise;
  }
  const owner = captureOwner(doc);
  const preparation = collectGrokDocument(doc, owner, images)
    .then((prepared) => {
      if (!isCurrentOwner(doc, owner)) failPreparation(doc, 0, 'grok_conversation_changed');
      return prepared;
    })
    .finally(() => {
      inFlightPreparations.delete(doc);
    });
  inFlightPreparations.set(doc, { owner, images, promise: preparation });
  return preparation;
}
