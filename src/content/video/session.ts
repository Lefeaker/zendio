import { generateTextFragmentUrl } from '../clipper/utils/textFragment';
import type { PageI18nController, Messages } from '../../i18n';
import { ensureContentI18n, getContentI18nResource, getContentMessages } from '../i18n/context';
import { loadFragmentConfig } from '../clipper/services/fragmentConfig';
import type { FragmentClipperOptions } from '../../shared/types/options';
import type { ReaderHighlightTheme, StoredOptions } from '../../shared/types/options';
import type { VideoFragmentCapture, VideoTimestampCapture } from './types';
import type {
  TimestampBuildContext,
  VideoPlatformAdapter,
  VideoPlatformContext
} from './platforms';
import { FragmentHighlighter, DEFAULT_HIGHLIGHT_THEME, resolveHighlightTheme } from './fragmentHighlighter';
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
import { createVideoSessionDependencies, type VideoSessionPlatformDependencies } from './sessionDependencies';
import { VideoSessionState } from './sessionState';
import { VideoSessionPlatformController } from './sessionPlatformController';
import { VideoSessionDomController } from './sessionDom';
import {
  clearVideoSession,
  isVideoSessionActive,
  registerVideoSession
} from '../runtime/contentSessionRegistry';

let defaultVideoSessionDependencies: VideoSessionDependencies | null = null;

export function initializeDefaultVideoSessionDependencies(platform: VideoSessionPlatformDependencies): VideoSessionDependencies {
  const dependencies = createVideoSessionDependencies(platform);
  defaultVideoSessionDependencies = dependencies;
  return dependencies;
}

function getDefaultVideoSessionDependencies(): VideoSessionDependencies {
  if (!defaultVideoSessionDependencies) {
    throw new Error('VideoSession dependencies have not been initialized');
  }
  return defaultVideoSessionDependencies;
}

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

  constructor(
    private readonly doc: Document,
    private readonly dependencies: VideoSessionDependencies = getDefaultVideoSessionDependencies()
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
        this.state.captures.filter((capture): capture is VideoFragmentCapture => capture.kind === 'fragment'),
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
      onSelectionActivated: (payload) => this.fragmentSelectionController.processActivatedSelection(payload),
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

    const highlightThemePromise = this.loadHighlightTheme().catch(() => DEFAULT_HIGHLIGHT_THEME);
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

      const applyOptions = (nextOptions?: StoredOptions) => {
        if (!nextOptions || !Object.prototype.hasOwnProperty.call(nextOptions, 'readingSession')) {
          return;
        }
        const highlightTheme = resolveHighlightTheme(
          (nextOptions.readingSession as { highlightTheme?: unknown } | undefined)?.highlightTheme
        );
        this.state.highlightTheme = highlightTheme;
        this.applyHighlightTheme(highlightTheme);
        this.fragmentHighlightCoordinator.scheduleRestore();
      };

      void this.dependencies.optionsRepository.get()
        .then((value) => {
          applyOptions(value as StoredOptions);
        })
        .catch((error) => {
          console.warn('[VideoSession] Failed to preload highlight theme options:', error);
        });
      this.state.stopOptionsWatcher = this.dependencies.optionsRepository.onChange((value) => {
        applyOptions(value as StoredOptions);
      });

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
    if (this.state.exporting || this.state.saving) {
      return;
    }

    this.updateVideoContext();

    const video = this.state.videoElement ?? this.findVideoElement();
    if (!video) {
      this.applyHint('noVideo');
      return;
    }

    const currentTime = Math.floor(video.currentTime || 0);
    if (!Number.isFinite(currentTime) || currentTime < 0) {
      this.applyHint('failure');
      return;
    }

    const shareUrl = this.buildTimestampUrl(currentTime);
    if (!shareUrl) {
      this.applyHint('failure');
      return;
    }

    const capture: VideoTimestampCapture = {
      kind: 'timestamp',
      id: `aiob-video-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timeSec: currentTime,
      comment: '',
      url: shareUrl,
      createdAt: Date.now()
    };

    this.state.captures.push(capture);
    this.syncPanel();
    this.applyHint('saving');
    await this.saveCaptures();
    this.syncPanel();
    this.dom.beginEditingCapture(capture.id, capture.comment);
  }

  ingestTextCapture(selectedHtml: string, selectedText: string, comment: string, selectionRange?: Range): void {
    this.updateVideoContext();
    const normalizedText = selectedText.replace(/\s+/g, ' ').trim();
    if (!normalizedText) {
      return;
    }

    const commentTrimmed = comment.trim();
    const now = Date.now();
    const fragmentUrl = generateTextFragmentUrl(this.state.canonicalUrl || this.doc.location.href, normalizedText);
    const capture: VideoFragmentCapture = {
      kind: 'fragment',
      id: `aiob-video-fragment-${now}-${Math.random().toString(16).slice(2)}`,
      comment: commentTrimmed,
      selectedText: normalizedText,
      selectedHtml,
      fragmentUrl,
      createdAt: now
    };

    if (selectionRange) {
      try {
        const cloned = selectionRange.cloneRange();
        const wrapperId =
          this.state.platformAdapter?.highlight(cloned, capture.id, fragmentUrl) ??
          this.fragmentHighlighter.highlightRange(cloned, capture.id, fragmentUrl);
        if (wrapperId !== undefined) {
          capture.wrapperId = wrapperId;
        }
      } catch (error) {
        console.warn('[VideoSession] Failed to highlight selection range:', error);
      }
    }
    if (!capture.wrapperId) {
      try {
        const newWrapperId = this.state.platformAdapter?.restoreHighlight(capture);
        if (newWrapperId !== undefined) {
          capture.wrapperId = newWrapperId;
        }
      } catch (error) {
        console.warn('[VideoSession] Failed to ensure fragment highlight:', error);
      }
    }

    this.state.captures.push(capture);
    this.fragmentHighlightCoordinator.start();
    this.fragmentHighlightCoordinator.scheduleRestore();
    this.syncPanel();
    this.focusCapture(capture.id);
    this.applyHint('saving');
    this.dom.beginEditingCapture(capture.id, capture.comment);
    void this.saveCaptures().then(() => {
      this.syncPanel();
    }).catch((error) => {
      console.warn('[VideoSession] Failed to save fragment capture:', error);
      this.applyHint('failure');
    });
  }

  private async submitCaptureEdit(id: string, comment: string): Promise<void> {
    const target = this.state.captures.find((capture) => capture.id === id);
    if (!target) {
      return;
    }
    target.comment = comment.trim();
    this.applyHint('saving');
    await this.saveCaptures();
    this.syncPanel();
    this.dom.stopEditing();
  }

  private removeCapture(id: string): void {
    const index = this.state.captures.findIndex((capture) => capture.id === id);
    if (index === -1) {
      return;
    }
    const [removed] = this.state.captures.splice(index, 1);
    if (removed?.kind === 'fragment' && removed.wrapperId) {
      this.fragmentHighlighter.removeById(removed.wrapperId);
    }
    void this.saveCaptures().then(() => {
      this.syncPanel();
    }).catch((error) => {
      console.warn('[VideoSession] Failed to save captures after removal:', error);
      this.applyHint('failure');
    });
  }

  private focusCapture(id: string): void {
    const target = this.state.captures.find((capture) => capture.id === id);
    if (!target) {
      return;
    }
    if (target.kind === 'timestamp') {
      this.focusTimestampCapture(target);
    } else {
      this.focusFragmentCapture(target);
    }
  }

  private focusTimestampCapture(capture: VideoTimestampCapture): void {
    this.seekVideoTo(capture.timeSec);
  }

  private focusFragmentCapture(capture: VideoFragmentCapture): void {
    this.ensureCaptureHighlight(capture);
    if (capture.wrapperId) {
      const element = this.fragmentHighlighter.getElementByIdDeep(capture.wrapperId);
      if (element) {
        this.fragmentHighlighter.decorateElement(element);
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        element.classList.add('aiob-reader-highlight--focus');
        window.setTimeout(() => element.classList.remove('aiob-reader-highlight--focus'), 1600);
        this.fragmentHighlightCoordinator.scheduleRestore();
        return;
      }
    }
    this.highlightFragmentText(capture.selectedText);
  }

  private seekVideoTo(timeSec: number): void {
    const video = this.state.videoElement ?? this.findVideoElement();
    if (!video) {
      this.applyHint('noVideo');
      return;
    }
    try {
      video.currentTime = timeSec;
      const playResult = video.play();
      void Promise.resolve(playResult).catch(() => {
        // Ignore play promise rejection (e.g. autoplay policy)
      });
    } catch (error) {
      console.warn('[VideoSession] Failed to seek video:', error);
    }
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

  private async loadHighlightTheme(): Promise<ReaderHighlightTheme> {
    try {
      const options = await this.dependencies.optionsRepository.get();
      const highlightTheme = (options.readingSession as { highlightTheme?: unknown } | undefined)?.highlightTheme;
      return resolveHighlightTheme(highlightTheme);
    } catch (error) {
      console.warn('[VideoSession] Failed to load highlight theme, using default:', error);
      return DEFAULT_HIGHLIGHT_THEME;
    }
  }

  private applyHighlightTheme(theme: ReaderHighlightTheme): void {
    this.fragmentHighlighter.setTheme(theme);
    const wrapperIds = this.state.captures
      .filter((capture): capture is VideoFragmentCapture => capture.kind === 'fragment')
      .map((capture) => capture.wrapperId)
      .filter((id): id is string => Boolean(id));
    if (wrapperIds.length) {
      this.fragmentHighlighter.decorateExisting(wrapperIds);
    }
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

  private async saveCaptures(): Promise<void> {
    const hintState = await this.platformController.saveCaptures();
    if (hintState) {
      this.applyHint(hintState);
    }
  }

  private syncPanel(): void {
    const totalCount = this.dom.syncPanel(this.state, (capture) => this.getFragmentElement(capture));
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
    try {
      const resource = getContentI18nResource();
      const msgs = resource?.messages ?? await getContentMessages();
      this.applyMessagesFromLocale(msgs);
    } catch (error) {
      console.warn('[video-session] Failed to load i18n messages:', error);
      this.applyDefaultMessages();
    }
  }

  private applyMessagesFromLocale(msgs: Messages): void {
    this.messages = {
      panel: {
        title: msgs.videoPanelTitle,
        status: msgs.videoPanelStatus,
        counter: msgs.videoPanelCounter,
        counterZero: msgs.videoPanelCounterZero,
        add: msgs.videoPanelAdd,
        finish: msgs.videoPanelFinish,
        cancel: msgs.videoPanelCancel,
        hint: msgs.videoPanelHint,
        captureEditLabel: msgs.videoCaptureEditLabel,
        captureDeleteLabel: msgs.videoCaptureDeleteLabel,
        captureNoComment: msgs.videoCaptureNoComment,
        captureSaveLabel: msgs.videoCaptureSaveLabel,
        captureCancelLabel: msgs.videoCaptureCancelLabel,
        captureEditPlaceholder: msgs.videoCaptureEditPlaceholder,
        captureFocusLabel: msgs.videoCaptureFocusLabel
      },
      hintNoVideo: msgs.videoHintNoVideo,
      hintReady: msgs.videoHintReady,
      hintNoCaptures: msgs.videoHintNoCaptures,
      hintSaving: msgs.videoHintSaving,
      hintExporting: msgs.videoHintExporting,
      hintFailure: msgs.videoHintFailure,
      timestampSectionTitle: msgs.videoTimestampSectionTitle,
      fragmentSectionTitle: msgs.videoFragmentSectionTitle
    };

    this.dom.updateTexts(this.messages.panel);
    this.refreshHint();
  }

  private applyDefaultMessages(): void {
    this.messages = {
      panel: { ...DEFAULT_SESSION_MESSAGES.panel },
      hintNoVideo: DEFAULT_SESSION_MESSAGES.hintNoVideo,
      hintReady: DEFAULT_SESSION_MESSAGES.hintReady,
      hintNoCaptures: DEFAULT_SESSION_MESSAGES.hintNoCaptures,
      hintSaving: DEFAULT_SESSION_MESSAGES.hintSaving,
      hintExporting: DEFAULT_SESSION_MESSAGES.hintExporting,
      hintFailure: DEFAULT_SESSION_MESSAGES.hintFailure,
      timestampSectionTitle: DEFAULT_SESSION_MESSAGES.timestampSectionTitle,
      fragmentSectionTitle: DEFAULT_SESSION_MESSAGES.fragmentSectionTitle
    };

    this.dom.updateTexts(this.messages.panel);
    this.refreshHint();
  }

  private setupLanguageWatcher(): void {
    this.state.stopLanguageWatcher?.();
    this.state.stopLanguageWatcher = this.dependencies.storage.sync.watchKey<string>('language', () => {
      void this.refreshMessages();
    });
  }

  private async loadFragmentConfig(): Promise<void> {
    try {
      this.state.fragmentConfig = await loadFragmentConfig(this.dependencies.optionsRepository);
    } catch (error) {
      console.warn('[VideoSession] Failed to load fragment config:', error);
      this.state.fragmentConfig = null;
    }
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
    const element = container.nodeType === Node.ELEMENT_NODE
      ? container as Element
      : container.parentElement;

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
    if (this.state.exporting || this.state.saving) {
      return;
    }
    if (!this.state.captures.length) {
      this.applyHint('noCaptures');
      return;
    }

    this.updateVideoContext();

    this.state.exporting = true;
    this.applyHint('exporting');

    try {
      const result = await this.exporter.export({
        captures: this.state.captures,
        videoTitle: this.state.videoTitle,
        canonicalUrl: this.state.canonicalUrl || '',
        videoUrl: this.state.videoUrl,
        platform: this.state.platform,
        messages: this.messages,
        storageKey: this.state.storageKey
      });
      if (!result.success) {
        throw new Error(result.error ?? 'Video clip failed');
      }
      this.cleanup();
    } catch (error) {
      console.error('[VideoSession] Export failed:', error);
      this.applyHint('failure');
      this.state.exporting = false;
    }
  }

  private cancel(): void {
    if (this.state.exporting) {
      return;
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.lifecycle.stop();
    this.state.stopOptionsWatcher?.();
    this.state.stopOptionsWatcher = null;
    this.state.stopLanguageWatcher?.();
    this.state.stopLanguageWatcher = null;
    this.state.controller = null;
    this.fragmentHighlightCoordinator.updateAdapter(null);
    this.fragmentHighlightCoordinator.stop();
    this.platformController.dispose();
    this.fragmentHighlighter.reset();
    this.shadowSelectionBridge.reset();
    this.pendingSelection.reset();
    this.state.suppressSelectionCapture = false;
    this.selectionCaptureController.stop();
    this.fragmentSelectionController.handleWindowBlur();
    this.dom.destroy();

    clearVideoSession(this, this.doc);
    this.state.videoElement = null;
    this.state.exporting = false;
    this.state.saving = false;
    this.hintManager.apply('noVideo', { videoAvailable: false, hasCaptures: false });

    for (const capture of this.state.captures) {
      if (capture.kind === 'fragment' && capture.wrapperId) {
        this.fragmentHighlighter.removeById(capture.wrapperId);
      }
    }
    this.state.captures = [];
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
