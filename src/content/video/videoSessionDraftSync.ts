import type { SessionDraftPersister } from '../sessionDrafts';
import type { VideoSessionState } from './sessionState';
import type { VideoHintState } from './videoHintManager';

interface VideoSessionCommentDraftHydrator {
  setCommentDrafts(drafts: Record<string, string>): void;
}

interface VideoSessionCommentDraftReader {
  readCommentDrafts(): Record<string, string>;
}

export function applyVideoSessionCommentDrafts(
  state: VideoSessionState,
  drafts: Record<string, string>,
  options: {
    hydrateDom?: boolean;
    dom?: VideoSessionCommentDraftHydrator | null;
  } = {}
): void {
  state.commentDrafts = { ...drafts };
  if (options.hydrateDom) {
    options.dom?.setCommentDrafts(state.commentDrafts);
  }
}

export function syncVideoSessionCommentDraftsFromDom(
  state: VideoSessionState,
  dom: VideoSessionCommentDraftReader
): Record<string, string> {
  const drafts = dom.readCommentDrafts();
  applyVideoSessionCommentDrafts(state, drafts);
  return { ...state.commentDrafts };
}

export function bindVideoSessionDraftPersistence(
  view: Window,
  flushDraftNow: () => void
): () => void {
  view.addEventListener('pagehide', flushDraftNow, { passive: true });
  view.addEventListener('beforeunload', flushDraftNow, true);
  return () => {
    view.removeEventListener('pagehide', flushDraftNow);
    view.removeEventListener('beforeunload', flushDraftNow, true);
  };
}

export async function flushVideoSessionDraftNow(options: {
  state: VideoSessionState;
  isCleaningUp: boolean;
  syncCommentDrafts: () => void;
  buildDraftEnvelope: () => unknown | null;
  removeDraft: () => Promise<void>;
  draftPersister: SessionDraftPersister;
  clearSupersededDurableSources: () => Promise<void>;
}): Promise<VideoHintState | null> {
  if (!options.isCleaningUp) {
    options.syncCommentDrafts();
  }
  if (!options.buildDraftEnvelope()) {
    await options.removeDraft();
    return options.state.captures.length ? 'ready' : 'noCaptures';
  }
  const pending = options.draftPersister.scheduleSave();
  await options.draftPersister.flushNow();
  await pending;
  await options.clearSupersededDurableSources();
  return options.state.captures.length ? 'ready' : 'noCaptures';
}
