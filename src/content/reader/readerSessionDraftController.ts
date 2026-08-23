import {
  bindReaderSessionDraftLifecycle,
  discardReaderSessionDraftCandidate,
  loadLatestReaderSessionDraftResult,
  type LoadedReaderSessionDraft,
  type LoadedReaderSessionDraftResult
} from './sessionDrafts';
import {
  buildReaderSessionDraftState,
  hasPersistableReaderSessionDraftContent
} from './sessionDraftPayload';
import {
  createSessionDraftPersister,
  createSessionDraftRepository,
  type SessionDraftPersister
} from '../sessionDrafts';
import {
  finalizeReaderSessionTerminalDraft,
  flushReaderSessionDraftForRestore
} from './readerSessionDraftTerminalFinalizer';
import {
  hasPersistedSessionDraftRevision,
  type ReaderSessionDraftEnvelope,
  type SessionDraftStatus,
  type SessionDraftTerminalStatus,
  type SessionDraftEnvelope as PersistedSessionDraftEnvelope
} from '@shared/sessionDrafts';
import {
  createSessionDraftLeaseLifecycle,
  type MountedSessionDraftEnvelope
} from '../sessionDrafts/sessionDraftTabContext';
import type {
  ReaderSessionDraftControllerOptions,
  ReaderSessionDraftIdentity
} from './sessionTypes';
export type {
  ReaderSessionDraftControllerOptions,
  ReaderSessionDraftIdentity
} from './sessionTypes';
export class ReaderSessionDraftController {
  private readonly repository: ReturnType<typeof createSessionDraftRepository>;
  private readonly persister: SessionDraftPersister;
  private draftId: string | null = null;
  private draftCreatedAt: number | null = null;
  private draftStorageKey: string | null = null;
  private persistedEnvelope: MountedSessionDraftEnvelope | null = null;
  private readonly leaseLifecycle: ReturnType<typeof createSessionDraftLeaseLifecycle>;
  private removeLifecycleListeners: (() => void) | null = null;
  private initialClaimedDraft: ReaderSessionDraftEnvelope | undefined;
  constructor(private readonly options: ReaderSessionDraftControllerOptions) {
    this.initialClaimedDraft = options.initialClaimedDraft;
    this.repository = createSessionDraftRepository(this.options.sendMessage, {
      retentionPolicy: this.options.retentionPolicy
    });
    this.leaseLifecycle = createSessionDraftLeaseLifecycle({
      mode: 'reader',
      repository: this.repository,
      ...(options.leaseOwnerRegistry ? { registry: options.leaseOwnerRegistry } : {}),
      warningPrefix: '[ReaderSession]',
      onAccepted: (envelope, key) => {
        this.persistedEnvelope = envelope;
        this.draftStorageKey = key;
      }
    });
    if (options.initialClaimedDraft) {
      if (!hasPersistedSessionDraftRevision(options.initialClaimedDraft)) {
        throw new Error('SESSION_DRAFT_REVISION_INVALID');
      }
      this.repository.adoptClaimed(options.initialClaimedDraft as PersistedSessionDraftEnvelope);
      this.acceptPersistedEnvelope(options.initialClaimedDraft);
    }
    this.persister = createSessionDraftPersister<
      ReaderSessionDraftEnvelope,
      PersistedSessionDraftEnvelope
    >({
      repository: this.repository,
      buildEnvelope: () => this.buildEnvelope('active'),
      onPersistedEnvelope: (envelope) => this.acceptPersistedEnvelope(envelope)
    });
  }

  get identity(): ReaderSessionDraftIdentity {
    return {
      draftId: this.draftId,
      draftCreatedAt: this.draftCreatedAt,
      draftStorageKey: this.draftStorageKey
    };
  }

  loadLatestResult(): Promise<LoadedReaderSessionDraftResult> {
    const initialClaimedDraft = this.initialClaimedDraft;
    this.initialClaimedDraft = undefined;
    return loadLatestReaderSessionDraftResult(
      this.repository,
      this.options.pageUrl,
      initialClaimedDraft
    );
  }

  claimLoadedDraft(draft: LoadedReaderSessionDraft): void {
    this.draftId = draft.envelope.draftId;
    this.draftCreatedAt = draft.envelope.createdAt;
    this.draftStorageKey = draft.storageKey;
    if (!hasPersistedSessionDraftRevision(draft.envelope)) {
      throw new Error('SESSION_DRAFT_REVISION_INVALID');
    }
    this.acceptPersistedEnvelope(draft.envelope);
  }

  buildEnvelope(status: SessionDraftStatus): ReaderSessionDraftEnvelope | null {
    const destination = this.options.getDestinationMetadata();
    const state = buildReaderSessionDraftState({
      draftId: this.draftId,
      createdAt: this.draftCreatedAt,
      pageUrl: this.options.pageUrl,
      pageTitle: this.options.getPageTitle(),
      highlights: this.options.getHighlights(),
      commentDrafts: this.options.getCommentDrafts(),
      status,
      ...(this.options.retentionPolicy ? { retentionPolicy: this.options.retentionPolicy } : {}),
      ...(destination ? { destination } : {})
    });
    if (!state) return null;
    this.draftId = state.draftId;
    this.draftCreatedAt = state.createdAt;
    this.draftStorageKey = state.storageKey;
    return state.envelope;
  }

  async persistMutation(): Promise<void> {
    if (!this.hasPersistableDraftContent()) {
      await this.clearPersistedDraft();
      return;
    }

    await this.persister.scheduleSave();
  }

  queuePersistence(): void {
    void this.persistMutation().catch((error) => {
      console.warn('[ReaderSession] Failed to persist session draft:', error);
    });
  }

  autosaveCommentDraftMutation(): void {
    void this.persistMutation().catch((error) => {
      console.warn('[ReaderSession] Failed to persist session draft:', error);
      this.options.onPersistenceFailure();
    });
  }

  async finalizeTerminalDraft(status: SessionDraftTerminalStatus): Promise<boolean> {
    this.leaseLifecycle.stop(true);
    const finalized = await finalizeReaderSessionTerminalDraft({
      status,
      currentDraftStorageKey: this.draftStorageKey,
      repository: this.repository,
      persister: this.persister,
      buildCurrentEnvelope: (nextStatus) => this.buildEnvelope(nextStatus),
      applyTerminalIdentity: ({ draftId, draftCreatedAt, draftStorageKey }) => {
        this.draftId = draftId;
        this.draftCreatedAt = draftCreatedAt;
        this.draftStorageKey = draftStorageKey;
      }
    });
    if (finalized.outcome === 'completed') {
      this.leaseLifecycle.clear();
      this.persistedEnvelope = null;
    } else if (
      finalized.latestCommittedEnvelope?.lease &&
      finalized.latestCommittedEnvelope.mode === 'reader'
    ) {
      this.acceptPersistedEnvelope(finalized.latestCommittedEnvelope);
    } else if (this.persistedEnvelope?.lease) {
      this.acceptPersistedEnvelope(this.persistedEnvelope);
    }
    return finalized.outcome === 'completed';
  }

  async clearPersistedDraft(): Promise<void> {
    if (!this.draftStorageKey) {
      return;
    }

    const draftStorageKey = this.draftStorageKey;
    await this.repository.remove({ key: draftStorageKey });
    if (this.draftStorageKey === draftStorageKey) {
      this.clearIdentity();
    }
  }

  async discardStoredDraftCandidate(storageKey: string): Promise<void> {
    await discardReaderSessionDraftCandidate(this.repository, storageKey);
    if (this.draftStorageKey === storageKey) this.clearIdentity();
  }

  bindLifecycleListeners(): void {
    if (this.removeLifecycleListeners) {
      return;
    }

    const removeListeners = bindReaderSessionDraftLifecycle(this.options.doc, () =>
      this.flushForRestore()
    );
    this.removeLifecycleListeners = () => {
      removeListeners();
      this.removeLifecycleListeners = null;
    };
  }

  async flushForRestore(): Promise<void> {
    await flushReaderSessionDraftForRestore({
      persister: this.persister,
      repository: this.repository,
      buildRestorableEnvelope: () => this.buildEnvelope('restorable'),
      releasePersistedLease: this.persistedEnvelope ? this.leaseLifecycle.release : null,
      clearPersistedDraft: () => this.clearPersistedDraft()
    });
  }

  async dispose(): Promise<void> {
    this.removeLifecycleListeners?.();
    try {
      await this.persister.dispose();
      await this.leaseLifecycle.release();
    } catch (error) {
      console.warn('[ReaderSession] Failed to dispose session draft persister:', error);
    }
  }

  private hasPersistableDraftContent(): boolean {
    return hasPersistableReaderSessionDraftContent(
      this.options.getHighlights(),
      this.options.getCommentDrafts()
    );
  }

  private clearIdentity(): void {
    this.leaseLifecycle.clear();
    this.draftId = null;
    this.draftCreatedAt = null;
    this.draftStorageKey = null;
    this.persistedEnvelope = null;
  }

  private acceptPersistedEnvelope(envelope: MountedSessionDraftEnvelope): void {
    this.leaseLifecycle.accept(envelope);
  }
}
