import { createFeatureTimer } from '../../shared/analytics';
import {
  createSessionDraftPersister,
  createSessionDraftRepository,
  settleSessionDraftPersister,
  type SessionDraftPersister
} from '../sessionDrafts';
import {
  createVideoSessionDraftId,
  createVideoSessionDraftStorageKey,
  hydrateVideoSessionDraft,
  pickVideoSessionDraftCandidate,
  type VideoSessionDraftPayloadShape
} from './sessionDrafts';
import type {
  VideoSessionDraftControllerOptions,
  VideoSessionDraftRuntimePort
} from './videoSessionRuntimePorts';
import {
  createLegacyVideoMigrationRequestId,
  flushVideoSessionDraftPersister,
  persistLegacyVideoCaptureMigration,
  type LoadedStoredVideoCaptureData
} from './captureStorage';
import type { VideoHintState } from './videoHintManager';
import {
  applyVideoSessionCommentDrafts,
  bindVideoSessionDraftPersistence,
  buildVideoDraftEnvelopeFromRuntime,
  buildVideoDraftRestoreTelemetryParams,
  flushVideoSessionDraftNow,
  readVideoDraftRestoreTelemetryCaptures,
  scheduleVideoDraftScreenshotHydration,
  syncVideoSessionCommentDraftsFromDom,
  trackVideoDraftRestoreEvent
} from './videoSessionDraftSync';
import {
  cleanupVideoDraftTerminalArtifacts,
  createVideoSessionDraftScreenshotCacheMaintenance
} from './videoSessionDraftScreenshotCache';
import { finalizeVideoSessionTerminalDraft } from './videoSessionDraftTerminal';
import {
  hasPersistedSessionDraftRevision,
  SessionDraftEnvelopeSchema,
  type SessionDraftSelectAndClaimResult,
  type SessionDraftStatus,
  type SessionDraftTerminalStatus,
  type VideoSessionDraftEnvelope,
  type SessionDraftEnvelope as PersistedSessionDraftEnvelope
} from '@shared/sessionDrafts';
import { createSessionDraftLeaseLifecycle } from '../sessionDrafts/sessionDraftTabContext';
export class VideoSessionDraftController implements VideoSessionDraftRuntimePort {
  private readonly draftRepository = createSessionDraftRepository(this.options.storageArea, {
    retentionPolicy: this.options.sessionDraftStoragePolicy?.retentionPolicy
  });
  private readonly draftId = createVideoSessionDraftId();
  private readonly draftPersister: SessionDraftPersister;
  private readonly screenshotCacheMaintenance = createVideoSessionDraftScreenshotCacheMaintenance(
    this.options.screenshotCache
  );
  private activeDraftPageUrl: string;
  private pendingDraftStatus: SessionDraftStatus = 'active';
  private restoredDraftKey: string | null = null;
  private legacyMigration: LoadedStoredVideoCaptureData['migration'] | null = null;
  private legacyMigrationRequestId: string | null = null;
  private stopDraftPersistence: (() => void) | null = null;
  private screenshotHydrationGeneration = 0;
  private readonly leaseLifecycle = createSessionDraftLeaseLifecycle({
    mode: 'video',
    repository: this.draftRepository,
    ...(this.options.leaseOwnerRegistry ? { registry: this.options.leaseOwnerRegistry } : {}),
    warningPrefix: '[VideoSession]',
    onAccepted: () => undefined
  });
  private initialClaimedDraft: VideoSessionDraftEnvelope | undefined;
  constructor(private readonly options: VideoSessionDraftControllerOptions) {
    this.activeDraftPageUrl = this.options.doc.location.href;
    this.initialClaimedDraft = options.initialClaimedDraft;
    if (options.initialClaimedDraft) {
      if (!hasPersistedSessionDraftRevision(options.initialClaimedDraft)) {
        throw new Error('SESSION_DRAFT_REVISION_INVALID');
      }
      this.draftRepository.adoptClaimed(
        SessionDraftEnvelopeSchema.parse(options.initialClaimedDraft)
      );
      this.acceptPersistedEnvelope(options.initialClaimedDraft);
    }
    this.draftPersister = createSessionDraftPersister<
      VideoSessionDraftEnvelope,
      PersistedSessionDraftEnvelope
    >({
      repository: this.draftRepository,
      buildEnvelope: () => this.buildDraftEnvelope(),
      onPersistedEnvelope: (envelope) => this.acceptPersistedEnvelope(envelope)
    });
  }
  isTrackingPageUrl(url: string): boolean {
    return this.activeDraftPageUrl === url;
  }
  updateActivePageUrl(url: string): void {
    this.activeDraftPageUrl = url;
  }
  clearRestoredDraftKey(): void {
    this.restoredDraftKey = null;
  }
  syncCommentDrafts(): Record<string, string> {
    return syncVideoSessionCommentDraftsFromDom(this.options.state, this.options.dom);
  }
  bindPersistence(): void {
    this.stopDraftPersistence?.();
    this.screenshotCacheMaintenance.pruneExpiredOnce();
    const view = this.options.doc.defaultView;
    if (!view) {
      return;
    }
    const flushActive = () => void this.flushNow('active');
    const flushRestorable = () => void this.flushNow('restorable');
    const pruneToLimits = () => this.screenshotCacheMaintenance.pruneToLimitsBestEffort();
    const stop = bindVideoSessionDraftPersistence(view, flushRestorable, flushActive);
    view.addEventListener('pagehide', pruneToLimits, { passive: true });
    this.stopDraftPersistence = () => {
      stop();
      view.removeEventListener('pagehide', pruneToLimits);
      this.stopDraftPersistence = null;
    };
  }
  async dispose(options: { flush?: boolean } = {}): Promise<void> {
    this.stopDraftPersistence?.();
    this.screenshotHydrationGeneration += 1;
    this.screenshotCacheMaintenance.pruneToLimitsBestEffort();
    await this.draftPersister.dispose(options);
    await this.leaseLifecycle.release();
  }
  async restoreDraftState(): Promise<boolean> {
    const restoreTimer = createFeatureTimer();
    const initialClaimedDraft = this.initialClaimedDraft;
    this.initialClaimedDraft = undefined;
    const parsedInitial = initialClaimedDraft
      ? SessionDraftEnvelopeSchema.safeParse(initialClaimedDraft)
      : null;
    if (parsedInitial && !parsedInitial.success) {
      throw new Error('SESSION_DRAFT_REVISION_INVALID');
    }
    if (parsedInitial?.success) this.draftRepository.adoptClaimed(parsedInitial.data);
    const selected: SessionDraftSelectAndClaimResult = parsedInitial?.success
      ? {
          outcome: 'claimed',
          revision: parsedInitial.data.revision,
          envelope: parsedInitial.data,
          selectionReason: 'restorable',
          invalidRemovedCount: 0
        }
      : await this.draftRepository.selectAndClaim({
          operation: 'selectAndClaim',
          requestId:
            typeof globalThis.crypto?.randomUUID === 'function'
              ? globalThis.crypto.randomUUID()
              : `video-claim-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          mode: 'video',
          pageUrl: this.options.doc.location.href
        });
    if (selected.outcome === 'conflict' || selected.outcome === 'recovery_failed') {
      throw new Error(selected.code);
    }
    const candidates =
      selected.outcome === 'claimed' && selected.envelope?.mode === 'video'
        ? [selected.envelope]
        : [];
    const draft = pickVideoSessionDraftCandidate(candidates);
    if (!draft) {
      this.restoredDraftKey = null;
      this.screenshotHydrationGeneration += 1;
      return false;
    }
    let telemetryCaptures = readVideoDraftRestoreTelemetryCaptures(draft);
    try {
      const hydrated = hydrateVideoSessionDraft(
        draft.payload as VideoSessionDraftPayloadShape,
        this.options.doc.location.href
      );
      telemetryCaptures = hydrated.captures;
      this.options.state.captures = hydrated.captures;
      applyVideoSessionCommentDrafts(this.options.state, hydrated.commentDrafts, {
        hydrateDom: true,
        dom: this.options.dom
      });
      this.options.state.platform = hydrated.platform;
      this.options.state.videoId = hydrated.videoId;
      this.options.state.videoUrl = hydrated.videoUrl || this.options.doc.location.href;
      this.options.state.canonicalUrl = hydrated.canonicalUrl || this.options.state.videoUrl;
      this.options.state.videoTitle =
        hydrated.videoTitle || this.options.state.videoTitle || this.options.doc.title;
      this.options.destinationState.applyMetadata(hydrated.destination);
      this.restoredDraftKey = createVideoSessionDraftStorageKey(draft.pageUrl, draft.draftId);
      if (!hasPersistedSessionDraftRevision(draft)) {
        throw new Error('SESSION_DRAFT_REVISION_INVALID');
      }
      this.acceptPersistedEnvelope(draft);
      this.legacyMigration = null;
      this.legacyMigrationRequestId = null;
      const generation = ++this.screenshotHydrationGeneration;
      const captures = this.options.state.captures;
      scheduleVideoDraftScreenshotHydration({
        captures,
        restoreTimer,
        options: this.options,
        isCurrent: () =>
          generation === this.screenshotHydrationGeneration &&
          this.options.state.captures === captures,
        scheduleSave: () => this.scheduleSave()
      });
      return true;
    } catch (error) {
      trackVideoDraftRestoreEvent(
        this.options.trackDraftRestoreEvent,
        buildVideoDraftRestoreTelemetryParams({
          captures: telemetryCaptures,
          outcome: 'failed',
          restoreTimer
        })
      );
      throw error;
    }
  }
  handleLegacyRestore(capture: LoadedStoredVideoCaptureData): void {
    this.legacyMigration = capture.migration;
    this.legacyMigrationRequestId = createLegacyVideoMigrationRequestId();
  }
  async scheduleSave(): Promise<void> {
    if (!this.buildDraftEnvelope()) {
      await this.remove();
      return;
    }
    if (this.legacyMigration) {
      const envelope = this.buildDraftEnvelope();
      if (!envelope) return;
      await this.persistLegacyMigration(envelope);
    } else {
      await this.draftPersister.scheduleSave();
    }
    try {
      await this.clearSupersededDurableSources();
    } catch (error) {
      this.logSupersededDurableCleanupError(error);
    }
  }

  async flushNow(status: SessionDraftStatus = 'active'): Promise<VideoHintState | null> {
    this.pendingDraftStatus = status;
    const cleanupState = this.options.readCleanupState();
    try {
      const result = await flushVideoSessionDraftNow({
        state: this.options.state,
        isCleaningUp: cleanupState.isCleaningUp,
        syncCommentDrafts: () => this.syncCommentDrafts(),
        buildDraftEnvelope: () => this.buildDraftEnvelope(),
        removeDraft: () => this.remove(),
        draftPersister: this.draftPersister,
        persistDraft: () =>
          status === 'restorable'
            ? settleSessionDraftPersister(this.draftPersister, async () => {
                if (!this.leaseLifecycle.current) await this.persistDraftNow();
                await this.leaseLifecycle.release();
              })
            : this.persistDraftNow(),
        clearSupersededDurableSources: () => this.clearSupersededDurableSources(),
        trackSavingState: status === 'active' && cleanupState.shouldTrackSavingState,
        onPostSaveCleanupError: (error) => this.logSupersededDurableCleanupError(error)
      });
      return result;
    } catch {
      return 'failure';
    } finally {
      this.pendingDraftStatus = 'active';
    }
  }

  async remove(): Promise<void> {
    const keys = new Set<string>([
      createVideoSessionDraftStorageKey(this.activeDraftPageUrl, this.draftId)
    ]);
    if (this.restoredDraftKey) {
      keys.add(this.restoredDraftKey);
    }
    await Promise.all(Array.from(keys).map((key) => this.draftRepository.remove({ key })));
    this.leaseLifecycle.clear();
    this.restoredDraftKey = null;
    this.legacyMigration = null;
    this.legacyMigrationRequestId = null;
    this.screenshotHydrationGeneration += 1;
  }

  async finalizeTerminal(status: SessionDraftTerminalStatus): Promise<boolean> {
    this.syncCommentDrafts();
    const hasTerminalTarget =
      this.options.state.captures.length > 0 ||
      Object.keys(this.options.state.commentDrafts).length > 0 ||
      this.options.destinationState.metadata !== undefined ||
      this.restoredDraftKey !== null ||
      this.legacyMigration !== null;
    if (!hasTerminalTarget) {
      return true;
    }
    this.leaseLifecycle.stop(true);
    const finalized = await finalizeVideoSessionTerminalDraft({
      status,
      repository: this.draftRepository,
      flushPendingDraft: async () => {
        const result = await this.flushNow('active');
        if (result === 'failure') {
          throw new Error('SESSION_DRAFT_TERMINAL_FLUSH_FAILED');
        }
      },
      restoredDraftKey: this.restoredDraftKey,
      buildEnvelope: (options) => this.buildDraftEnvelope(options),
      cleanupTerminalDrafts: () =>
        cleanupVideoDraftTerminalArtifacts({
          removeDraft: () => this.remove(),
          captures: this.options.state.captures,
          screenshotCache: this.options.screenshotCache
        })
    });
    if (finalized.outcome === 'completed') {
      this.leaseLifecycle.clear();
    } else if (
      finalized.latestCommittedEnvelope?.lease &&
      finalized.latestCommittedEnvelope.mode === 'video'
    ) {
      this.acceptPersistedEnvelope(finalized.latestCommittedEnvelope);
    } else if (this.leaseLifecycle.current?.lease) {
      this.acceptPersistedEnvelope(this.leaseLifecycle.current);
    }
    return finalized.outcome === 'completed';
  }

  private buildDraftEnvelope(
    options: {
      status?: SessionDraftStatus;
      draftId?: string;
      pageUrl?: string;
      allowEmpty?: boolean;
    } = {}
  ): VideoSessionDraftEnvelope | null {
    return buildVideoDraftEnvelopeFromRuntime(
      this.options,
      {
        draftId: this.draftId,
        activePageUrl: this.activeDraftPageUrl,
        pendingStatus: this.pendingDraftStatus
      },
      options
    );
  }
  private async clearSupersededDurableSources(): Promise<void> {
    const currentDraftKey = createVideoSessionDraftStorageKey(
      this.activeDraftPageUrl,
      this.draftId
    );
    if (this.restoredDraftKey && this.restoredDraftKey !== currentDraftKey) {
      await this.draftRepository.remove({ key: this.restoredDraftKey });
      this.restoredDraftKey = null;
    }
  }

  private async persistDraftNow(): Promise<void> {
    if (this.legacyMigration) {
      const envelope = this.buildDraftEnvelope();
      if (envelope) await this.persistLegacyMigration(envelope);
      return;
    }
    await flushVideoSessionDraftPersister(this.draftPersister);
  }

  private async persistLegacyMigration(envelope: VideoSessionDraftEnvelope): Promise<void> {
    const migration = this.legacyMigration;
    if (!migration) return;
    const result = await persistLegacyVideoCaptureMigration({
      repository: this.draftRepository,
      migration,
      requestId: (this.legacyMigrationRequestId ??= createLegacyVideoMigrationRequestId()),
      envelope
    });
    this.acceptPersistedEnvelope(result.envelope);
    if (!result.cleanupPending) {
      this.legacyMigration = null;
      this.legacyMigrationRequestId = null;
    } else {
      this.logSupersededDurableCleanupError(new Error('MIGRATION_CLEANUP_PENDING'));
    }
  }

  private logSupersededDurableCleanupError(error: unknown): void {
    console.warn('[VideoSession] Failed to clear superseded durable draft sources:', error);
  }

  private acceptPersistedEnvelope(
    envelope: Parameters<typeof this.leaseLifecycle.accept>[0]
  ): void {
    this.leaseLifecycle.accept(envelope);
  }
}
