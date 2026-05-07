import type { ReaderHighlightTheme } from '../../shared/types/options';
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
  cancelVideoSession,
  cleanupVideoSession,
  finishVideoSession,
  focusVideoSessionCapture,
  handleVideoSessionAddCapture,
  ingestVideoSessionTextCapture,
  loadVideoSessionHighlightTheme,
  removeVideoSessionCapture,
  submitVideoSessionCaptureEdit
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
  private controllersReadyPromise: Promise<void> | null = null;

  private get operationContext() {
    return createVideoSessionOperationContext({
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
      getExportDestinationMetadata: () => this.destinationState.metadata
    });
  }

  constructor(
    private readonly doc: Document,
    private readonly dependencies: VideoSessionDependencies
  ) {
    this.destinationState = new ContentExportDestinationState(
      this.dependencies.optionsRepository,
      () => this.createDestinationPayload(),
      this.dependencies.optionsPageUrl
    );
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
          findVideoElement: () => this.doc.querySelector('video'),
          handleUrlChange: () => this.handleUrlChange(),
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
      })
      .finally(() => {
        this.controllersReadyPromise = null;
      });

    return this.controllersReadyPromise;
  }

  async start(): Promise<void> {
    await this.ensureControllers();

    if (isVideoSessionActive(this.doc)) {
      this.applyHint('ready');
      return;
    }

    const highlightThemePromise = loadVideoSessionHighlightTheme(this.dependencies).catch(
      () => DEFAULT_HIGHLIGHT_THEME
    );
    await this.dom.waitForDocumentReady();
    registerVideoSession(this, this.doc);

    await initializeVideoSessionEnvironment({
      doc: this.doc,
      state: this.state,
      dependencies: this.dependencies,
      dom: this.dom,
      interactionHandlers: {
        onMouseDown: (event) => this.fragmentSelectionController.handleMouseDown(event),
        onKeyDown: (event) => this.fragmentSelectionController.handleKeyDown(event),
        onKeyUp: (event) => this.fragmentSelectionController.handleKeyUp(event),
        onWindowBlur: () => this.fragmentSelectionController.handleWindowBlur()
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
        platformController: this.platformController,
        lifecycle: this.lifecycle,
        operationContext: this.operationContext,
        fragmentHighlightCoordinator: this.fragmentHighlightCoordinator,
        highlightThemePromise,
        panelCallbacks: {
          onAddCapture: (source) => void this.handleAddCapture(source),
          onFinish: () => void this.finish(),
          onCancel: () => this.cancel(),
          onSelectDestination: (id) => this.selectDestination(id),
          onDeleteCapture: (id) => removeVideoSessionCapture(this.operationContext, id),
          onSubmitCaptureEdit: (id, comment) =>
            void submitVideoSessionCaptureEdit(this.operationContext, id, comment),
          onFocusCapture: (id) => focusVideoSessionCapture(this.operationContext, id)
        },
        applyHighlightTheme: (theme) => this.applyHighlightTheme(theme),
        applyHint: (state) => this.applyHint(state),
        refreshContext: () => this.refreshContext()
      });
      await this.refreshDestinationPreview();
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  private handleUrlChange(): void {
    handleVideoSessionUrlChange({
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
  }

  private async refreshContext(): Promise<void> {
    await refreshVideoSessionContext({
      platformController: this.platformController,
      applyHint: (state) => this.applyHint(state),
      syncPanel: () => this.syncPanel(),
      fragmentHighlightCoordinator: this.fragmentHighlightCoordinator
    });
  }

  private async refreshDestinationPreview(): Promise<void> {
    const preview = await this.destinationState.refresh();
    this.dom.updateDestination(preview);
  }

  private async selectDestination(id: string): Promise<void> {
    this.destinationState.select(id);
    await this.refreshDestinationPreview();
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
    options: {
      comment?: string;
      captureScreenshot?: boolean;
      pauseVideo?: boolean;
      beginEditing?: boolean;
      resumePlayback?: boolean;
      collapseAfterCapture?: boolean;
    } = {}
  ): Promise<void> {
    await this.handleAddCapture(source, options);
  }

  private async handleAddCapture(
    source: VideoAddCaptureSource = 'button',
    options: {
      comment?: string;
      captureScreenshot?: boolean;
      pauseVideo?: boolean;
      beginEditing?: boolean;
      resumePlayback?: boolean;
      collapseAfterCapture?: boolean;
    } = {}
  ): Promise<void> {
    await handleVideoSessionAddCapture(this.operationContext, {
      pauseVideo: source === 'note-input',
      ...options
    });
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
    cancelVideoSession(this.operationContext);
  }

  private cleanup(): void {
    cleanupVideoSession(this.operationContext);
  }
}
