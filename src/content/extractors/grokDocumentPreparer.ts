import { extractionErrors } from '../../shared/errors/extractionErrors';

const TRANSCRIPT_SELECTOR = '[data-transcript-renderer="plane"]';
const MESSAGE_SELECTOR =
  '[role="article"][data-testid="user-message"], [role="article"][data-testid="assistant-message"]';
const MAX_WINDOWS = 200;
const MAX_DURATION_MS = 12_000;

type CollectedTurn = { key: string; element: HTMLElement };

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

function signature(scroller: HTMLElement): string {
  const rows = Array.from(scroller.querySelectorAll('[data-plane-row^="response:"]'))
    .map((row) => `${row.getAttribute('data-plane-row')}:${row.textContent?.length ?? 0}`)
    .join('|');
  return rows ? `${scroller.scrollHeight}:${rows}` : '';
}

async function waitForWindow(scroller: HTMLElement): Promise<boolean> {
  let previous = '';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitForPaint(scroller.ownerDocument);
    const current = signature(scroller);
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

function collectWindow(scroller: HTMLElement): CollectedTurn[] {
  const turns: CollectedTurn[] = [];
  for (const row of Array.from(
    scroller.querySelectorAll<HTMLElement>('[data-plane-row^="response:"]')
  )) {
    const element = row.querySelector<HTMLElement>(MESSAGE_SELECTOR);
    const key = row.getAttribute('data-plane-row');
    if (element && key) turns.push({ key, element });
  }
  return turns;
}

function mergeWindow(
  doc: Document,
  collected: Map<string, HTMLElement>,
  turns: CollectedTurn[]
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
    collected.set(turn.key, doc.importNode(turn.element, true));
  }
}

function createPreparedDocument(doc: Document, collected: Map<string, HTMLElement>): Document {
  const prepared = doc.implementation.createHTMLDocument(doc.title);
  prepared.documentElement.lang = doc.documentElement.lang;
  const root = prepared.createElement('main');
  root.id = 'grok-content-area';
  for (const turn of collected.values()) root.appendChild(prepared.importNode(turn, true));
  prepared.body.appendChild(root);
  return prepared;
}

export async function prepareGrokDocumentForExtraction(doc: Document): Promise<Document> {
  const scope = doc.querySelector('#grok-content-area, #grok-page-content');
  if (scope?.querySelector('.grok-bot[data-state="working"]')) {
    failPreparation(doc, 0, 'grok_response_in_progress');
  }
  const scroller = scope?.querySelector<HTMLElement>(TRANSCRIPT_SELECTOR);
  if (!scroller) return doc;
  if (scroller.getAttribute('aria-busy') === 'true') {
    failPreparation(doc, 0, 'grok_transcript_loading');
  }
  if (scroller.clientHeight <= 0) {
    failPreparation(doc, 0, 'grok_transcript_viewport_unavailable');
  }
  if (scroller.scrollHeight <= scroller.clientHeight) return doc;

  const originalScrollTop = scroller.scrollTop;
  const deadline = performance.now() + MAX_DURATION_MS;
  const collected = new Map<string, HTMLElement>();
  let position = 0;

  try {
    for (let windowIndex = 0; windowIndex < MAX_WINDOWS; windowIndex += 1) {
      if (performance.now() >= deadline) break;
      setScrollTop(scroller, position);
      if (!(await waitForWindow(scroller))) {
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
      const turns = collectWindow(scroller);
      if (turns.length === 0) failPreparation(doc, collected.size, 'grok_transcript_window_empty');
      mergeWindow(doc, collected, turns);

      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      if (scroller.scrollTop >= maxScrollTop - 1) {
        if (!scroller.querySelector('[data-plane-row="transcript:bottom-spacing"]')) {
          failPreparation(doc, collected.size, 'grok_transcript_end_missing');
        }
        return createPreparedDocument(doc, collected);
      }
      position = Math.min(
        maxScrollTop,
        scroller.scrollTop + Math.max(1, Math.floor(scroller.clientHeight * 0.75))
      );
    }
    return failPreparation(doc, collected.size, 'grok_transcript_budget_exhausted');
  } finally {
    setScrollTop(scroller, originalScrollTop);
    await waitForWindow(scroller);
  }
}
