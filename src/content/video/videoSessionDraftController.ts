import { VIDEO_TITLE_FALLBACK } from '../../i18n/catalog/runtimeFallbackMessages';
import {
  createSessionDraftPersister,
  createSessionDraftRepository,
  finalizeTerminalSessionDraft,
  type SessionDraftPersister,
  type SessionDraftStatus,
  type SessionDraftTerminalStatus,
  type VideoSessionDraftEnvelope
} from '../sessionDrafts';
import {
  buildVideoSessionDraftPayload,
  createVideoSessionDraftEnvelope,
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
import type { VideoCapture } from './types';
import type { VideoHintState } from './videoHintManager';
import {
  applyVideoSessionCommentDrafts,
  bindVideoSessionDraftPersistence,
  flushVideoSessionDraftNow,
  syncVideoSessionCommentDraftsFromDom
} from './videoSessionDraftSync';
import { cleanupVideoDraftTerminalArtifacts } from './videoSessionDraftScreenshotCache';
import { scheduleRestoredVideoDraftScreenshotHydration } from './videoSessionDraftScreenshotHydration';
import { buildVideoTerminalEnvelopeForExactKey } from './videoSessionDraftTerminal';

export class VideoSessionDraftController implements VideoSessionDraftRuntimePort {
  private readonly draftRepository = createSessionDraftRepository(this.options.storageArea);
  private readonly draftId = createVideoSessionDraftId();
  private readonly draftPersister: SessionDraftPersister;
  private activeDraftPageUrl: string;
  private pendingDraftStatus: SessionDraftStatus = 'active';
  private restoredDraftKey: string | null = null;
  private legacyCaptureStorageKey: string | null = null;
  private stopDraftPersistence: (() => void) | null = null;
  private screenshotHydrationGeneration = 0;

  constructor(private readonly options: VideoSessionDraftControllerOptions) {
    this.activeDraftPageUrl = this.options.doc.location.href;
    this.draftPersister = createSessionDraftPersister<VideoSessionDraftEnvelope>({
      repository: this.draftRepository,
      buildEnvelope: () => this.buildDraftEnvelope()
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
    const view = this.options.doc.defaultView;
    if (!view) {
      return;
    }
    const flush = () => {
      void this.flushNow('restorable');
    };
    const stop = bindVideoSessionDraftPersistence(view, flush);
    this.stopDraftPersistence = () => {
      stop();
      this.stopDraftPersistence = null;
    };
  }

  async dispose(options: { flush?: boolean } = {}): Promise<void> {
    this.stopDraftPersistence?.();
    this.screenshotHydrationGeneration += 1;
    await this.draftPersister.dispose(options);
  }

  async restoreDraftState(): Promise<boolean> {
    const candidates = (await this.draftRepository.listCandidates(
      'video',
      this.options.doc.location.href
    )) as VideoSessionDraftEnvelope[];
    const draft = pickVideoSessionDraftCandidate(candidates);
    if (!draft) {
      this.restoredDraftKey = null;
      this.screenshotHydrationGeneration += 1;
      return false;
    }

    const hydrated = hydrateVideoSessionDraft(
      draft.payload as VideoSessionDraftPayloadShape,
      this.options.doc.location.href
    );
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
    this.legacyCaptureStorageKey = null;
    this.scheduleRestoredScreenshotHydration(this.options.state.captures);
    return true;
  }

  handleLegacyRestore(storageKey: string): void {
    this.legacyCaptureStorageKey = storageKey;
  }

  async scheduleSave(): Promise<void> {
    if (!this.buildDraftEnvelope()) {
      await this.remove();
      return;
    }
    await this.draftPersister.scheduleSave();
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
      return await flushVideoSessionDraftNow({
        state: this.options.state,
        isCleaningUp: cleanupState.isCleaningUp,
        syncCommentDrafts: () => this.syncCommentDrafts(),
        buildDraftEnvelope: () => this.buildDraftEnvelope(),
        removeDraft: () => this.remove(),
        draftPersister: this.draftPersister,
        clearSupersededDurableSources: () => this.clearSupersededDurableSources(),
        trackSavingState: status === 'active' && cleanupState.shouldTrackSavingState,
        onPostSaveCleanupError: (error) => this.logSupersededDurableCleanupError(error)
      });
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
    if (this.legacyCaptureStorageKey) {
      await this.options.storageArea.remove(this.legacyCaptureStorageKey);
    }
    this.restoredDraftKey = null;
    this.legacyCaptureStorageKey = null;
    this.screenshotHydrationGeneration += 1;
  }

  async finalizeTerminal(status: SessionDraftTerminalStatus): Promise<boolean> {
    this.syncCommentDrafts();

    const hasTerminalTarget =
      this.options.state.captures.length > 0 ||
      Object.keys(this.options.state.commentDrafts).length > 0 ||
      this.options.destinationState.metadata !== undefined ||
      this.restoredDraftKey !== null ||
      this.legacyCaptureStorageKey !== null;
    if (!hasTerminalTarget) {
      return true;
    }

    const currentEnvelope = this.buildDraftEnvelope({
      status,
      allowEmpty: true
    });
    const terminalEnvelopes = new Map<string, VideoSessionDraftEnvelope>();

    if (currentEnvelope) {
      terminalEnvelopes.set(
        createVideoSessionDraftStorageKey(currentEnvelope.pageUrl, currentEnvelope.draftId),
        currentEnvelope
      );
    }

    if (this.restoredDraftKey) {
      const restoredEnvelope = await buildVideoTerminalEnvelopeForExactKey(
        this.options.storageArea,
        this.restoredDraftKey,
        status,
        (options) => this.buildDraftEnvelope(options)
      );
      if (restoredEnvelope) {
        terminalEnvelopes.set(this.restoredDraftKey, restoredEnvelope);
      }
    }

    return finalizeTerminalSessionDraft<VideoSessionDraftEnvelope>({
      repository: this.draftRepository,
      buildTerminalEnvelopes: () => terminalEnvelopes.values(),
      cleanupTerminalDrafts: () =>
        cleanupVideoDraftTerminalArtifacts({
          removeDraft: () => this.remove(),
          captures: this.options.state.captures,
          screenshotCache: this.options.screenshotCache
        }),
      onSaveError: (error) => {
        console.warn('[VideoSession] Failed to finalize terminal session draft:', error);
      },
      onCleanupError: (error) => {
        console.warn(
          '[VideoSession] Failed to remove terminal session draft after finalization:',
          error
        );
      }
    });
  }

  private buildDraftEnvelope(
    options: {
      status?: SessionDraftStatus;
      draftId?: string;
      pageUrl?: string;
      allowEmpty?: boolean;
    } = {}
  ): VideoSessionDraftEnvelope | null {
    if (
      !options.allowEmpty &&
      this.options.state.captures.length === 0 &&
      Object.keys(this.options.state.commentDrafts).length === 0 &&
      this.options.destinationState.metadata === undefined
    ) {
      return null;
    }

    const pageUrl = (options.pageUrl ?? this.activeDraftPageUrl) || this.options.doc.location.href;
    const title = this.options.state.videoTitle || this.options.doc.title || VIDEO_TITLE_FALLBACK;
    return createVideoSessionDraftEnvelope({
      draftId: options.draftId ?? this.draftId,
      pageUrl,
      pageTitle: title,
      updatedAt: Date.now(),
      status: options.status ?? this.pendingDraftStatus,
      payload: buildVideoSessionDraftPayload({
        captures: this.options.state.captures,
        commentDrafts: this.options.state.commentDrafts,
        ...(this.options.destinationState.metadata
          ? { destination: this.options.destinationState.metadata }
          : {}),
        platform: this.options.state.platform,
        videoId: this.options.state.videoId,
        videoUrl: this.options.state.videoUrl || pageUrl,
        canonicalUrl: this.options.state.canonicalUrl || pageUrl,
        videoTitle: title
      })
    });
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
    if (this.legacyCaptureStorageKey) {
      await this.options.storageArea.remove(this.legacyCaptureStorageKey);
      this.legacyCaptureStorageKey = null;
    }
  }

  private logSupersededDurableCleanupError(error: unknown): void {
    console.warn('[VideoSession] Failed to clear superseded durable draft sources:', error);
  }

  private scheduleRestoredScreenshotHydration(captures: VideoCapture[]): void {
    const generation = ++this.screenshotHydrationGeneration;
    scheduleRestoredVideoDraftScreenshotHydration({
      captures,
      screenshotCache: this.options.screenshotCache,
      isCurrent: () =>
        generation === this.screenshotHydrationGeneration &&
        this.options.state.captures === captures,
      onScreenshotHydrationStart: this.options.onScreenshotHydrationStart,
      onScreenshotHydrationChange: this.options.onScreenshotHydrationChange,
      onScreenshotHydrationSettled: this.options.onScreenshotHydrationSettled,
      scheduleSave: () => this.scheduleSave()
    });
  }
}
