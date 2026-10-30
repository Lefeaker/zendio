import { extractionErrors } from '../../shared/errors/extractionErrors';
import {
  CHATGPT_SCROLL_OWNER,
  captureChatGPTViewport,
  chatGPTHistoryIsLoading,
  chatGPTIsGenerating,
  findChatGPTScrollOwner,
  moveChatGPTScroll,
  readChatGPTTurns,
  restoreChatGPTViewport,
  settleChatGPTWindow,
  waitForChatGPTPaint,
  type ChatGPTTurn
} from './chatgptTranscriptDom';

const MAX_DURATION_MS = 60_000;
const MAX_WINDOWS = 200;
const inFlight = new WeakMap<
  Document,
  { url: string; owner: HTMLElement; promise: Promise<Document> }
>();

type StoredTurn = { element: HTMLElement; signature: string };

function incomplete(doc: Document, turns: Map<string, StoredTurn>, diagnostic: string): never {
  throw extractionErrors.aiChatPreparationIncomplete({
    type: 'ai_chat',
    platform: 'chatgpt',
    url: doc.URL,
    messageCount: Array.from(turns.values()).reduce(
      (count, turn) => count + turn.element.querySelectorAll('h4[data-conversation-role]').length,
      0
    ),
    parserDiagnosticCodes: [diagnostic]
  });
}

function mergeWindow(
  doc: Document,
  collected: Map<string, StoredTurn>,
  turns: ChatGPTTurn[],
  positions: Map<string, number>
): void {
  if (
    turns.some((turn) => !turn.key || !turn.element.querySelector('h4[data-conversation-role]')) ||
    new Set(turns.map((turn) => turn.key)).size !== turns.length
  ) {
    incomplete(doc, collected, 'chatgpt_history_turn_unresolved');
  }
  const keys = Array.from(collected.keys());
  const start = keys.indexOf(turns[0]?.key ?? '');
  if (
    keys.length > 0 &&
    (start < 0 ||
      turns.some((turn, offset) => {
        const expected = keys[start + offset];
        return expected !== undefined && expected !== turn.key;
      }))
  )
    incomplete(doc, collected, 'chatgpt_history_window_gap');
  for (const turn of turns) {
    const previous = collected.get(turn.key);
    if (previous && previous.signature !== turn.signature) {
      incomplete(doc, collected, 'chatgpt_history_content_changed');
    }
    if (!previous)
      collected.set(turn.key, {
        element: doc.importNode(turn.element, true),
        signature: turn.signature
      });
    positions.set(turn.key, turn.top);
  }
}

function preparedDocument(
  doc: Document,
  owner: HTMLElement,
  turns: Map<string, StoredTurn>
): Document {
  const index = Array.from(doc.querySelectorAll(CHATGPT_SCROLL_OWNER)).indexOf(owner);
  const prepared = doc.implementation.createHTMLDocument(doc.title);
  prepared.replaceChild(prepared.importNode(doc.documentElement, true), prepared.documentElement);
  const target = prepared.querySelectorAll(CHATGPT_SCROLL_OWNER)[index];
  if (!target) return incomplete(doc, turns, 'chatgpt_history_owner_missing');
  target.replaceChildren(
    ...Array.from(turns.values(), (turn) => prepared.importNode(turn.element, true))
  );
  return prepared;
}

async function collectChatGPTHistory(
  doc: Document,
  owner: HTMLElement,
  url: string
): Promise<Document> {
  const viewport = captureChatGPTViewport(owner);
  const initialKeys = readChatGPTTurns(owner).map((turn) => turn.key);
  const stillCurrent = () =>
    doc.URL === url && owner.isConnected && findChatGPTScrollOwner(doc) === owner;
  const deadline = performance.now() + MAX_DURATION_MS;
  const collected = new Map<string, StoredTurn>();
  const positions = new Map<string, number>();
  let completed = false;
  const assertCurrent = () => {
    if (!stillCurrent()) incomplete(doc, collected, 'chatgpt_history_document_changed');
    if (chatGPTIsGenerating(owner)) incomplete(doc, collected, 'chatgpt_generation_in_progress');
    if (performance.now() >= deadline)
      incomplete(doc, collected, 'chatgpt_history_budget_exhausted');
  };
  try {
    let atStart = false;
    while (!atStart) {
      assertCurrent();
      moveChatGPTScroll(owner, 0);
      await waitForChatGPTPaint(doc);
      assertCurrent();
      if (chatGPTHistoryIsLoading(owner)) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }
      if (owner.scrollTop > 1) continue;
      const turns = await settleChatGPTWindow(owner, stillCurrent);
      assertCurrent();
      if (chatGPTHistoryIsLoading(owner) || owner.scrollTop > 1) continue;
      const first = turns?.[0];
      if (first && first.top >= -1 && first.top <= owner.clientHeight) {
        atStart = true;
        break;
      }
      incomplete(doc, collected, 'chatgpt_history_start_unresolved');
    }
    for (let windowIndex = 0; windowIndex < MAX_WINDOWS; windowIndex += 1) {
      assertCurrent();
      const turns = await settleChatGPTWindow(owner, stillCurrent);
      assertCurrent();
      if (!turns || turns.length === 0 || chatGPTHistoryIsLoading(owner)) {
        incomplete(doc, collected, 'chatgpt_history_window_unstable');
      }
      mergeWindow(doc, collected, turns, positions);
      const maxTop = Math.max(0, owner.scrollHeight - owner.clientHeight);
      const last = turns[turns.length - 1];
      if (!last) return incomplete(doc, collected, 'chatgpt_history_window_empty');
      if (owner.scrollTop >= maxTop - 1) {
        if (
          initialKeys.some((key) => !collected.has(key)) ||
          last.element.getBoundingClientRect().bottom > owner.getBoundingClientRect().bottom + 1 ||
          last.element.getBoundingClientRect().bottom < owner.getBoundingClientRect().top
        ) {
          incomplete(doc, collected, 'chatgpt_history_end_unresolved');
        }
        const result = preparedDocument(doc, owner, collected);
        assertCurrent();
        completed = true;
        return result;
      }
      const lastBottom = last.top + last.element.getBoundingClientRect().height;
      const next = Math.min(
        maxTop,
        last.top > owner.scrollTop + 1 ? last.top : lastBottom - owner.clientHeight / 2
      );
      if (next <= owner.scrollTop + 1) incomplete(doc, collected, 'chatgpt_history_scroll_stalled');
      moveChatGPTScroll(owner, next);
    }
    return incomplete(doc, collected, 'chatgpt_history_budget_exhausted');
  } finally {
    const restored = await restoreChatGPTViewport(owner, viewport, positions, stillCurrent);
    if (completed && !restored) incomplete(doc, collected, 'chatgpt_history_restore_incomplete');
  }
}

export function prepareChatGPTDocumentForExtraction(doc: Document): Promise<Document> {
  const owner = findChatGPTScrollOwner(doc);
  const current = inFlight.get(doc);
  if (current) {
    if (current.url === doc.URL && current.owner === owner) return current.promise;
    return Promise.reject(
      extractionErrors.aiChatPreparationIncomplete({
        type: 'ai_chat',
        platform: 'chatgpt',
        url: doc.URL,
        messageCount: 0,
        parserDiagnosticCodes: ['chatgpt_history_document_changed']
      })
    );
  }
  if (!owner) {
    const unresolved = Array.from(doc.querySelectorAll<HTMLElement>(CHATGPT_SCROLL_OWNER)).some(
      (candidate) =>
        !candidate.closest('[hidden], [aria-hidden="true"]') &&
        candidate.querySelector('[data-turn-key]')
    );
    if (unresolved)
      return Promise.reject(
        extractionErrors.aiChatPreparationIncomplete({
          type: 'ai_chat',
          platform: 'chatgpt',
          url: doc.URL,
          messageCount: 0,
          parserDiagnosticCodes: ['chatgpt_history_owner_unresolved']
        })
      );
    return Promise.resolve(doc);
  }
  const url = doc.URL;
  const promise = collectChatGPTHistory(doc, owner, url).finally(() => inFlight.delete(doc));
  inFlight.set(doc, { url, owner, promise });
  return promise;
}
