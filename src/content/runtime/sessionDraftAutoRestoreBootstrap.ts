import type { StorageService } from '../../platform/interfaces/storage';
import type { ReaderSessionAdapter } from '../clipper/services/selectionController';
import type { VideoSessionAdapter } from '../video/application/videoSessionPort';
import type {
  ReaderSessionDraftEnvelope,
  SessionDraftStoragePolicy,
  VideoSessionDraftEnvelope
} from '@shared/sessionDrafts';

export interface SessionDraftAutoRestoreOptions {
  document: Document;
  window: Window;
  storage: StorageService;
  currentUrl: () => string;
  createReaderSession: (
    claimedDraft: ReaderSessionDraftEnvelope,
    signal: AbortSignal,
    onStartCommitted: () => void
  ) => ReaderSessionAdapter;
  createVideoSession: (
    claimedDraft: VideoSessionDraftEnvelope,
    signal: AbortSignal,
    onStartCommitted: () => void
  ) => VideoSessionAdapter;
  sessionDraftStoragePolicy?: SessionDraftStoragePolicy;
  isReaderSessionActive: () => boolean;
  isVideoSessionActive: () => boolean;
  isVideoCandidateUrl: (href: string) => boolean;
}

export type SessionDraftAutoRestoreDisposer = () => void;

export interface SessionDraftAutoRestoreModule {
  startSessionDraftAutoRestore: (
    options: SessionDraftAutoRestoreOptions
  ) => SessionDraftAutoRestoreDisposer;
}

export type SessionDraftAutoRestoreLoader = () => Promise<SessionDraftAutoRestoreModule>;

export function startLazyDraftRestore(
  load: SessionDraftAutoRestoreLoader,
  options: SessionDraftAutoRestoreOptions,
  onLoadError: (error: unknown) => void
): SessionDraftAutoRestoreDisposer {
  let stopped = false;
  let dispose: SessionDraftAutoRestoreDisposer | undefined;

  void load().then(({ startSessionDraftAutoRestore }) => {
    if (!stopped) {
      dispose = startSessionDraftAutoRestore(options);
    }
  }, onLoadError);

  return () => {
    stopped = true;
    dispose?.();
  };
}

export function waitForSessionStart(start: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('SESSION_DRAFT_AUTO_RESTORE_ABORTED'));
  return new Promise<void>((resolve, reject) => {
    const abort = () => finish(() => reject(new Error('SESSION_DRAFT_AUTO_RESTORE_ABORTED')));
    const finish = (settle: () => void) => {
      signal.removeEventListener('abort', abort);
      settle();
    };
    signal.addEventListener('abort', abort, { once: true });
    void start.then(
      () => finish(resolve),
      (error: unknown) => finish(() => reject(error))
    );
  });
}

export async function waitForDocumentBody(doc: Document, signal: AbortSignal): Promise<void> {
  if (doc.body) return;
  await new Promise<void>((resolve) => {
    const observer =
      doc.defaultView?.MutationObserver !== undefined
        ? new doc.defaultView.MutationObserver(finish)
        : new MutationObserver(finish);

    function finish(): void {
      observer.disconnect();
      doc.removeEventListener('DOMContentLoaded', finish);
      signal.removeEventListener('abort', finish);
      resolve();
    }

    doc.addEventListener('DOMContentLoaded', finish, { once: true });
    signal.addEventListener('abort', finish, { once: true });
    if (!doc.documentElement) return resolve();
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    if (doc.body) finish();
  });
}

export async function waitForVideoElement(
  doc: Document,
  win: Window,
  signal: AbortSignal,
  timeoutMs: number
): Promise<boolean> {
  if (doc.querySelector('video')) return true;
  return new Promise<boolean>((resolve) => {
    const observer =
      doc.defaultView?.MutationObserver !== undefined
        ? new doc.defaultView.MutationObserver(checkForVideo)
        : new MutationObserver(checkForVideo);
    let settled = false;
    const timeoutId = win.setTimeout(() => finish(false), timeoutMs);

    function finish(result: boolean): void {
      if (settled) return;
      settled = true;
      observer.disconnect();
      win.clearTimeout(timeoutId);
      signal.removeEventListener('abort', handleAbort);
      resolve(result);
    }

    function handleAbort(): void {
      finish(false);
    }

    function checkForVideo(): void {
      if (doc.querySelector('video')) finish(true);
    }

    signal.addEventListener('abort', handleAbort, { once: true });
    const root = doc.body ?? doc.documentElement;
    if (root) observer.observe(root, { childList: true, subtree: true });
    checkForVideo();
  });
}
