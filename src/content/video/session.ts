import { InlineStyleManager } from '../clipper/shared/styleManager';
import { formatDateTime } from '../clipper/utils/datetime';
import { generateTextFragmentUrl } from '../clipper/utils/textFragment';
import { escapeQuotes } from '../shared/markdown';
import { getMessages } from '../../i18n';
import { VIDEO_STYLES } from './styles';
import type {
  VideoPanelCapture,
  VideoPanelTexts
} from './application/videoPanelModel';
import type {
  VideoSessionView,
  VideoSessionViewFactory
} from './application/videoSessionView';
import { createVideoPanelViewFactory } from './presentation/videoPanelView';
import { detectVideoIdentity, VIDEO_STORAGE_PREFIX, type VideoIdentity, type VideoPlatform } from './utils';
import { buildReaderHighlightsMarkdown } from '../reader/utils/markdownBuilder';
import type { ReaderHighlightTheme, StoredOptions } from '../../shared/types/options';

interface StoredVideoTimestampEntry {
  kind?: 'timestamp';
  id: string;
  timeSec: number;
  comment: string;
  url: string;
  createdAt: number;
}

interface StoredVideoFragmentEntry {
  kind: 'fragment';
  id: string;
  timeSec?: number;
  comment: string;
  selectedText: string;
  selectedHtml: string;
  fragmentUrl: string;
  createdAt: number;
  wrapperId?: string;
}

type StoredVideoCaptureEntry = StoredVideoTimestampEntry | StoredVideoFragmentEntry;

interface StoredVideoCaptureData {
  title?: string;
  url?: string;
  entries: StoredVideoCaptureEntry[];
  updatedAt: number;
}

interface VideoTimestampCapture {
  kind: 'timestamp';
  id: string;
  timeSec: number;
  url: string;
  comment: string;
  createdAt: number;
}

interface VideoFragmentCapture {
  kind: 'fragment';
  id: string;
  timeSec?: number;
  comment: string;
  selectedText: string;
  selectedHtml: string;
  fragmentUrl: string;
  createdAt: number;
  wrapperId?: string;
}

type VideoCapture = VideoTimestampCapture | VideoFragmentCapture;

interface VideoSessionMessages {
  panel: VideoPanelTexts;
  hintNoVideo: string;
  hintReady: string;
  hintNoCaptures: string;
  hintSaving: string;
  hintExporting: string;
  hintFailure: string;
  timestampSectionTitle: string;
  fragmentSectionTitle: string;
}

const DEFAULT_SESSION_MESSAGES: VideoSessionMessages = {
  panel: {
    title: 'Video capture mode',
    status: 'Capture timestamps and quick notes',
    counter: 'Saved {count} entries',
    counterZero: 'Saved 0 entries',
    add: 'Capture current timestamp',
    finish: 'Finish & export',
    cancel: 'Cancel',
    hint: 'Click “Capture current timestamp” or use the context menu on selected text to add it to the panel.',
    captureEditLabel: 'Edit note',
    captureDeleteLabel: 'Remove capture',
    captureNoComment: 'No note yet',
    captureSaveLabel: 'Save note',
    captureCancelLabel: 'Cancel',
    captureEditPlaceholder: 'Add a note for this timestamp...',
    captureFocusLabel: 'Jump to capture {index}'
  },
  hintNoVideo: 'Waiting for video element to be ready…',
  hintReady: 'Use “Capture current timestamp” or the selection context menu to add notes.',
  hintNoCaptures: 'No captures yet. Start by clicking the + button.',
  hintSaving: 'Saving capture…',
  hintExporting: 'Generating Markdown export…',
  hintFailure: 'Something went wrong. Please try again.',
  timestampSectionTitle: 'Video timestamps',
  fragmentSectionTitle: 'Captured fragments'
};

const AVAILABLE_HIGHLIGHT_THEMES: ReadonlyArray<ReaderHighlightTheme> = [
  'gradient',
  'purple',
  'neonYellow',
  'neonGreen',
  'neonOrange'
];

const DEFAULT_HIGHLIGHT_THEME: ReaderHighlightTheme = 'gradient';

const BILIBILI_COMMENT_HOST_SELECTORS = [
  'bili-comment-thread-renderer',
  'bili-comment-renderer',
  'bili-comment-reply-renderer',
  'bili-rich-text'
] as const;

function resolveHighlightTheme(theme: unknown): ReaderHighlightTheme {
  return AVAILABLE_HIGHLIGHT_THEMES.includes(theme as ReaderHighlightTheme)
    ? (theme as ReaderHighlightTheme)
    : DEFAULT_HIGHLIGHT_THEME;
}

export interface VideoSessionDependencies {
  viewFactory: VideoSessionViewFactory;
}

const defaultVideoSessionDependencies: VideoSessionDependencies = {
  viewFactory: createVideoPanelViewFactory()
};

declare global {
  interface Window {
    __aiobVideoActive?: boolean;
    __aiobVideoController?: VideoSession;
  }
}

export class VideoSession {
  private panel: VideoSessionView | null = null;
  private styleManager: InlineStyleManager;
  private captures: VideoCapture[] = [];
  private videoElement: HTMLVideoElement | null = null;
  private storageKey: string | null = null;
  private videoTitle = '';
  private videoUrl = '';
  private platform: VideoPlatform = 'unknown';
  private videoId: string | null = null;
  private canonicalUrl = '';
  private messages: VideoSessionMessages = DEFAULT_SESSION_MESSAGES;
  private urlWatcher: number | null = null;
  private videoPoller: number | null = null;
  private exporting = false;
  private saving = false;
  private highlightTheme: ReaderHighlightTheme = DEFAULT_HIGHLIGHT_THEME;
  private fragmentHighlightObserver: MutationObserver | null = null;
  private observedShadowRoots: WeakSet<ShadowRoot> = new WeakSet();
  private fragmentHighlightRestoreHandle: number | null = null;
  private storageChangeHandler: ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) | null = null;

  constructor(
    private readonly doc: Document,
    private readonly dependencies: VideoSessionDependencies = defaultVideoSessionDependencies
  ) {
    this.styleManager = new InlineStyleManager(doc);
  }

  async start(): Promise<void> {
    if (window.__aiobVideoActive) {
      this.panel?.updateHint(this.messages.hintReady);
      return;
    }

    const highlightThemePromise = this.loadHighlightTheme().catch(() => DEFAULT_HIGHLIGHT_THEME);
    await this.waitForDocumentReady();
    window.__aiobVideoActive = true;

    try {
      const msgs = await getMessages();
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
    } catch (error) {
      console.warn('[VideoSession] Failed to load i18n messages, using defaults:', error);
      this.messages = DEFAULT_SESSION_MESSAGES;
    }

    try {
      this.highlightTheme = await highlightThemePromise;
      this.applyHighlightTheme(this.highlightTheme);

      this.styleManager.mount(VIDEO_STYLES);
      this.panel = this.dependencies.viewFactory.createView(
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

      this.panel.updateCount(0);
      this.panel.setCaptures([]);
      this.panel.updateHint(this.messages.hintNoVideo);

      this.updateVideoContext();
      this.videoTitle = this.extractVideoTitle();
      void this.refreshContext();

      this.startVideoPolling();
      this.startUrlWatcher();

      if (chrome?.storage?.onChanged?.addListener) {
        this.storageChangeHandler = (changes, areaName) => {
          if (areaName !== 'sync' || !changes.options) {
            return;
          }
          const newOptions = (changes.options.newValue ?? null) as StoredOptions | null;
          if (newOptions && Object.prototype.hasOwnProperty.call(newOptions, 'readingSession')) {
            const highlightTheme = resolveHighlightTheme(
              (newOptions.readingSession as { highlightTheme?: unknown } | undefined)?.highlightTheme
            );
            this.highlightTheme = highlightTheme;
            this.applyHighlightTheme(highlightTheme);
            this.scheduleFragmentHighlightRestore();
          }
        };
        chrome.storage.onChanged.addListener(this.storageChangeHandler);
      } else {
        this.storageChangeHandler = null;
      }

      this.initFragmentHighlightObserver();
      if (this.captures.some(capture => capture.kind === 'fragment')) {
        this.scheduleFragmentHighlightRestore();
      }

      window.__aiobVideoController = this;
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  private async waitForDocumentReady(): Promise<void> {
    if (this.doc.body) {
      return;
    }

    if (this.doc.readyState === 'loading') {
      await new Promise<void>((resolve) => {
        this.doc.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
      });
      if (this.doc.body) {
        return;
      }
    }

    if (typeof MutationObserver === 'undefined') {
      if (this.doc.body) {
        return;
      }
      await new Promise<void>((resolve) => {
        const view = this.doc.defaultView ?? window;
        const interval = view.setInterval(() => {
          if (this.doc.body) {
            view.clearInterval(interval);
            resolve();
          }
        }, 16);
      });
      return;
    }

    await new Promise<void>((resolve) => {
      const target = this.doc.documentElement ?? this.doc;
      const observer = new MutationObserver(() => {
        if (this.doc.body) {
          observer.disconnect();
          resolve();
        }
      });
      try {
        observer.observe(target, { childList: true, subtree: target === this.doc });
      } catch {
        resolve();
        return;
      }
      if (this.doc.body) {
        observer.disconnect();
        resolve();
      }
    });
  }

  private updateVideoContext(): void {
    const rawUrl = this.doc.location.href;
    const identity = detectVideoIdentity(rawUrl);
    this.videoUrl = rawUrl;
    this.platform = identity.platform;
    this.videoId = identity.videoId;
    this.canonicalUrl = identity.canonicalUrl || rawUrl;
    this.storageKey = identity.storageKey;
  }

  private async refreshContext(): Promise<void> {
    const previousKey = this.storageKey;
    this.updateVideoContext();
    const currentKey = this.storageKey;

    if (!currentKey) {
      this.captures = [];
      this.panel?.updateHint(this.messages.hintNoVideo);
      this.syncPanel();
      return;
    }

    if (currentKey === previousKey) {
      this.panel?.updateHint(this.captures.length ? this.messages.hintReady : this.messages.hintNoCaptures);
      this.syncPanel();
      return;
    }

    try {
      const stored = await chrome.storage.local.get(currentKey);
      const raw = stored[currentKey] as StoredVideoCaptureData | undefined;
      if (raw?.entries?.length) {
        this.captures = raw.entries.map((entry) => {
          if ((entry as StoredVideoFragmentEntry).kind === 'fragment') {
            const fragmentEntry = entry as StoredVideoFragmentEntry;
            const selectedHtml = fragmentEntry.selectedHtml ?? fragmentEntry.selectedText ?? '';
            const fragmentUrl = fragmentEntry.fragmentUrl ?? this.canonicalUrl ?? this.videoUrl ?? this.doc.location.href;
            return {
              kind: 'fragment' as const,
              id: fragmentEntry.id,
              comment: fragmentEntry.comment ?? '',
              selectedText: fragmentEntry.selectedText ?? '',
              selectedHtml,
              fragmentUrl,
              createdAt: fragmentEntry.createdAt ?? Date.now(),
              wrapperId: fragmentEntry.wrapperId
            } satisfies VideoFragmentCapture;
          }

          const timestampEntry = entry as StoredVideoTimestampEntry;
          return {
            kind: 'timestamp' as const,
            id: timestampEntry.id,
            timeSec: timestampEntry.timeSec ?? 0,
            comment: timestampEntry.comment ?? '',
            url: timestampEntry.url,
            createdAt: timestampEntry.createdAt ?? Date.now()
          } satisfies VideoTimestampCapture;
        });

        for (const capture of this.captures) {
          if (capture.kind === 'fragment') {
            capture.wrapperId = this.ensureFragmentHighlight(capture) ?? capture.wrapperId;
          }
        }
      } else {
        this.captures = [];
      }
      if (raw?.title) {
        this.videoTitle = raw.title;
      } else {
        this.videoTitle = this.extractVideoTitle();
      }
      if (raw?.url) {
        this.canonicalUrl = raw.url;
      }
      for (const capture of this.captures) {
        if (capture.kind === 'fragment') {
          capture.wrapperId = this.ensureFragmentHighlight(capture);
        }
      }
      this.panel?.updateHint(this.captures.length ? this.messages.hintReady : this.messages.hintNoCaptures);
    } catch (error) {
      console.warn('[VideoSession] Failed to load stored captures:', error);
      this.captures = [];
      this.panel?.updateHint(this.messages.hintFailure);
    }
    this.syncPanel();
    if (this.captures.some((capture): capture is VideoFragmentCapture => capture.kind === 'fragment')) {
      this.scheduleFragmentHighlightRestore();
    }
  }

  private startUrlWatcher(): void {
    if (this.urlWatcher !== null) {
      return;
    }
    let lastHref = this.doc.location.href;
    this.urlWatcher = window.setInterval(() => {
      const currentHref = this.doc.location.href;
      if (currentHref !== lastHref) {
        lastHref = currentHref;
        this.updateVideoContext();
        this.videoTitle = this.extractVideoTitle();
        void this.refreshContext();
      }
    }, 1000);
  }

  private startVideoPolling(): void {
    if (this.videoPoller !== null) {
      return;
    }
    this.videoPoller = window.setInterval(() => {
      const element = this.findVideoElement();
      if (!element) {
        if (this.videoElement) {
          this.videoElement = null;
          this.panel?.updateHint(this.messages.hintNoVideo);
        }
        return;
      }

      if (this.videoElement !== element) {
        this.videoElement = element;
        this.panel?.updateHint(
          this.captures.length ? this.messages.hintReady : this.messages.hintNoCaptures
        );
      }
    }, 800);
  }

  private extractVideoTitle(): string {
    const titleSelectors = [
      'ytd-watch-metadata #title h1',
      'h1.title',
      '#viewbox h1',
      '#video-title',
      'h1'
    ];

    for (const selector of titleSelectors) {
      const node = this.doc.querySelector(selector);
      if (node?.textContent) {
        const text = node.textContent.trim();
        if (text) {
          return text;
        }
      }
    }

    const ogTitle = this.doc
      .querySelector<HTMLMetaElement>('meta[property="og:title"]')
      ?.getAttribute('content');
    if (ogTitle && ogTitle.trim()) {
      return ogTitle.trim();
    }

    const rawTitle = this.doc.title || '';
    if (this.platform === 'bilibili') {
      const cleaned = rawTitle.replace(/_+哔哩哔哩.*/i, '').trim();
      if (cleaned) {
        return cleaned;
      }
    }
    return rawTitle.trim();
  }

  private findVideoElement(): HTMLVideoElement | null {
    return this.doc.querySelector('video');
  }

  private async handleAddCapture(): Promise<void> {
    if (this.exporting || this.saving) {
      return;
    }

    this.updateVideoContext();

    const video = this.videoElement ?? this.findVideoElement();
    if (!video) {
      this.panel?.updateHint(this.messages.hintNoVideo);
      return;
    }

    const currentTime = Math.floor(video.currentTime || 0);
    if (!Number.isFinite(currentTime) || currentTime < 0) {
      this.panel?.updateHint(this.messages.hintFailure);
      return;
    }

    const shareUrl = this.buildTimestampUrl(currentTime);
    if (!shareUrl) {
      this.panel?.updateHint(this.messages.hintFailure);
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

    this.captures.push(capture);
    this.syncPanel();
    this.panel?.updateHint(this.messages.hintSaving);
    await this.saveCaptures();
    this.syncPanel();
    this.panel?.beginEditingCapture(capture.id, capture.comment);
  }

  ingestTextCapture(selectedHtml: string, selectedText: string, comment: string, selectionRange?: Range): void {
    this.updateVideoContext();
    const normalizedText = selectedText.replace(/\s+/g, ' ').trim();
    if (!normalizedText) {
      return;
    }

    const commentTrimmed = comment.trim();
    const now = Date.now();
    const fragmentUrl = generateTextFragmentUrl(this.canonicalUrl || this.doc.location.href, normalizedText);

    const capture: VideoFragmentCapture = {
      kind: 'fragment',
      id: `aiob-video-fragment-${now}-${Math.random().toString(16).slice(2)}`,
      comment: commentTrimmed,
      selectedText: normalizedText,
      selectedHtml,
      fragmentUrl,
      createdAt: now,
      wrapperId: undefined
    };

    if (selectionRange) {
      try {
        const cloned = selectionRange.cloneRange();
        capture.wrapperId = this.highlightSelectionRange(cloned, capture.id, fragmentUrl);
      } catch (error) {
        console.warn('[VideoSession] Failed to highlight selection range:', error);
      }
    }
    if (!capture.wrapperId) {
      try {
        capture.wrapperId = this.ensureFragmentHighlight(capture);
      } catch (error) {
        console.warn('[VideoSession] Failed to ensure fragment highlight:', error);
      }
    }

    this.captures.push(capture);
    this.initFragmentHighlightObserver();
    this.scheduleFragmentHighlightRestore();
    this.syncPanel();
    this.focusCapture(capture.id);
    this.panel?.updateHint(this.messages.hintSaving);
    this.panel?.beginEditingCapture(capture.id, capture.comment);
    void this.saveCaptures().then(() => {
      this.syncPanel();
    }).catch((error) => {
      console.warn('[VideoSession] Failed to save fragment capture:', error);
      this.panel?.updateHint(this.messages.hintFailure);
    });
  }

  private async submitCaptureEdit(id: string, comment: string): Promise<void> {
    const target = this.captures.find(capture => capture.id === id);
    if (!target) {
      return;
    }
    target.comment = comment.trim();
    this.panel?.updateHint(this.messages.hintSaving);
    await this.saveCaptures();
    this.syncPanel();
    this.panel?.stopEditing();
  }

  private removeCapture(id: string): void {
    const index = this.captures.findIndex(capture => capture.id === id);
    if (index === -1) {
      return;
    }
    const [removed] = this.captures.splice(index, 1);
    if (removed?.kind === 'fragment' && removed.wrapperId) {
      this.removeFragmentHighlight(removed.wrapperId);
    }
    void this.saveCaptures().then(() => {
      this.syncPanel();
    }).catch((error) => {
      console.warn('[VideoSession] Failed to save captures after removal:', error);
      this.panel?.updateHint(this.messages.hintFailure);
    });
  }

  private focusCapture(id: string): void {
    const target = this.captures.find(capture => capture.id === id);
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
    capture.wrapperId = this.ensureFragmentHighlight(capture) ?? capture.wrapperId;
    if (capture.wrapperId) {
      const element = this.getElementByIdDeep(capture.wrapperId);
      if (element) {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        element.classList.add('aiob-reader-highlight--focus');
        window.setTimeout(() => element.classList.remove('aiob-reader-highlight--focus'), 1600);
        this.scheduleFragmentHighlightRestore();
        return;
      }
    }
    this.highlightFragmentText(capture.selectedText);
  }

  private seekVideoTo(timeSec: number): void {
    const video = this.videoElement ?? this.findVideoElement();
    if (!video) {
      this.panel?.updateHint(this.messages.hintNoVideo);
      return;
    }
    try {
      video.currentTime = timeSec;
      const playResult = video.play();
      if (playResult && typeof playResult.then === 'function') {
        void playResult.catch(() => {
          // Ignore play promise rejection (e.g. autoplay policy)
        });
      }
    } catch (error) {
      console.warn('[VideoSession] Failed to seek video:', error);
    }
  }

  private highlightFragmentText(text: string): void {
    const range = this.findTextRange(text);
    if (!range) {
      return;
    }
    const selection = this.getSelectionForNode(range.startContainer);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  private async loadHighlightTheme(): Promise<ReaderHighlightTheme> {
    if (!chrome?.storage?.sync?.get) {
      return DEFAULT_HIGHLIGHT_THEME;
    }
    try {
      const { options } = await chrome.storage.sync.get('options');
      const highlightTheme = (options?.readingSession as { highlightTheme?: unknown } | undefined)?.highlightTheme;
      return resolveHighlightTheme(highlightTheme);
    } catch (error) {
      console.warn('[VideoSession] Failed to load highlight theme, using default:', error);
      return DEFAULT_HIGHLIGHT_THEME;
    }
  }

  private applyHighlightTheme(theme: ReaderHighlightTheme): void {
    this.doc.documentElement.dataset.aiobReaderHighlight = theme;
  }

  private initFragmentHighlightObserver(): void {
    if (this.fragmentHighlightObserver || typeof MutationObserver === 'undefined' || !this.doc.body) {
      return;
    }
    this.fragmentHighlightObserver = new MutationObserver((mutations) => {
      if (!mutations.some((mutation) => mutation.type === 'childList')) {
        return;
      }
      this.observeShadowRoots();
      this.scheduleFragmentHighlightRestore();
    });
    this.fragmentHighlightObserver.observe(this.doc.body, { childList: true, subtree: true });
    this.observeShadowRoots();
  }

  private scheduleFragmentHighlightRestore(): void {
    if (this.fragmentHighlightRestoreHandle !== null) {
      return;
    }
    if (!this.captures.some((capture): capture is VideoFragmentCapture => capture.kind === 'fragment')) {
      return;
    }
    this.observeShadowRoots();
    this.fragmentHighlightRestoreHandle = window.setTimeout(() => {
      this.fragmentHighlightRestoreHandle = null;
      this.restoreMissingFragmentHighlights();
    }, 120);
  }

  private restoreMissingFragmentHighlights(): void {
    const fragments = this.captures.filter(
      (capture): capture is VideoFragmentCapture => capture.kind === 'fragment'
    );
    if (!fragments.length) {
      return;
    }
    for (const capture of fragments) {
      const element = capture.wrapperId ? this.getElementByIdDeep(capture.wrapperId) : null;
      if (!element || !element.isConnected) {
        capture.wrapperId = this.ensureFragmentHighlight(capture) ?? capture.wrapperId;
      } else {
        element.classList.add('aiob-reader-highlight', 'aiob-video-fragment-highlight');
      }
    }
  }

  private highlightSelectionRange(range: Range, captureId: string, fragmentUrl: string): string | undefined {
    const wrapperId = `${captureId}-wrapper`;
    const wrapper = this.doc.createElement('mark');
    wrapper.classList.add('aiob-reader-highlight', 'aiob-video-fragment-highlight');
    wrapper.id = wrapperId;
    wrapper.dataset.videoFragmentId = captureId;
    wrapper.dataset.videoFragmentUrl = fragmentUrl;

    try {
      range.surroundContents(wrapper);
    } catch {
      try {
        const contents = range.extractContents();
        wrapper.appendChild(contents);
        range.insertNode(wrapper);
      } catch (error) {
        console.warn('[VideoSession] Failed to wrap selection range:', error);
        return undefined;
      }
    }

    return wrapperId;
  }

  private ensureFragmentHighlight(capture: VideoFragmentCapture): string | undefined {
    this.initFragmentHighlightObserver();
    this.observeShadowRoots();
    if (capture.wrapperId) {
      const existing = this.getElementByIdDeep(capture.wrapperId);
      if (existing) {
        existing.classList.add('aiob-reader-highlight', 'aiob-video-fragment-highlight');
        this.scheduleFragmentHighlightRestore();
        return capture.wrapperId;
      }
    }

    const existingByData = this.querySelectorDeep<HTMLElement>(`mark[data-video-fragment-id="${capture.id}"]`);
    if (existingByData) {
      if (!existingByData.id) {
        existingByData.id = `${capture.id}-wrapper`;
      }
      existingByData.classList.add('aiob-reader-highlight', 'aiob-video-fragment-highlight');
      this.scheduleFragmentHighlightRestore();
      return existingByData.id;
    }

    const range = this.findTextRange(capture.selectedText);
    if (!range) {
      return capture.wrapperId;
    }

    const wrapperId = this.highlightSelectionRange(range, capture.id, capture.fragmentUrl);
    if (wrapperId) {
      this.scheduleFragmentHighlightRestore();
    }
    return wrapperId;
  }

  private removeFragmentHighlight(wrapperId: string): void {
    const wrapper = this.getElementByIdDeep(wrapperId);
    if (!wrapper || !wrapper.parentNode) {
      return;
    }
    const parent = wrapper.parentNode;
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    wrapper.remove();
  }

  private findTextRange(text: string): Range | null {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return null;
    }

    const rangeWithWindowFind = this.findRangeWithWindowFind(normalized);
    if (rangeWithWindowFind) {
      return rangeWithWindowFind;
    }

    return this.findRangeWithWalker(normalized);
  }

  private findRangeWithWindowFind(normalized: string): Range | null {
    const selection = window.getSelection();
    const finder = (window as typeof window & {
      find?: (
        searchString: string,
        caseSensitive?: boolean,
        backwards?: boolean,
        wrapAround?: boolean,
        wholeWord?: boolean,
        searchInFrames?: boolean,
        showDialog?: boolean
      ) => boolean;
    }).find;

    if (!selection || typeof finder !== 'function') {
      return null;
    }

    selection.removeAllRanges();
    const foundFull = finder.call(window, normalized, false, false, true, false, false, false);
    if (foundFull && selection.rangeCount > 0) {
      const clone = selection.getRangeAt(0).cloneRange();
      selection.removeAllRanges();
      return clone;
    }
    selection.removeAllRanges();
    return null;
  }

  private findRangeWithWalker(normalized: string): Range | null {
    const root: Node | null = this.doc.body ?? this.doc.documentElement;
    if (!root) {
      return null;
    }
    const normalizedChars: Array<{ node: Text; offset: number }> = [];
    const normalizedBuilder: string[] = [];
    const normalizedLowerBuilder: string[] = [];
    let lastWasWhitespace = true;

    this.traverseShadowInclusive(root, (node) => {
      if (!(node instanceof Text)) {
        return null;
      }
      if (this.shouldSkipTextNode(node)) {
        return null;
      }
      const textContent = node.textContent;
      if (!textContent) {
        return null;
      }
      for (let index = 0; index < textContent.length; index += 1) {
        const char = textContent[index];
        if (this.isWhitespace(char)) {
          if (normalizedBuilder.length === 0 || lastWasWhitespace) {
            continue;
          }
          normalizedBuilder.push(' ');
          normalizedLowerBuilder.push(' ');
          normalizedChars.push({ node, offset: index });
          lastWasWhitespace = true;
        } else {
          normalizedBuilder.push(char);
          normalizedLowerBuilder.push(char.toLowerCase());
          normalizedChars.push({ node, offset: index });
          lastWasWhitespace = false;
        }
      }
      return null;
    });

    while (normalizedBuilder.length && normalizedBuilder[normalizedBuilder.length - 1] === ' ') {
      normalizedBuilder.pop();
      normalizedLowerBuilder.pop();
      normalizedChars.pop();
    }

    if (!normalizedBuilder.length) {
      return null;
    }

    const normalizedDocument = normalizedLowerBuilder.join('');
    const target = normalized.toLowerCase();
    const startIndex = normalizedDocument.indexOf(target);
    if (startIndex === -1) {
      return null;
    }
    const endIndex = startIndex + target.length - 1;
    const startChar = normalizedChars[startIndex];
    const endChar = normalizedChars[endIndex];
    if (!startChar || !endChar) {
      return null;
    }

    const range = this.doc.createRange();
    range.setStart(startChar.node, startChar.offset);
    range.setEnd(endChar.node, endChar.offset + 1);
    return range;
  }

  private shouldSkipTextNode(node: Text): boolean {
    const parent = node.parentElement;
    if (!parent) {
      return false;
    }
    if (parent.closest('mark[data-video-fragment-id]')) {
      return true;
    }
    if (parent.closest('script, style, noscript, textarea, input')) {
      return true;
    }
    return false;
  }

  private isWhitespace(char: string): boolean {
    return /\s/.test(char);
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

  private getElementByIdDeep(id: string): HTMLElement | null {
    const direct = this.doc.getElementById(id);
    if (direct) {
      return direct;
    }
    const root = this.doc.documentElement;
    if (!root) {
      return null;
    }
    let found: HTMLElement | null = null;
    this.traverseShadowInclusive(root, (node) => {
      if (node instanceof HTMLElement && node.id === id) {
        found = node;
        return node;
      }
      return null;
    });
    return found;
  }

  private querySelectorDeep<T extends Element>(selector: string): T | null {
    const direct = this.doc.querySelector<T>(selector);
    if (direct) {
      return direct;
    }
    const root = this.doc.documentElement;
    if (!root) {
      return null;
    }
    let found: T | null = null;
    this.traverseShadowInclusive(root, (node) => {
      if (node instanceof Element && node.matches(selector)) {
        found = node as T;
        return node as T;
      }
      return null;
    });
    return found;
  }

  private traverseShadowInclusive<T>(node: Node | null, visitor: (node: Node) => T | null): T | null {
    if (!node) {
      return null;
    }
    const result = visitor(node);
    if (result) {
      return result;
    }
    if (node instanceof Element && node.shadowRoot) {
      const shadowResult = this.traverseShadowInclusive(node.shadowRoot, visitor);
      if (shadowResult) {
        return shadowResult;
      }
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      const childResult = this.traverseShadowInclusive(child, visitor);
      if (childResult) {
        return childResult;
      }
    }
    return null;
  }

  private observeShadowRoots(): void {
    if (!this.fragmentHighlightObserver || this.platform !== 'bilibili') {
      return;
    }
    BILIBILI_COMMENT_HOST_SELECTORS.forEach((selector) => {
      const hosts = this.doc.querySelectorAll<HTMLElement>(selector);
      Array.from(hosts).forEach((host) => {
        this.observeShadowRootRecursive(host.shadowRoot);
      });
    });
  }

  private observeShadowRootRecursive(root: ShadowRoot | null): void {
    if (!root || !this.fragmentHighlightObserver) {
      return;
    }
    if (!this.observedShadowRoots.has(root)) {
      this.fragmentHighlightObserver.observe(root, { childList: true, subtree: true });
      this.observedShadowRoots.add(root);
    }
    const elements = root.querySelectorAll<HTMLElement>('*');
    Array.from(elements).forEach((element) => {
      if (element.shadowRoot) {
        this.observeShadowRootRecursive(element.shadowRoot);
      }
    });
  }

  private async saveCaptures(): Promise<void> {
    if (!this.storageKey) {
      return;
    }

    this.saving = true;
    try {
      const payload: StoredVideoCaptureData = {
        title: this.videoTitle,
        url: this.canonicalUrl || this.videoUrl,
        entries: this.captures.map(capture => {
          if (capture.kind === 'fragment') {
            return {
              kind: 'fragment',
              id: capture.id,
              comment: capture.comment,
              selectedText: capture.selectedText,
              selectedHtml: capture.selectedHtml,
              fragmentUrl: capture.fragmentUrl,
              createdAt: capture.createdAt,
              wrapperId: capture.wrapperId
            } satisfies StoredVideoFragmentEntry;
          }
          return {
            kind: 'timestamp',
            id: capture.id,
            timeSec: capture.timeSec,
            comment: capture.comment,
            url: capture.url,
            createdAt: capture.createdAt
          } satisfies StoredVideoTimestampEntry;
        }),
        updatedAt: Date.now()
      };
      await chrome.storage.local.set({ [this.storageKey]: payload });
      this.panel?.updateHint(this.captures.length ? this.messages.hintReady : this.messages.hintNoCaptures);
    } catch (error) {
      console.error('[VideoSession] Failed to save captures:', error);
      this.panel?.updateHint(this.messages.hintFailure);
    } finally {
      this.saving = false;
    }
  }

  private syncPanel(): void {
    if (!this.panel) {
      return;
    }
    const timestampCaptures = this.captures
      .filter((capture): capture is VideoTimestampCapture => capture.kind === 'timestamp')
      .sort((a, b) => {
        if (a.timeSec === b.timeSec) {
          return a.createdAt - b.createdAt;
        }
        return a.timeSec - b.timeSec;
      });

    const fragmentCaptures = this.sortFragmentsByDocumentOrder(
      this.captures.filter((capture): capture is VideoFragmentCapture => capture.kind === 'fragment')
    );

    const panelItems: VideoPanelCapture[] = [];

    for (const capture of timestampCaptures) {
      panelItems.push({
        id: capture.id,
        index: panelItems.length + 1,
        kind: 'timestamp',
        timeLabel: this.formatTime(capture.timeSec),
        timeSeconds: capture.timeSec,
        shareUrl: capture.url,
        comment: capture.comment,
        commentPreview: this.buildCommentPreview(capture.comment)
      });
    }

    for (const capture of fragmentCaptures) {
      panelItems.push({
        id: capture.id,
        index: panelItems.length + 1,
        kind: 'fragment',
        fragmentLabel: this.buildFragmentLabel(capture.selectedText),
        fragmentUrl: capture.fragmentUrl,
        comment: capture.comment,
        commentPreview: this.buildCommentPreview(capture.comment),
        selectionPreview: capture.selectedText
      });
    }

    const totalCount = panelItems.length;
    this.panel.updateCount(totalCount);
    this.panel.setCaptures(panelItems);
    if (!this.videoElement) {
      this.panel.updateHint(this.messages.hintNoVideo);
    } else {
      this.panel.updateHint(totalCount ? this.messages.hintReady : this.messages.hintNoCaptures);
    }
  }

  private sortFragmentsByDocumentOrder(captures: VideoFragmentCapture[]): VideoFragmentCapture[] {
    return [...captures].sort((a, b) => {
      const aNode = this.getFragmentElement(a);
      const bNode = this.getFragmentElement(b);

      if (aNode && bNode) {
        if (aNode === bNode) {
          return 0;
        }
        const position = aNode.compareDocumentPosition(bNode);
        if (position & Node.DOCUMENT_POSITION_PRECEDING) {
          return 1;
        }
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
          return -1;
        }
        return 0;
      }

      if (aNode) {
        return -1;
      }
      if (bNode) {
        return 1;
      }
      return a.createdAt - b.createdAt;
    });
  }

  private getFragmentElement(capture: VideoFragmentCapture): HTMLElement | null {
    capture.wrapperId = this.ensureFragmentHighlight(capture) ?? capture.wrapperId;
    if (!capture.wrapperId) {
      return null;
    }
    const node = this.getElementByIdDeep(capture.wrapperId);
    if (node instanceof HTMLElement) {
      return node;
    }
    return null;
  }

  private formatTime(seconds: number): string {
    const clamped = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(clamped / 3600);
    const minutes = Math.floor((clamped % 3600) / 60);
    const secs = clamped % 60;
    if (hours > 0) {
      return `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(secs)}`;
    }
    return `${this.pad(minutes)}:${this.pad(secs)}`;
  }

  private pad(value: number): string {
    return value < 10 ? `0${value}` : String(value);
  }

  private buildCommentPreview(comment: string, limit = 120): string {
    const normalized = comment.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return '';
    }
    if (normalized.length <= limit) {
      return normalized;
    }
    return `${normalized.slice(0, limit - 3)}...`;
  }

  private buildFragmentLabel(text: string, limit = 80): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return '[empty]';
    }
    if (normalized.length <= limit) {
      return normalized;
    }
    return `${normalized.slice(0, limit - 3)}...`;
  }

  private buildTimestampUrl(timeSec: number): string | null {
    if (this.platform === 'bilibili') {
      let baseUrl: URL;
      try {
        baseUrl = new URL(this.canonicalUrl || this.doc.location.href);
      } catch {
        return null;
      }
      baseUrl.searchParams.set('t', String(timeSec));

      if (!baseUrl.searchParams.has('p')) {
        const activeEpisode = this.doc.querySelector<HTMLElement>('.video-episode-card__entry.is-active[data-index]');
        if (activeEpisode) {
          const indexAttr = activeEpisode.dataset.index || activeEpisode.getAttribute('data-index');
          const parsedIndex = indexAttr ? Number.parseInt(indexAttr, 10) : Number.NaN;
          if (Number.isFinite(parsedIndex) && parsedIndex + 1 > 1) {
            baseUrl.searchParams.set('p', String(parsedIndex + 1));
          }
        }
      }
      return baseUrl.toString();
    }

    if (this.platform === 'youtube') {
      if (!this.videoId) {
        return null;
      }
      let baseUrl: URL;
      try {
        baseUrl = new URL(this.canonicalUrl || `https://www.youtube.com/watch?v=${this.videoId}`);
      } catch {
        baseUrl = new URL(`https://www.youtube.com/watch?v=${this.videoId}`);
      }
      baseUrl.searchParams.set('t', String(timeSec));
      return baseUrl.toString();
    }

    try {
      const fallback = new URL(this.canonicalUrl || this.doc.location.href);
      fallback.searchParams.set('t', String(timeSec));
      return fallback.toString();
    } catch {
      return null;
    }
  }

  private async finish(): Promise<void> {
    if (this.exporting || this.saving) {
      return;
    }
    if (!this.captures.length) {
      this.panel?.updateHint(this.messages.hintNoCaptures);
      return;
    }

    this.updateVideoContext();

    this.exporting = true;
    this.panel?.updateHint(this.messages.hintExporting);

    try {
      const payload = this.buildMarkdownPayload();
      await this.sendClipResult(payload);
      this.cleanup();
    } catch (error) {
      console.error('[VideoSession] Export failed:', error);
      this.panel?.updateHint(this.messages.hintFailure);
      this.exporting = false;
    }
  }

  private cancel(): void {
    if (this.exporting) {
      return;
    }
    this.cleanup();
  }

  private buildMarkdownPayload(): { markdown: string; title: string; type: string; meta: Record<string, unknown> } {
    const sorted = [...this.captures].sort((a, b) => {
      const aTime = typeof a.timeSec === 'number' ? a.timeSec : Number.MAX_SAFE_INTEGER;
      const bTime = typeof b.timeSec === 'number' ? b.timeSec : Number.MAX_SAFE_INTEGER;
      if (aTime === bTime) {
        return a.createdAt - b.createdAt;
      }
      return aTime - bTime;
    });

    const timestampCaptures = sorted.filter((capture): capture is VideoTimestampCapture => capture.kind === 'timestamp');
    const fragmentCaptures = sorted.filter((capture): capture is VideoFragmentCapture => capture.kind === 'fragment');

    const defaultTitle =
      this.platform === 'youtube'
        ? 'YouTube Video'
        : this.platform === 'bilibili'
          ? 'Bilibili Video'
          : 'Video Capture';
    const title = this.videoTitle || defaultTitle;
    const pageUrl = this.canonicalUrl || this.videoUrl || '';
    const now = new Date();
    const clippedAt = formatDateTime(now);
    const domain = pageUrl ? this.deriveDomain(pageUrl) : '';
    const platformLabel = this.platform === 'unknown' ? 'video' : this.platform;

    const frontMatterLines = [
      '---',
      'type: video',
      `title: "${escapeQuotes(title)}"`
    ];

    if (pageUrl) {
      frontMatterLines.push(`url: "${escapeQuotes(pageUrl)}"`);
    }

    frontMatterLines.push(
      `clipped_at: "${clippedAt}"`,
      `platform: "${platformLabel}"`,
      `capture_count: ${sorted.length}`,
      `timestamp_count: ${timestampCaptures.length}`,
      `fragment_count: ${fragmentCaptures.length}`,
      'tags: [clipping, video]',
      '---'
    );

    const bodyLines: string[] = [];

    if (timestampCaptures.length) {
      bodyLines.push(`## ${this.messages.timestampSectionTitle ?? 'Video timestamps'}`, '');
      timestampCaptures.forEach((capture, index) => {
        const label = this.formatTime(capture.timeSec);
        const comment = capture.comment ? ` ${capture.comment}` : '';
        bodyLines.push(`${index + 1}. [${label}](${capture.url})${comment}`);
      });
    }

    if (fragmentCaptures.length) {
      const fragmentMarkdown = this.buildFragmentsMarkdown(fragmentCaptures, pageUrl);
      if (fragmentMarkdown) {
        if (bodyLines.length) {
          bodyLines.push('');
        }
        bodyLines.push(`## ${this.messages.fragmentSectionTitle ?? 'Captured fragments'}`, '', fragmentMarkdown.trim());
      }
    }

    const body = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const markdown = `${frontMatterLines.join('\n')}\n\n${body}\n`;

    const key = this.storageKey;
    return {
      markdown,
      title,
      type: 'video',
      meta: {
        url: pageUrl,
        domain,
        clippedAtISO: clippedAt,
        platform: platformLabel,
        storageKey: key,
        captureCount: sorted.length,
        timestampCount: timestampCaptures.length,
        fragmentCount: fragmentCaptures.length,
        captures: sorted.map((capture, index) => {
          if (capture.kind === 'fragment') {
            return {
              index: index + 1,
              id: capture.id,
              kind: 'fragment',
              comment: capture.comment,
              selectedText: capture.selectedText,
              fragmentUrl: capture.fragmentUrl
            };
          }
          return {
            index: index + 1,
            id: capture.id,
            kind: 'timestamp',
            time: capture.timeSec,
            comment: capture.comment,
            url: capture.url
          };
        })
      }
    };
  }

  private buildFragmentsMarkdown(captures: VideoFragmentCapture[], pageUrl: string): string {
    try {
      const { markdown } = buildReaderHighlightsMarkdown({
        pageTitle: this.videoTitle,
        pageUrl,
        highlights: captures.map((capture, index) => ({
          selectedHtml: capture.selectedHtml,
          selectedText: capture.selectedText,
          comment: capture.comment,
          fragmentUrl: capture.fragmentUrl,
          footnoteIndex: index + 1
        }))
      });
      const marker = '\n---\n\n';
      const markerIndex = markdown.indexOf(marker);
      if (markerIndex !== -1) {
        return markdown.slice(markerIndex + marker.length).trim();
      }
      const doubleNewline = markdown.indexOf('\n\n');
      if (doubleNewline !== -1) {
        return markdown.slice(doubleNewline + 2).trim();
      }
      return markdown.trim();
    } catch (error) {
      console.warn('[VideoSession] Failed to build fragment markdown:', error);
      return captures.map((capture) => {
        const label = this.buildFragmentLabel(capture.selectedText);
        const commentPart = capture.comment ? `\n  - ${capture.comment}` : '';
        return `- ${label}${commentPart}`;
      }).join('\n');
    }
  }

  private sendClipResult(payload: { markdown: string; title: string; type: string; meta: Record<string, unknown> }): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'CLIP_RESULT', payload }, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          if (typeof lastError.message === 'string' && lastError.message.includes('The message port closed before a response was received')) {
            resolve();
            return;
          }
          reject(new Error(lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  private cleanup(): void {
    if (this.urlWatcher !== null) {
      window.clearInterval(this.urlWatcher);
      this.urlWatcher = null;
    }
    if (this.videoPoller !== null) {
      window.clearInterval(this.videoPoller);
      this.videoPoller = null;
    }
    if (this.storageChangeHandler && chrome?.storage?.onChanged?.removeListener) {
      chrome.storage.onChanged.removeListener(this.storageChangeHandler);
    }
    this.storageChangeHandler = null;
    if (this.fragmentHighlightObserver) {
      this.fragmentHighlightObserver.disconnect();
      this.fragmentHighlightObserver = null;
    }
    this.observedShadowRoots = new WeakSet();
    if (this.fragmentHighlightRestoreHandle !== null) {
      window.clearTimeout(this.fragmentHighlightRestoreHandle);
      this.fragmentHighlightRestoreHandle = null;
    }
    this.panel?.destroy();
    this.panel = null;
    this.styleManager.unmount();
    window.__aiobVideoActive = false;
    window.__aiobVideoController = undefined;
    this.videoElement = null;
    this.exporting = false;
    this.saving = false;

    for (const capture of this.captures) {
      if (capture.kind === 'fragment' && capture.wrapperId) {
        this.removeFragmentHighlight(capture.wrapperId);
      }
    }
    this.captures = [];
  }

  private deriveDomain(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
    } catch {
      return '';
    }
  }
}
