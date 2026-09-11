import {
  createSessionDraftStorageKey,
  DEFAULT_SESSION_DRAFT_STORAGE_POLICY,
  isSessionDraftStorageKey,
  SessionDraftEnvelopeSchema,
  type ReaderSessionDraftEnvelope,
  type SessionDraftEnvelope,
  type VideoSessionDraftEnvelope
} from '@shared/sessionDrafts';
import { createSessionDraftRepository } from '../sessionDrafts';
import { watchVideoNavigation, type VideoNavigationWatcher } from '../video/videoNavigationWatcher';
import {
  waitForDocumentBody,
  waitForSessionStart,
  waitForVideoElement,
  type SessionDraftAutoRestoreDisposer,
  type SessionDraftAutoRestoreOptions
} from './sessionDraftAutoRestoreBootstrap';

export type {
  SessionDraftAutoRestoreDisposer,
  SessionDraftAutoRestoreOptions
} from './sessionDraftAutoRestoreBootstrap';

const VIDEO_ELEMENT_WAIT_TIMEOUT_MS = 1_500;

export function startSessionDraftAutoRestore(
  options: SessionDraftAutoRestoreOptions
): SessionDraftAutoRestoreDisposer {
  const sessionDraftStoragePolicy =
    options.sessionDraftStoragePolicy ?? DEFAULT_SESSION_DRAFT_STORAGE_POLICY;
  const repository = createSessionDraftRepository(options.storage.local, {
    retentionPolicy: sessionDraftStoragePolicy.retentionPolicy
  });
  const releasingClaimKeys = new Set<string>();
  const selectDraft = async (mode: 'reader' | 'video', pageUrl: string) => {
    const result = await repository.selectAndClaim({
      operation: 'selectAndClaim',
      requestId:
        typeof globalThis.crypto?.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `restore-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      mode,
      pageUrl
    });
    if (result.outcome === 'claimed' && result.envelope) return result.envelope;
    if (result.outcome === 'none' || result.outcome === 'invalid_removed') return null;
    if (result.outcome === 'conflict' && result.code === 'OWNER_ACTIVE') return null;
    if (result.outcome === 'conflict' || result.outcome === 'recovery_failed') {
      throw new Error(result.code);
    }
    throw new Error('SESSION_DRAFT_CLAIM_REQUIRES_READ_EXACT');
  };
  const releaseClaim = async (envelope: SessionDraftEnvelope): Promise<void> => {
    if (!envelope.lease) return;
    const key = createSessionDraftStorageKey(envelope);
    releasingClaimKeys.add(key);
    try {
      const result = await repository.releaseLease({
        operation: 'releaseLease',
        requestId:
          typeof globalThis.crypto?.randomUUID === 'function'
            ? globalThis.crypto.randomUUID()
            : `restore-release-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        key,
        expectedRevision: envelope.revision,
        leaseId: envelope.lease.leaseId
      });
      if (result.outcome !== 'released') {
        const code: unknown = 'code' in result ? result.code : undefined;
        throw new Error(typeof code === 'string' ? code : 'SESSION_DRAFT_RELEASE_FAILED');
      }
    } finally {
      releasingClaimKeys.delete(key);
    }
  };
  const abortController = new AbortController();
  let stopped = false;
  let restoreRun: Promise<void> | null = null;
  let rerunRequested = false;

  const isSessionActive = (): boolean =>
    options.isReaderSessionActive() || options.isVideoSessionActive();

  const queueRestore = (): void => {
    if (stopped) {
      return;
    }
    if (restoreRun) {
      rerunRequested = true;
      return;
    }
    restoreRun = runRestoreLoop()
      .catch((error) => {
        console.warn('[content] Failed to auto-restore session draft:', error);
      })
      .finally(() => {
        restoreRun = null;
        if (rerunRequested && !stopped) {
          rerunRequested = false;
          queueRestore();
        }
      });
  };

  const stopDraftStorageWatcher = options.storage.local.watchAll((changes) => {
    const hasRestorableDraft = Object.entries(changes).some(([key, change]) => {
      if (
        releasingClaimKeys.has(key) ||
        !isSessionDraftStorageKey(key) ||
        change.newValue === undefined
      ) {
        return false;
      }
      const parsed = SessionDraftEnvelopeSchema.safeParse(change.newValue);
      return parsed.success && parsed.data.status === 'restorable' && !parsed.data.lease;
    });
    if (hasRestorableDraft) {
      queueRestore();
    }
  });

  const navigationWatcher: VideoNavigationWatcher = watchVideoNavigation(options.document, () => {
    queueRestore();
  });

  async function runRestoreLoop(): Promise<void> {
    do {
      rerunRequested = false;
      await waitForDocumentBody(options.document, abortController.signal);
      if (stopped || abortController.signal.aborted || isSessionActive()) {
        return;
      }

      const href = options.currentUrl();
      const isVideoCandidate = options.isVideoCandidateUrl(href);
      const videoDraft = isVideoCandidate ? await selectDraft('video', href) : null;

      if (stopped || abortController.signal.aborted || isSessionActive()) {
        if (videoDraft) await releaseClaim(videoDraft);
        return;
      }

      if (videoDraft) {
        const videoReady = await waitForVideoElement(
          options.document,
          options.window,
          abortController.signal,
          VIDEO_ELEMENT_WAIT_TIMEOUT_MS
        );
        if (!videoReady || stopped || abortController.signal.aborted || isSessionActive()) {
          await releaseClaim(videoDraft);
          return;
        }
        let startCommitted = false;
        try {
          const session = options.createVideoSession(
            videoDraft as VideoSessionDraftEnvelope,
            abortController.signal,
            () => {
              startCommitted = true;
            }
          );
          await waitForSessionStart(session.start(), abortController.signal);
        } catch (error) {
          if (!startCommitted) await releaseClaim(videoDraft);
          throw error;
        }
        return;
      }

      const readerDraft = await selectDraft('reader', href);
      if (stopped || abortController.signal.aborted || isSessionActive()) {
        if (readerDraft) await releaseClaim(readerDraft);
        return;
      }
      if (readerDraft) {
        let startCommitted = false;
        try {
          const session = options.createReaderSession(
            readerDraft as ReaderSessionDraftEnvelope,
            abortController.signal,
            () => {
              startCommitted = true;
            }
          );
          await waitForSessionStart(session.start(), abortController.signal);
        } catch (error) {
          if (!startCommitted) await releaseClaim(readerDraft);
          throw error;
        }
        return;
      }
    } while (rerunRequested && !stopped);
  }

  queueRestore();

  return () => {
    stopped = true;
    abortController.abort();
    stopDraftStorageWatcher();
    navigationWatcher.stop();
  };
}
