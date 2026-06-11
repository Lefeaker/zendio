import type { SessionDraftPersister, VideoSessionDraftEnvelope } from '../sessionDrafts';
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
  buildDraftEnvelope: () => VideoSessionDraftEnvelope | null;
  removeDraft: () => Promise<void>;
  draftPersister: SessionDraftPersister;
  clearSupersededDurableSources: () => Promise<void>;
  trackSavingState?: boolean;
  onPostSaveCleanupError?: (error: unknown) => void;
}): Promise<VideoHintState | null> {
  if (!options.isCleaningUp) {
    options.syncCommentDrafts();
  }

  if (!options.buildDraftEnvelope()) {
    if (options.trackSavingState) {
      options.state.saving = true;
    }
    try {
      await options.removeDraft();
    } finally {
      if (options.trackSavingState) {
        options.state.saving = false;
      }
    }
    return options.state.captures.length ? 'ready' : 'noCaptures';
  }

  const pending = options.draftPersister.scheduleSave();
  if (options.trackSavingState) {
    options.state.saving = true;
  }
  try {
    await options.draftPersister.flushNow();
    await pending;
  } catch (error) {
    await pending.catch(() => undefined);
    throw error;
  } finally {
    if (options.trackSavingState) {
      options.state.saving = false;
    }
  }
  try {
    await options.clearSupersededDurableSources();
  } catch (error) {
    options.onPostSaveCleanupError?.(error);
  }
  return options.state.captures.length ? 'ready' : 'noCaptures';
}
