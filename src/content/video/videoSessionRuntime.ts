import type { ReaderHighlightTheme } from '../../shared/types/options';
import {
  createSessionDraftPersister,
  createSessionDraftRepository,
  type VideoSessionDraftEnvelope,
  type SessionDraftPersister,
  type SessionDraftStatus
} from '../sessionDrafts';
import type { VideoAddCaptureSource } from './application/videoPanelModel';
import type { VideoFragmentCapture } from './types';
import { FragmentHighlighter, DEFAULT_HIGHLIGHT_THEME } from './fragmentHighlighter';
import { DEFAULT_SESSION_MESSAGES, type VideoSessionMessages } from './sessionMessages';
import { VideoHintManager, type VideoHintState } from './videoHintManager';
import type { VideoSessionDependencies } from './sessionTypes';
import { VideoSessionState } from './sessionState';
import {
  getSelectionForVideoNode,
  getVideoDocumentSelection,
  highlightVideoFragmentText,
  isVideoRangeInsideUi,
  resolveVideoHintState
} from './videoSessionSelection';
import { isVideoSessionActive, registerVideoSession } from '../runtime/contentSessionRegistry';
import {
  applyVideoSessionHighlightTheme,
  beginVideoSessionAnalytics,
  cancelVideoSession,
  cleanupVideoSession,
  finishVideoSession,
  focusVideoSessionCapture,
  handleVideoSessionAddCapture,
  ingestVideoSessionTextCapture,
  loadVideoSessionHighlightTheme,
  removeVideoSessionCapture,
  submitVideoSessionCaptureEdit,
  toggleVideoSessionCaptureScreenshot
} from './sessionOperations';
import {
  finalizeVideoSessionStart,
  initializeVideoSessionEnvironment
} from './videoSessionBootstrap';
import { createVideoSessionOperationContext } from './videoSessionOperationContext';
import {
  ensureVideoSessionCaptureHighlight,
  getVideoSessionFragmentElement,
  syncVideoSessionPanel
} from './videoSessionPanelState';
import {
  handleVideoSessionUrlChange,
  handleVideoSessionVideoElementChange,
  refreshVideoSessionContext
} from './videoSessionContextRefresh';
import { createVideoSessionPlatformContext } from './videoSessionPlatformContext';
import type { PendingSelectionTracker } from './pendingSelectionTracker';
import type { ShadowSelectionBridge } from './shadowSelectionBridge';
import type { FragmentHighlightCoordinator } from './fragmentHighlightCoordinator';
import type { SelectionCaptureController } from './selectionCaptureController';
import type { VideoSessionLifecycle } from './sessionLifecycle';
import type { VideoSessionExporter } from './videoSessionExporter';
import type { VideoFragmentSelectionController } from './videoFragmentSelectionController';
import type { VideoSessionPlatformController } from './sessionPlatformController';
import type { VideoSessionDomController } from './sessionDom';
import type { VideoSessionControllers } from './videoSessionControllers';
import { ContentExportDestinationState } from '../shared/exportDestinationState';
import type { ClipPayload } from '../../shared/types';
import { VideoCommentEditorPlaybackController } from './videoCommentEditorPlaybackController';
import {
  buildVideoSessionDraftPayload,
  createVideoSessionDraftEnvelope,
  createVideoSessionDraftId,
  createVideoSessionDraftStorageKey,
  hydrateVideoSessionDraft,
  pickVideoSessionDraftCandidate,
  type VideoSessionDraftPayloadShape
} from './sessionDrafts';
import {
  hasRequestedTimestampScreenshot,
  setRequestedTimestampScreenshot
} from './screenshotIntent';
import {
  createVideoScreenshotPreparationQueue,
  type VideoScreenshotPreparationQueue
} from './videoScreenshotPreparationQueue';
import type { VideoTimestampCapture } from './types';

type VideoSessionAddCaptureOptions = {
  comment?: string;
  captureScreenshot?: boolean;
  pauseVideo?: boolean;
  beginEditing?: boolean;
  resumePlayback?: boolean;
  collapseAfterCapture?: boolean;
};

export class VideoSession {
  private readonly state = new VideoSessionState(DEFAULT_HIGHLIGHT_THEME);
  private messages: VideoSessionMessages = DEFAULT_SESSION_MESSAGES;
  private hintManager!: VideoHintManager;
  private fragmentHighlighter!: FragmentHighlighter;
  private pendingSelection!: PendingSelectionTracker;
  private shadowSelectionBridge!: ShadowSelectionBridge;
  private fragmentHighlightCoordinator!: FragmentHighlightCoordinator;
  private selectionCaptureController!: SelectionCaptureController;
  private fragmentSelectionController!: VideoFragmentSelectionController;
  private lifecycle!: VideoSessionLifecycle;
  private exporter!: VideoSessionExporter;
  private platformController!: VideoSessionPlatformController;
  private dom!: VideoSessionDomController;
  private readonly destinationState: ContentExportDestinationState;
  private readonly commentEditorPlayback: VideoCommentEditorPlaybackController;
  private readonly draftRepository = createSessionDraftRepository(this.dependencies.storage.local);
  private readonly draftId = createVideoSessionDraftId();
  private readonly draftPersister: SessionDraftPersister;
  private activeDraftPageUrl: string;
  private pendingDraftStatus: SessionDraftStatus = 'active';
  private restoredDraftKey: string | null = null;
  private legacyCaptureStorageKey: string | null = null;
  private stopDraftPersistence: (() => void) | null = null;
  private controllersReadyPromise: Promise<void> | null = null;
  private requestedScreenshotPreparationQueue: VideoScreenshotPreparationQueue | null = null;
  private isCleaningUp = false;
  private readonly requestedScreenshotCache = new Map<
    string,
    NonNullable<VideoTimestampCapture['screenshot']>
  >();

  private get operationContext() {
    const context = createVideoSessionOperationContext({
      session: this,
      doc: this.doc,
      state: this.state,
      dependencies: this.dependencies,
      dom: this.dom,
      exporter: this.exporter,
      fragmentHighlighter: this.fragmentHighlighter,
      fragmentHighlightCoordinator: this.fragmentHighlightCoordinator,
      shadowSelectionBridge: this.shadowSelectionBridge,
      pendingSelection: this.pendingSelection,
      selectionCaptureController: this.selectionCaptureController,
      fragmentSelectionController: this.fragmentSelectionController,
      lifecycle: this.lifecycle,
      platformController: this.platformController,
      hintManager: this.hintManager,
      messages: this.messages,
      updateVideoContext: () => this.platformController.updateVideoContext(),
      findVideoElement: () => this.doc.querySelector('video'),
      buildTimestampUrl: (timeSec: number) => this.platformController.buildTimestampUrl(timeSec),
      applyHint: (state: VideoHintState) => this.applyHint(state),
      syncPanel: () => this.syncPanel(),
      ensureCaptureHighlight: (capture: VideoFragmentCapture) =>
        this.ensureCaptureHighlight(capture),
      getSelectionForNode: (node: Node | null) => getSelectionForVideoNode(this.doc, node),
      highlightFragmentText: (text: string) =>
        highlightVideoFragmentText({ doc: this.doc, state: this.state, text }),
      getExportDestinationMetadata: () => this.destinationState.metadata,
      prepareRequestedScreenshot: (captureId: string) => this.prepareRequestedScreenshot(captureId)
    });

    return Object.assign(context, {
      syncCommentDrafts: () => this.syncCommentDraftsFromDom(),
      scheduleDraftSave: () => this.scheduleDraftSave(),
      flushDraftNow: (status?: 'active' | 'restorable') => this.flushDraftNow(status),
      removeDraft: () => this.removeDraft(),
      beginPlaybackEditLease: (captureId: string) =>
        this.commentEditorPlayback.beginPlaybackEditLease(captureId),
      releasePlaybackEditLease: (captureId: string, restorePlayback: boolean) =>
        this.commentEditorPlayback.releaseForCapture(captureId, restorePlayback),
      resetPlaybackEditLease: () => this.commentEditorPlayback.reset()
    });
  }

  constructor(
    private readonly doc: Document,
    private readonly dependencies: VideoSessionDependencies
  ) {
    this.activeDraftPageUrl = this.doc.location.href;
    this.destinationState = new ContentExportDestinationState(
      this.dependencies.optionsRepository,
      () => this.createDestinationPayload(),
      this.dependencies.optionsPageUrl
    );
    this.commentEditorPlayback = new VideoCommentEditorPlaybackController({
      doc: this.doc,
      videoRepository: this.dependencies.videoRepository,
      findVideoElement: () => this.state.videoElement
    });
    this.draftPersister = createSessionDraftPersister<VideoSessionDraftEnvelope>({
      repository: this.draftRepository,
      buildEnvelope: () => this.buildDraftEnvelope()
    });
  }

  private async ensureControllers(): Promise<void> {
    if (this.controllersReadyPromise) {
      return this.controllersReadyPromise;
    }

    this.controllersReadyPromise = import('./videoSessionControllers')
      .then(({ createVideoSessionControllers }) => {
        const controllers: VideoSessionControllers = createVideoSessionControllers({
          doc: this.doc,
          dependencies: this.dependencies,
          state: this.state,
          getMessages: () => this.messages,
          createPlatformContext: () =>
            createVideoSessionPlatformContext({
              doc: this.doc,
              fragmentHighlighter: this.fragmentHighlighter,
              fragmentHighlightCoordinator: this.fragmentHighlightCoordinator,
              shadowSelectionBridge: this.shadowSelectionBridge
            }),
          getDocumentSelection: () => getVideoDocumentSelection(this.doc),
          isRangeInsideUi: (range) => isVideoRangeInsideUi(range),
          ensureCaptureHighlight: (capture) => this.ensureCaptureHighlight(capture),
          onSelectionAccepted: ({ selectedHtml, selectedText, range }) => {
            this.ingestTextCapture(selectedHtml, selectedText, '', range ?? undefined);
          },
          restoreDraftState: () => this.restoreDraftState(),
          onLegacyRestore: (storageKey) => this.handleLegacyRestore(storageKey),
          findVideoElement: () => this.doc.querySelector('video'),
          handleUrlChange: () => {
            void this.handleUrlChange();
          },
          handleVideoElementChange: (element) => this.handleVideoElementChange(element)
        });

        this.fragmentHighlighter = controllers.fragmentHighlighter;
        this.hintManager = controllers.hintManager;
        this.pendingSelection = controllers.pendingSelection;
        this.shadowSelectionBridge = controllers.shadowSelectionBridge;
        this.fragmentHighlightCoordinator = controllers.fragmentHighlightCoordinator;
        this.selectionCaptureController = controllers.selectionCaptureController;
        this.fragmentSelectionController = controllers.fragmentSelectionController;
        this.lifecycle = controllers.lifecycle;
        this.exporter = controllers.exporter;
        this.platformController = controllers.platformController;
        this.dom = controllers.dom;
        this.requestedScreenshotPreparationQueue = createVideoScreenshotPreparationQueue({
          doc: this.doc,
          getCaptures: () => this.getTimestampCaptures(),
          getVisibleVideo: () => this.state.videoElement,
          syncPanel: () => this.syncPanel()
        });
      })
      .finally(() => {
        this.controllersReadyPromise = null;
      });

    return this.controllersReadyPromise;
  }

  async start(options: { initialCollapsed?: boolean } = {}): Promise<void> {
    await this.ensureControllers();
    this.isCleaningUp = false;

    if (isVideoSessionActive(this.doc)) {
      this.applyHint('ready');
      return;
    }

    const highlightThemePromise = loadVideoSessionHighlightTheme(this.dependencies).catch(
      () => DEFAULT_HIGHLIGHT_THEME
    );
    await this.dom.waitForDocumentReady();
    await this.commentEditorPlayback.start();
    registerVideoSession(this, this.doc);

    await initializeVideoSessionEnvironment({
      doc: this.doc,
      state: this.state,
      dependencies: this.dependencies,
      dom: this.dom,
      interactionHandlers: {
        onMouseDown: (event) => {
          this.releasePlaybackEditLeaseOnOutsidePointer(event);
          this.fragmentSelectionController.handleMouseDown(event);
        },
        onKeyDown: (event) => this.fragmentSelectionController.handleKeyDown(event),
        onKeyUp: (event) => this.fragmentSelectionController.handleKeyUp(event),
        onWindowBlur: () => {
          this.commentEditorPlayback.reset({ preserveTransactions: true });
          this.fragmentSelectionController.handleWindowBlur();
        }
      },
      selectionCaptureController: this.selectionCaptureController,
      fragmentHighlightCoordinator: this.fragmentHighlightCoordinator,
      refreshHint: () => this.dom.refreshHint(this.state),
      updateMessages: (messages) => {
        this.messages = messages;
      },
      updatePanelTexts: (panelMessages) => {
        this.dom.updateTexts(panelMessages);
      }
    });

    try {
      await finalizeVideoSessionStart({
        state: this.state,
        dom: this.dom,
        messages: this.messages,
        initialCollapsed: Boolean(options.initialCollapsed),
        platformController: this.platformController,
        lifecycle: this.lifecycle,
        operationContext: this.operationContext,
        fragmentHighlightCoordinator: this.fragmentHighlightCoordinator,
        highlightThemePromise,
        panelCallbacks: {
          onAddCapture: (source) => this.handleAddCapture(source),
          onFinish: () => this.finish(),
          onCancel: () => this.cancel(),
          onSelectDestination: (id) => this.selectDestination(id),
          onDeleteCapture: (id) => removeVideoSessionCapture(this.operationContext, id),
          onSubmitCaptureEdit: (id, comment) =>
            submitVideoSessionCaptureEdit(this.operationContext, id, comment),
          onToggleScreenshot: (id) => void this.toggleCaptureScreenshot(id),
          onFocusCapture: (id) => focusVideoSessionCapture(this.operationContext, id),
          onCaptureEditorFocus: (id) => this.commentEditorPlayback.beginCommentEditorLease(id),
          onCaptureEditorBlur: (id, scope) => {
            if (scope === 'outside-panel') {
              this.commentEditorPlayback.releaseCommentEditorLease(id);
            }
          },
          onCaptureEditorCancel: (id) => this.commentEditorPlayback.releaseForCapture(id, false),
          onCommentDraftChange: (drafts) => {
            this.applyCommentDrafts(drafts);
            void this.scheduleDraftSave();
          }
        },
        applyHighlightTheme: (theme) => this.applyHighlightTheme(theme),
        applyHint: (state) => this.applyHint(state),
        refreshContext: () => this.refreshContext()
      });
      this.bindDraftPersistence();
      await this.refreshDestinationPreview();
    } catch (error) {
      this.cleanup();
      throw error;
    }

    beginVideoSessionAnalytics(this.operationContext);
  }

  private async handleUrlChange(): Promise<void> {
    if (this.activeDraftPageUrl !== this.doc.location.href) {
      await this.flushDraftNow('restorable');
    }
    await handleVideoSessionUrlChange({
      platformController: this.platformController,
      state: this.state,
      refreshContext: () => this.refreshContext()
    });
  }

  private handleVideoElementChange(element: HTMLVideoElement | null): void {
    handleVideoSessionVideoElementChange({
      element,
      state: this.state,
      applyHint: (state) => this.applyHint(state),
      resolveHintState: (videoAvailable, captureCount) =>
        resolveVideoHintState(videoAvailable, captureCount)
    });
    this.requestedScreenshotPreparationQueue?.handleVideoElementChange(element);
  }

  private async refreshContext(): Promise<void> {
    const result = await refreshVideoSessionContext({
      platformController: this.platformController,
      applyHint: (state) => this.applyHint(state),
      syncPanel: () => this.syncPanel(),
      fragmentHighlightCoordinator: this.fragmentHighlightCoordinator
    });
    this.activeDraftPageUrl = this.doc.location.href;
    if (result.restoreSource === 'legacy') {
      this.applyCommentDrafts({}, { hydrateDom: true });
      void this.scheduleDraftSave();
      this.requestedScreenshotPreparationQueue?.requestAll();
      await this.refreshDestinationPreview();
      return;
    }
    if (result.restoreSource === 'none') {
      this.restoredDraftKey = null;
      if (!this.state.captures.length) {
        this.applyCommentDrafts({}, { hydrateDom: true });
      }
    }
    this.requestedScreenshotPreparationQueue?.requestAll();
    await this.refreshDestinationPreview();
  }

  private async refreshDestinationPreview(): Promise<void> {
    const preview = await this.destinationState.refresh();
    this.dom.updateDestination(preview);
  }

  private releasePlaybackEditLeaseOnOutsidePointer(event: MouseEvent): void {
    if (this.dom.isEventInsidePanel(event)) {
      return;
    }
    this.commentEditorPlayback.releaseAll(true);
  }

  private async selectDestination(id: string): Promise<void> {
    this.destinationState.select(id);
    await this.refreshDestinationPreview();
    this.syncCommentDraftsFromDom();
    await this.scheduleDraftSave();
  }

  private bindDraftPersistence(): void {
    this.stopDraftPersistence?.();
    const view = this.doc.defaultView;
    if (!view) {
      return;
    }
    const flush = () => {
      void this.flushDraftNow('restorable');
    };
    view.addEventListener('pagehide', flush, { passive: true });
    view.addEventListener('beforeunload', flush, true);
    this.stopDraftPersistence = () => {
      view.removeEventListener('pagehide', flush);
      view.removeEventListener('beforeunload', flush, true);
      this.stopDraftPersistence = null;
    };
  }

  private buildDraftEnvelope(): VideoSessionDraftEnvelope | null {
    const commentDrafts = this.state.commentDrafts;
    if (
      this.state.captures.length === 0 &&
      Object.keys(commentDrafts).length === 0 &&
      this.destinationState.metadata === undefined
    ) {
      return null;
    }

    const pageUrl = this.activeDraftPageUrl || this.doc.location.href;
    const title = this.state.videoTitle || this.doc.title || 'Video Capture';
    return createVideoSessionDraftEnvelope({
      draftId: this.draftId,
      pageUrl,
      pageTitle: title,
      updatedAt: Date.now(),
      status: this.pendingDraftStatus,
      payload: buildVideoSessionDraftPayload({
        captures: this.state.captures,
        commentDrafts,
        ...(this.destinationState.metadata ? { destination: this.destinationState.metadata } : {}),
        platform: this.state.platform,
        videoId: this.state.videoId,
        videoUrl: this.state.videoUrl || pageUrl,
        canonicalUrl: this.state.canonicalUrl || pageUrl,
        videoTitle: title
      })
    });
  }

  private applyCommentDrafts(
    drafts: Record<string, string>,
    options: { hydrateDom?: boolean } = {}
  ): void {
    this.state.commentDrafts = { ...drafts };
    if (options.hydrateDom) {
      this.dom?.setCommentDrafts(this.state.commentDrafts);
    }
  }

  private syncCommentDraftsFromDom(): Record<string, string> {
    const drafts = this.dom.readCommentDrafts();
    this.applyCommentDrafts(drafts);
    return { ...this.state.commentDrafts };
  }

  private async restoreDraftState(): Promise<boolean> {
    const candidates = (await this.draftRepository.listCandidates(
      'video',
      this.doc.location.href
    )) as VideoSessionDraftEnvelope[];
    const draft = pickVideoSessionDraftCandidate(candidates);
    if (!draft) {
      this.restoredDraftKey = null;
      return false;
    }

    const hydrated = hydrateVideoSessionDraft(
      draft.payload as VideoSessionDraftPayloadShape,
      this.doc.location.href
    );
    this.state.captures = hydrated.captures;
    this.applyCommentDrafts(hydrated.commentDrafts, { hydrateDom: true });
    this.state.platform = hydrated.platform;
    this.state.videoId = hydrated.videoId;
    this.state.videoUrl = hydrated.videoUrl || this.doc.location.href;
    this.state.canonicalUrl = hydrated.canonicalUrl || this.state.videoUrl;
    this.state.videoTitle = hydrated.videoTitle || this.state.videoTitle || this.doc.title;
    this.destinationState.applyMetadata(hydrated.destination);
    this.restoredDraftKey = createVideoSessionDraftStorageKey(draft.pageUrl, draft.draftId);
    this.legacyCaptureStorageKey = null;
    this.requestedScreenshotPreparationQueue?.requestAll();
    return true;
  }

  private handleLegacyRestore(storageKey: string): void {
    this.legacyCaptureStorageKey = storageKey;
    this.applyCommentDrafts({}, { hydrateDom: true });
  }

  private async scheduleDraftSave(): Promise<void> {
    if (!this.buildDraftEnvelope()) {
      await this.removeDraft();
      return;
    }
    await this.draftPersister.scheduleSave();
    await this.clearSupersededDurableSources();
  }

  private async flushDraftNow(
    status: SessionDraftStatus = 'active'
  ): Promise<VideoHintState | null> {
    this.pendingDraftStatus = status;
    try {
      if (!this.isCleaningUp) {
        this.syncCommentDraftsFromDom();
      }
      if (!this.buildDraftEnvelope()) {
        await this.removeDraft();
        return this.state.captures.length ? 'ready' : 'noCaptures';
      }
      const pending = this.draftPersister.scheduleSave();
      await this.draftPersister.flushNow();
      await pending;
      await this.clearSupersededDurableSources();
      return this.state.captures.length ? 'ready' : 'noCaptures';
    } catch {
      return 'failure';
    } finally {
      this.pendingDraftStatus = 'active';
    }
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
      await this.dependencies.storage.local.remove(this.legacyCaptureStorageKey);
      this.legacyCaptureStorageKey = null;
    }
  }

  private async removeDraft(): Promise<void> {
    const keys = new Set<string>([
      createVideoSessionDraftStorageKey(this.activeDraftPageUrl, this.draftId)
    ]);
    if (this.restoredDraftKey) {
      keys.add(this.restoredDraftKey);
    }
    await Promise.all(Array.from(keys).map((key) => this.draftRepository.remove({ key })));
    if (this.legacyCaptureStorageKey) {
      await this.dependencies.storage.local.remove(this.legacyCaptureStorageKey);
    }
    this.restoredDraftKey = null;
    this.legacyCaptureStorageKey = null;
  }

  private getTimestampCaptures(): VideoTimestampCapture[] {
    return this.state.captures.filter(
      (capture): capture is VideoTimestampCapture => capture.kind === 'timestamp'
    );
  }

  private createDestinationPayload(): ClipPayload {
    const pageUrl = this.state.canonicalUrl || this.state.videoUrl || this.doc.location.href;
    const parsedUrl = this.parseUrl(pageUrl);
    const title = this.state.videoTitle || this.doc.title || parsedUrl?.hostname || 'Video Capture';
    return {
      markdown: title,
      title,
      type: 'video',
      meta: {
        url: pageUrl,
        sourceUrl: this.state.videoUrl || pageUrl,
        videoUrl: this.state.videoUrl || pageUrl,
        platform: this.state.platform,
        ...(parsedUrl?.hostname ? { domain: parsedUrl.hostname } : {})
      }
    };
  }

  private parseUrl(url: string): URL | null {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }

  ingestTextCapture(
    selectedHtml: string,
    selectedText: string,
    comment: string,
    selectionRange?: Range
  ): void {
    ingestVideoSessionTextCapture(
      this.operationContext,
      selectedHtml,
      selectedText,
      comment,
      selectionRange
    );
  }

  async addCurrentTimestamp(
    source: VideoAddCaptureSource = 'button',
    options: VideoSessionAddCaptureOptions = {}
  ): Promise<void> {
    await this.handleAddCapture(source, options);
  }

  async toggleCaptureScreenshot(id: string): Promise<void> {
    this.cacheRequestedScreenshot(id);
    await toggleVideoSessionCaptureScreenshot(this.operationContext, id);
  }

  private cacheRequestedScreenshot(id: string): void {
    const capture = this.findTimestampCapture(id);
    if (capture?.screenshot) {
      this.requestedScreenshotCache.set(id, capture.screenshot);
    }
  }

  private prepareRequestedScreenshot(id: string): void {
    const capture = this.findTimestampCapture(id);
    if (!capture || !hasRequestedTimestampScreenshot(capture) || capture.screenshot) {
      return;
    }

    const cachedScreenshot = this.requestedScreenshotCache.get(id);
    if (!cachedScreenshot) {
      this.requestedScreenshotPreparationQueue?.request(id);
      return;
    }

    setRequestedTimestampScreenshot(capture, cachedScreenshot);
    this.syncPanel();
  }

  private findTimestampCapture(id: string): VideoTimestampCapture | null {
    return (
      this.state.captures.find(
        (capture): capture is VideoTimestampCapture =>
          capture.kind === 'timestamp' && capture.id === id
      ) ?? null
    );
  }

  private async handleAddCapture(
    source: VideoAddCaptureSource = 'button',
    options: VideoSessionAddCaptureOptions = {}
  ): Promise<void> {
    const pauseVideo = options.pauseVideo ?? source === 'note-input';
    const capture = await handleVideoSessionAddCapture(this.operationContext, {
      ...options,
      pauseVideo
    });
    if (capture && pauseVideo && options.beginEditing !== false) {
      this.commentEditorPlayback.markAddNoteTransaction(capture.id);
    }
  }

  private applyHighlightTheme(theme: ReaderHighlightTheme): void {
    applyVideoSessionHighlightTheme(this.state, this.fragmentHighlighter, theme);
  }

  private syncPanel(): void {
    syncVideoSessionPanel({
      dom: this.dom,
      state: this.state,
      getFragmentElement: (capture) => this.getFragmentElement(capture),
      applyHint: (state) => this.applyHint(state)
    });
  }

  private getFragmentElement(capture: VideoFragmentCapture): HTMLElement | null {
    return getVideoSessionFragmentElement({
      capture,
      fragmentHighlighter: this.fragmentHighlighter,
      ensureCaptureHighlight: (nextCapture) => this.ensureCaptureHighlight(nextCapture)
    });
  }

  private ensureCaptureHighlight(capture: VideoFragmentCapture): void {
    ensureVideoSessionCaptureHighlight({
      capture,
      fragmentHighlighter: this.fragmentHighlighter,
      restoreHighlight: (nextCapture) => this.state.platformAdapter?.restoreHighlight(nextCapture)
    });
  }

  private applyHint(state: VideoHintState): void {
    this.dom.applyHint(state, this.state);
  }

  private async finish(): Promise<void> {
    await finishVideoSession(this.operationContext, () => this.cleanup());
  }

  private cancel(): void {
    void cancelVideoSession(this.operationContext);
  }

  private cleanup(): void {
    this.isCleaningUp = true;
    this.requestedScreenshotPreparationQueue?.dispose();
    this.requestedScreenshotPreparationQueue = null;
    this.stopDraftPersistence?.();
    void this.draftPersister.dispose();
    this.commentEditorPlayback.dispose();
    this.requestedScreenshotCache.clear();
    cleanupVideoSession(this.operationContext);
  }
}
