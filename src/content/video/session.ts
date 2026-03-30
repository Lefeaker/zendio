import type { PageI18nController } from '../../i18n';
import { ensureContentI18n } from '../i18n/context';
import type { FragmentClipperOptions } from '../../shared/types/options';
import type { ReaderHighlightTheme } from '../../shared/types/options';
import type { VideoFragmentCapture, VideoTimestampCapture } from './types';
import type {
  TimestampBuildContext,
  VideoPlatformAdapter,
  VideoPlatformContext
} from './platforms';
import {
  FragmentHighlighter,
  DEFAULT_HIGHLIGHT_THEME,
  resolveHighlightTheme
} from './fragmentHighlighter';
import { PendingSelectionTracker } from './pendingSelectionTracker';
import { ShadowSelectionBridge } from './shadowSelectionBridge';
import { FragmentHighlightCoordinator } from './fragmentHighlightCoordinator';
import { SelectionCaptureController } from './selectionCaptureController';
import { VideoSessionLifecycle } from './sessionLifecycle';
import { VideoSessionExporter } from './videoSessionExporter';
import { DEFAULT_SESSION_MESSAGES, type VideoSessionMessages } from './sessionMessages';
import { VideoHintManager, type VideoHintState } from './videoHintManager';
import { VideoFragmentSelectionController } from './videoFragmentSelectionController';
import type { VideoSessionDependencies } from './sessionTypes';
import { VideoSessionState } from './sessionState';
import { VideoSessionPlatformController } from './sessionPlatformController';
import { VideoSessionDomController } from './sessionDom';
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
  submitVideoSessionCaptureEdit,
  watchVideoSessionHighlightTheme
} from './sessionOperations';
import {
  loadVideoSessionFragmentConfig,
  loadVideoSessionMessages,
  watchVideoSessionLanguage
} from './sessionLocalization';

export class VideoSession {
  private readonly state = new VideoSessionState(DEFAULT_HIGHLIGHT_THEME);
  private messages: VideoSessionMessages = DEFAULT_SESSION_MESSAGES;
  private hintManager: VideoHintManager;
  private fragmentHighlighter: FragmentHighlighter;
  private pendingSelection = new PendingSelectionTracker();
  private shadowSelectionBridge: ShadowSelectionBridge;
  private fragmentHighlightCoordinator: FragmentHighlightCoordinator;
  private selectionCaptureController: SelectionCaptureController;
  private fragmentSelectionController: VideoFragmentSelectionController;
  private lifecycle: VideoSessionLifecycle;
  private exporter: VideoSessionExporter;
  private platformController: VideoSessionPlatformController;
  private dom: VideoSessionDomController;

  private get operationContext() {
    return {
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
      updateVideoContext: () => this.updateVideoContext(),
      findVideoElement: () => this.findVideoElement(),
      buildTimestampUrl: (timeSec: number) => this.buildTimestampUrl(timeSec),
      applyHint: (state: VideoHintState) => this.applyHint(state),
      syncPanel: () => this.syncPanel(),
      ensureCaptureHighlight: (capture: VideoFragmentCapture) =>
        this.ensureCaptureHighlight(capture),
      getSelectionForNode: (node: Node | null) => this.getSelectionForNode(node),
      highlightFragmentText: (text: string) => this.highlightFragmentText(text)
    };
  }

  constructor(
    private readonly doc: Document,
    private readonly dependencies: VideoSessionDependencies
  ) {
    this.fragmentHighlighter = new FragmentHighlighter(doc);
    this.hintManager = new VideoHintManager(() => this.messages);
    this.shadowSelectionBridge = new ShadowSelectionBridge({
      suppressSelectionCapture: () => this.state.suppressSelectionCapture,
      getDocumentSelection: () => this.getDocumentSelection(),
      isRangeInsideUi: (range) => this.isRangeInsideUi(range),
      pendingSelection: this.pendingSelection
    });
    this.fragmentHighlightCoordinator = new FragmentHighlightCoordinator({
      doc,
      highlighter: this.fragmentHighlighter,
      getFragments: () =>
        this.state.captures.filter(
          (capture): capture is VideoFragmentCapture => capture.kind === 'fragment'
        ),
      ensureCaptureHighlight: (capture) => this.ensureCaptureHighlight(capture)
    });
    this.fragmentSelectionController = new VideoFragmentSelectionController(
      {
        doc,
        pendingSelection: this.pendingSelection,
        getFragmentConfig: () => this.state.fragmentConfig,
        getPlatformAdapter: () => this.state.platformAdapter
      },
      {
        onSelectionAccepted: ({ selectedHtml, selectedText, range }) => {
          this.ingestTextCapture(selectedHtml, selectedText, '', range ?? undefined);
        }
      }
    );
    this.selectionCaptureController = new SelectionCaptureController({
      doc,
      pendingSelection: this.pendingSelection,
      suppressSelectionCapture: () => this.state.suppressSelectionCapture,
      isRangeInsideUi: (range) => this.isRangeInsideUi(range),
      getDocumentSelection: () => this.getDocumentSelection(),
      onSelectionActivated: (payload) =>
        this.fragmentSelectionController.processActivatedSelection(payload),
      onSelectionCleared: () => {
        // no-op for now; handled by fragment selection controller when needed
      }
    });
    this.lifecycle = new VideoSessionLifecycle(
      {
        doc,
        locateVideoElement: () => this.findVideoElement()
      },
      {
        onUrlChange: () => this.handleUrlChange(),
        onVideoElementChange: (element) => this.handleVideoElementChange(element)
      }
    );
    this.exporter = new VideoSessionExporter(this.dependencies.videoRepository);
    this.platformController = new VideoSessionPlatformController({
      doc,
      storage: this.dependencies.storage.local,
      state: this.state,
      createPlatformContext: () => this.createPlatformContext(),
      onAdapterChange: (adapter) => this.fragmentHighlightCoordinator.updateAdapter(adapter),
      ensureCaptureHighlight: (capture) => this.ensureCaptureHighlight(capture)
    });
    this.dom = new VideoSessionDomController(doc, this.dependencies.viewFactory, this.hintManager);
  }

  private createPlatformContext(): VideoPlatformContext {
    return {
      doc: this.doc,
      highlightSelection: (range, captureId, fragmentUrl) =>
        this.fragmentHighlighter.highlightRange(range, captureId, fragmentUrl),
      decorateHighlight: (element) => this.fragmentHighlighter.decorateElement(element),
      scheduleFragmentHighlightRestore: () => this.fragmentHighlightCoordinator.scheduleRestore(),
      getElementByIdDeep: (id) => this.fragmentHighlighter.getElementByIdDeep(id),
      querySelectorDeep: (selector) => this.fragmentHighlighter.querySelectorDeep(selector),
      observeWithFragmentObserver: (target, options) => {
        this.fragmentHighlightCoordinator.start();
        this.fragmentHighlightCoordinator.observeWithCoordinator(target, options);
      },
      registerShadowSelectionBridge: (root) => this.shadowSelectionBridge.register(root),
      ensureHighlightStyles: (root) => this.fragmentHighlighter.ensureHighlightStyles(root)
    };
  }

  async start(): Promise<void> {
    if (isVideoSessionActive(this.doc)) {
      this.applyHint('ready');
      return;
    }

    const highlightThemePromise = loadVideoSessionHighlightTheme(this.dependencies).catch(
      () => DEFAULT_HIGHLIGHT_THEME
    );
    await this.dom.waitForDocumentReady();
    registerVideoSession(this, this.doc);

    this.state.controller = await ensureContentI18n(this.doc);
    this.state.controller.registerDynamic(() => {
      void this.refreshMessages();
    });
    await this.refreshMessages();
    this.setupLanguageWatcher();
    await this.loadFragmentConfig();
    this.dom.registerInteractionHandlers({
      onMouseDown: this.handleMouseDown,
      onKeyDown: this.handleKeyDown,
      onKeyUp: this.handleKeyUp,
      onWindowBlur: this.handleWindowBlur
    });
    this.selectionCaptureController.start();
    this.fragmentHighlightCoordinator.start();

    try {
      const [highlightTheme] = await Promise.all([highlightThemePromise]);

      this.state.highlightTheme = highlightTheme;
      this.applyHighlightTheme(this.state.highlightTheme);
      this.dom.mountPanel(
        {
          onAddCapture: () => void this.handleAddCapture(),
          onFinish: () => void this.finish(),
          onCancel: () => this.cancel(),
          onDeleteCapture: (id) => this.removeCapture(id),
          onSubmitCaptureEdit: (id, comment) => this.submitCaptureEdit(id, comment),
          onFocusCapture: (id) => this.focusCapture(id)
        },
        this.messages.panel
      );
      this.applyHint('noVideo');

      this.platformController.updateVideoContext();
      this.platformController.syncPlatformAdapter();
      this.state.videoTitle = this.platformController.extractVideoTitle();
      void this.refreshContext();

      this.lifecycle.start();

      watchVideoSessionHighlightTheme(this.operationContext, (highlightTheme) =>
        this.applyHighlightTheme(highlightTheme)
      );

      this.fragmentHighlightCoordinator.start();
      if (this.state.captures.some((capture) => capture.kind === 'fragment')) {
        this.fragmentHighlightCoordinator.scheduleRestore();
      }

      console.info('[VideoSession] Panel mounted and session ready.');
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  private updateVideoContext(): void {
    this.platformController.updateVideoContext();
  }

  private handleUrlChange(): void {
    this.platformController.updateVideoContext();
    this.platformController.syncPlatformAdapter();
    this.state.videoTitle = this.platformController.extractVideoTitle();
    void this.refreshContext();
  }

  private handleVideoElementChange(element: HTMLVideoElement | null): void {
    if (!element) {
      if (this.state.videoElement) {
        this.state.videoElement = null;
        this.applyHint('noVideo');
      }
      return;
    }
    if (this.state.videoElement === element) {
      return;
    }
    this.state.videoElement = element;
    this.applyHint(this.state.captures.length ? 'ready' : 'noCaptures');
  }

  private syncPlatformAdapter(): void {
    this.platformController.syncPlatformAdapter();
  }

  private async refreshContext(): Promise<void> {
    const result = await this.platformController.refreshContext();
    this.applyHint(result.hintState);
    this.syncPanel();
    this.fragmentHighlightCoordinator.start();
    if (result.shouldScheduleFragmentRestore) {
      this.fragmentHighlightCoordinator.scheduleRestore();
    }
  }

  private extractVideoTitle(): string {
    return this.platformController.extractVideoTitle();
  }

  private findVideoElement(): HTMLVideoElement | null {
    return this.doc.querySelector('video');
  }

  private async handleAddCapture(): Promise<void> {
    await handleVideoSessionAddCapture(this.operationContext);
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

  private async submitCaptureEdit(id: string, comment: string): Promise<void> {
    await submitVideoSessionCaptureEdit(this.operationContext, id, comment);
  }

  private removeCapture(id: string): void {
    removeVideoSessionCapture(this.operationContext, id);
  }

  private focusCapture(id: string): void {
    focusVideoSessionCapture(this.operationContext, id);
  }

  private highlightFragmentText(text: string): void {
    const range = this.state.platformAdapter?.findTextRange(text) ?? null;
    if (!range) {
      return;
    }
    const selection = this.getSelectionForNode(range.startContainer);
    if (!selection) {
      return;
    }
    this.state.suppressSelectionCapture = true;
    try {
      selection.removeAllRanges();
      selection.addRange(range);
    } finally {
      window.setTimeout(() => {
        this.state.suppressSelectionCapture = false;
      }, 0);
    }
  }

  private applyHighlightTheme(theme: ReaderHighlightTheme): void {
    applyVideoSessionHighlightTheme(this.state, this.fragmentHighlighter, theme);
  }

  private getDocumentSelection(): Selection | null {
    if (typeof this.doc.getSelection === 'function') {
      const selection = this.doc.getSelection();
      if (selection) {
        return selection;
      }
    }
    const view = this.doc.defaultView ?? window;
    if (typeof view.getSelection === 'function') {
      return view.getSelection();
    }
    return null;
  }

  private getSelectionForNode(node: Node | null): Selection | null {
    const selection = this.getDocumentSelection();
    if (!selection || !node || typeof node.getRootNode !== 'function') {
      return selection;
    }
    const selectionRoot = selection.anchorNode?.getRootNode?.();
    const targetRoot = node.getRootNode();
    if (selectionRoot && targetRoot && selectionRoot !== targetRoot) {
      return selection;
    }
    return selection;
  }

  private syncPanel(): void {
    const totalCount = this.dom.syncPanel(this.state, (capture) =>
      this.getFragmentElement(capture)
    );
    if (!this.state.videoElement) {
      this.applyHint('noVideo');
    } else {
      this.applyHint(totalCount ? 'ready' : 'noCaptures');
    }
  }

  private getFragmentElement(capture: VideoFragmentCapture): HTMLElement | null {
    this.ensureCaptureHighlight(capture);
    if (!capture.wrapperId) {
      return null;
    }
    const node = this.fragmentHighlighter.getElementByIdDeep(capture.wrapperId);
    return node instanceof HTMLElement ? node : null;
  }

  private ensureCaptureHighlight(capture: VideoFragmentCapture): void {
    const existing = capture.wrapperId
      ? this.fragmentHighlighter.getElementByIdDeep(capture.wrapperId)
      : null;
    if (existing && existing.isConnected) {
      this.fragmentHighlighter.decorateElement(existing);
      return;
    }
    const newWrapperId = this.state.platformAdapter?.restoreHighlight(capture);
    if (newWrapperId !== undefined) {
      capture.wrapperId = newWrapperId;
      this.fragmentHighlighter.decorateById(newWrapperId);
    }
  }

  private async refreshMessages(): Promise<void> {
    this.messages = await loadVideoSessionMessages(
      (panelMessages) => this.dom.updateTexts(panelMessages),
      () => this.refreshHint()
    );
  }

  private setupLanguageWatcher(): void {
    this.state.stopLanguageWatcher?.();
    this.state.stopLanguageWatcher = watchVideoSessionLanguage(this.dependencies.storage, () => {
      void this.refreshMessages();
    });
  }

  private async loadFragmentConfig(): Promise<void> {
    this.state.fragmentConfig = await loadVideoSessionFragmentConfig(
      this.dependencies.optionsRepository
    );
  }

  private handleMouseDown = (event: MouseEvent): void => {
    this.fragmentSelectionController.handleMouseDown(event);
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    this.fragmentSelectionController.handleKeyDown(event);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.fragmentSelectionController.handleKeyUp(event);
  };

  private handleWindowBlur = (): void => {
    this.fragmentSelectionController.handleWindowBlur();
  };

  private isRangeInsideUi(range: Range | null): boolean {
    if (!range) {
      return false;
    }
    const container = range.commonAncestorContainer;
    const element =
      container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;

    if (!element) {
      return false;
    }

    return Boolean(element.closest('#aiob-video-panel'));
  }

  private applyHint(state: VideoHintState): void {
    this.dom.applyHint(state, this.state);
  }

  private refreshHint(): void {
    this.dom.refreshHint(this.state);
  }

  private buildTimestampUrl(timeSec: number): string | null {
    return this.platformController.buildTimestampUrl(timeSec);
  }

  private buildFallbackTimestampUrl(timeSec: number, ctx: TimestampBuildContext): string | null {
    return VideoSessionPlatformController.buildFallbackTimestampUrl(timeSec, ctx);
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

  private get panel(): null {
    return null;
  }

  private get captures() {
    return this.state.captures;
  }

  private set captures(value) {
    this.state.captures = value;
  }

  private get videoElement() {
    return this.state.videoElement;
  }

  private set videoElement(value) {
    this.state.videoElement = value;
  }

  private get storageKey() {
    return this.state.storageKey;
  }

  private set storageKey(value) {
    this.state.storageKey = value;
  }

  private get videoTitle() {
    return this.state.videoTitle;
  }

  private set videoTitle(value) {
    this.state.videoTitle = value;
  }

  private get videoUrl() {
    return this.state.videoUrl;
  }

  private set videoUrl(value) {
    this.state.videoUrl = value;
  }

  private get platform() {
    return this.state.platform;
  }

  private set platform(value) {
    this.state.platform = value;
  }

  private get videoId() {
    return this.state.videoId;
  }

  private set videoId(value) {
    this.state.videoId = value;
  }

  private get canonicalUrl() {
    return this.state.canonicalUrl;
  }

  private set canonicalUrl(value) {
    this.state.canonicalUrl = value;
  }

  private get panelPresenter(): null {
    return null;
  }

  private get exporting() {
    return this.state.exporting;
  }

  private set exporting(value) {
    this.state.exporting = value;
  }

  private get saving() {
    return this.state.saving;
  }

  private set saving(value) {
    this.state.saving = value;
  }

  private get highlightTheme() {
    return this.state.highlightTheme;
  }

  private set highlightTheme(value) {
    this.state.highlightTheme = value;
  }

  private get stopOptionsWatcher() {
    return this.state.stopOptionsWatcher;
  }

  private set stopOptionsWatcher(value) {
    this.state.stopOptionsWatcher = value;
  }

  private get stopLanguageWatcher() {
    return this.state.stopLanguageWatcher;
  }

  private set stopLanguageWatcher(value) {
    this.state.stopLanguageWatcher = value;
  }

  private get controller(): PageI18nController | null {
    return this.state.controller;
  }

  private set controller(value: PageI18nController | null) {
    this.state.controller = value;
  }

  private get suppressSelectionCapture() {
    return this.state.suppressSelectionCapture;
  }

  private set suppressSelectionCapture(value) {
    this.state.suppressSelectionCapture = value;
  }

  private get platformAdapter(): VideoPlatformAdapter | null {
    return this.state.platformAdapter;
  }

  private set platformAdapter(value: VideoPlatformAdapter | null) {
    this.state.platformAdapter = value;
  }

  private get fragmentConfig(): FragmentClipperOptions | null {
    return this.state.fragmentConfig;
  }

  private set fragmentConfig(value: FragmentClipperOptions | null) {
    this.state.fragmentConfig = value;
  }
}
