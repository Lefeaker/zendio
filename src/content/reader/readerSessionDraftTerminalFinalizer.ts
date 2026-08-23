import {
  createSessionDraftRepository,
  finalizeTerminalSessionDraft,
  settleSessionDraftPersister,
  type FinalizeTerminalSessionDraftResult,
  type SessionDraftPersister
} from '../sessionDrafts';
import {
  createSessionDraftStorageKey,
  type ReaderSessionDraftEnvelope,
  type SessionDraftTerminalStatus
} from '@shared/sessionDrafts';

export async function finalizeReaderSessionTerminalDraft(args: {
  status: SessionDraftTerminalStatus;
  currentDraftStorageKey: string | null;
  repository: ReturnType<typeof createSessionDraftRepository>;
  persister: SessionDraftPersister;
  buildCurrentEnvelope: (status: SessionDraftTerminalStatus) => ReaderSessionDraftEnvelope | null;
  applyTerminalIdentity: (identity: {
    draftId: string;
    draftCreatedAt: number;
    draftStorageKey: string;
  }) => void;
}): Promise<FinalizeTerminalSessionDraftResult> {
  if (args.status === 'discarded' && !args.currentDraftStorageKey) {
    return { outcome: 'completed', finalizedEnvelopes: [] };
  }

  let draftStorageKey: string | null = null;
  return finalizeTerminalSessionDraft<ReaderSessionDraftEnvelope>({
    repository: args.repository,
    flushPendingDraft: () => args.persister.flushNow(),
    buildTerminalEnvelopes: async () => {
      const terminalEnvelope = await buildTerminalDraftEnvelope(args);
      if (!terminalEnvelope) {
        return [];
      }

      draftStorageKey =
        args.currentDraftStorageKey ??
        createSessionDraftStorageKey({
          mode: terminalEnvelope.mode,
          pageKey: terminalEnvelope.pageKey,
          draftId: terminalEnvelope.draftId
        });

      args.applyTerminalIdentity({
        draftId: terminalEnvelope.draftId,
        draftCreatedAt: terminalEnvelope.createdAt,
        draftStorageKey
      });
      return [terminalEnvelope];
    },
    onFlushError: (error) => {
      console.warn(
        '[ReaderSession] Failed to flush session draft before terminal finalization:',
        error
      );
    },
    onSaveError: (error) => {
      console.warn('[ReaderSession] Failed to finalize terminal session draft:', error);
    },
    onCleanupError: (error) => {
      console.warn(
        '[ReaderSession] Failed to remove terminal session draft after finalization:',
        error
      );
    }
  });
}

export async function flushReaderSessionDraftForRestore(args: {
  persister: Pick<SessionDraftPersister, 'flushNow' | 'hasPending'>;
  repository: Pick<ReturnType<typeof createSessionDraftRepository>, 'save'>;
  buildRestorableEnvelope: () => ReaderSessionDraftEnvelope | null;
  releasePersistedLease: (() => Promise<object | null>) | null;
  clearPersistedDraft: () => Promise<void>;
}): Promise<void> {
  try {
    if (args.releasePersistedLease)
      return settleSessionDraftPersister(args.persister, args.releasePersistedLease);
    await args.persister.flushNow();
    const envelope = args.buildRestorableEnvelope();
    if (!envelope) return args.clearPersistedDraft();
    await args.repository.save(envelope);
  } catch (error) {
    console.warn('[ReaderSession] Failed to flush restorable session draft:', error);
  }
}

async function buildTerminalDraftEnvelope(args: {
  status: SessionDraftTerminalStatus;
  currentDraftStorageKey: string | null;
  repository: ReturnType<typeof createSessionDraftRepository>;
  buildCurrentEnvelope: (status: SessionDraftTerminalStatus) => ReaderSessionDraftEnvelope | null;
}): Promise<ReaderSessionDraftEnvelope | null> {
  const currentEnvelope = args.buildCurrentEnvelope(args.status);
  if (currentEnvelope) {
    return currentEnvelope;
  }

  if (!args.currentDraftStorageKey) {
    return null;
  }

  const result = await args.repository.readExact({
    operation: 'readExact',
    key: args.currentDraftStorageKey
  });
  if (result.outcome !== 'found' || result.envelope.mode !== 'reader') {
    return null;
  }
  const stored = result.envelope as unknown as ReaderSessionDraftEnvelope;

  const now = Date.now();
  return {
    ...stored,
    status: args.status,
    updatedAt: now,
    expiresAt: now
  };
}
