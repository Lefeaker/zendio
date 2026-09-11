import type {
  SessionDraftEnvelope,
  SessionDraftStatus,
  SessionDraftTerminalStatus,
  VideoSessionDraftEnvelope
} from '@shared/sessionDrafts';
import { finalizeTerminalSessionDraft, type SessionDraftTerminalState } from '../sessionDrafts';
import type { SessionDraftMessageRepository } from '../sessionDrafts/sessionDraftRepository';
import { createVideoSessionDraftStorageKey } from './sessionDrafts';

export interface BuildVideoSessionDraftEnvelopeOptions {
  status?: SessionDraftStatus;
  draftId?: string;
  pageUrl?: string;
  allowEmpty?: boolean;
}

export async function buildVideoTerminalEnvelopeForExactKey(
  repository: Pick<SessionDraftMessageRepository, 'readExact'>,
  storageKey: string,
  status: SessionDraftTerminalStatus,
  buildEnvelope: (
    options: BuildVideoSessionDraftEnvelopeOptions
  ) => VideoSessionDraftEnvelope | null
): Promise<VideoSessionDraftEnvelope | null> {
  const result = await repository.readExact({ operation: 'readExact', key: storageKey });
  if (result.outcome !== 'found' || result.envelope.mode !== 'video') {
    return null;
  }
  const stored = result.envelope as unknown as SessionDraftEnvelope;

  return buildEnvelope({
    draftId: stored.draftId,
    pageUrl: stored.pageUrl,
    status,
    allowEmpty: true
  });
}

export async function finalizeVideoSessionTerminalDraft(args: {
  status: SessionDraftTerminalStatus;
  state?: SessionDraftTerminalState;
  repository: Pick<SessionDraftMessageRepository, 'readExact' | 'finalizeExact' | 'removeExact'>;
  restoredDraftKey: string | null;
  buildEnvelope: (
    options?: BuildVideoSessionDraftEnvelopeOptions
  ) => VideoSessionDraftEnvelope | null;
  flushPendingDraft: () => Promise<void>;
  cleanupTerminalDrafts: () => Promise<void>;
}) {
  return finalizeTerminalSessionDraft<VideoSessionDraftEnvelope>({
    repository: args.repository,
    state: args.state,
    flushPendingDraft: args.flushPendingDraft,
    buildTerminalEnvelopes: async () => {
      const currentEnvelope = args.buildEnvelope({ status: args.status, allowEmpty: true });
      const envelopes = new Map<string, VideoSessionDraftEnvelope>();
      if (currentEnvelope) {
        envelopes.set(
          createVideoSessionDraftStorageKey(currentEnvelope.pageUrl, currentEnvelope.draftId),
          currentEnvelope
        );
      }
      if (args.restoredDraftKey) {
        const restoredEnvelope = await buildVideoTerminalEnvelopeForExactKey(
          args.repository,
          args.restoredDraftKey,
          args.status,
          args.buildEnvelope
        );
        if (restoredEnvelope) envelopes.set(args.restoredDraftKey, restoredEnvelope);
      }
      return envelopes.values();
    },
    cleanupTerminalDrafts: args.cleanupTerminalDrafts,
    onSaveError: (error) => {
      console.warn('[VideoSession] Failed to finalize terminal session draft:', error);
    },
    onFlushError: (error) => {
      console.warn('[VideoSession] Failed to flush pending terminal session draft:', error);
    },
    onCleanupError: (error) => {
      console.warn(
        '[VideoSession] Failed to remove terminal session draft after finalization:',
        error
      );
    }
  });
}
