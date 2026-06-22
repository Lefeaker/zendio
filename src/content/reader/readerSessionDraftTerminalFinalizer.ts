import type { StorageAreaService } from '@platform/interfaces/storage';
import {
  createSessionDraftRepository,
  createSessionDraftStorageKey,
  finalizeTerminalSessionDraft,
  type ReaderSessionDraftEnvelope,
  type SessionDraftPersister,
  type SessionDraftTerminalStatus
} from '../sessionDrafts';

export async function finalizeReaderSessionTerminalDraft(args: {
  status: SessionDraftTerminalStatus;
  currentDraftStorageKey: string | null;
  repository: ReturnType<typeof createSessionDraftRepository>;
  persister: SessionDraftPersister;
  storageArea: StorageAreaService;
  buildCurrentEnvelope: (status: SessionDraftTerminalStatus) => ReaderSessionDraftEnvelope | null;
  applyTerminalIdentity: (identity: {
    draftId: string;
    draftCreatedAt: number;
    draftStorageKey: string;
  }) => void;
}): Promise<boolean> {
  if (args.status === 'discarded' && !args.currentDraftStorageKey) {
    return true;
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
    cleanupTerminalDrafts: async () => {
      if (draftStorageKey) {
        await args.repository.remove({ key: draftStorageKey });
      }
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

async function buildTerminalDraftEnvelope(args: {
  status: SessionDraftTerminalStatus;
  currentDraftStorageKey: string | null;
  storageArea: StorageAreaService;
  buildCurrentEnvelope: (status: SessionDraftTerminalStatus) => ReaderSessionDraftEnvelope | null;
}): Promise<ReaderSessionDraftEnvelope | null> {
  const currentEnvelope = args.buildCurrentEnvelope(args.status);
  if (currentEnvelope) {
    return currentEnvelope;
  }

  if (!args.currentDraftStorageKey) {
    return null;
  }

  const stored = await args.storageArea.get<ReaderSessionDraftEnvelope>(
    args.currentDraftStorageKey
  );
  if (!stored || stored.mode !== 'reader') {
    return null;
  }

  const now = Date.now();
  return {
    ...stored,
    status: args.status,
    updatedAt: now,
    expiresAt: now
  };
}
