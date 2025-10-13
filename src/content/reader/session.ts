import type { ClipPromptGateway } from '../clipper/application/clipPromptGateway';
import { InlineStyleManager } from '../clipper/shared/styleManager';
import { generateTextFragmentUrl } from '../clipper/utils/textFragment';
import { READER_STYLES } from './styles';
import type { ReaderPanelHighlight, ReaderPanelTexts } from './application/readerPanelModel';
import type {
  ReaderSessionView,
  ReaderSessionViewFactory
} from './application/readerSessionView';
import { createReaderPanelViewFactory } from './presentation/readerPanelView';
import {
  buildReaderHighlightsMarkdown,
  buildReaderFullMarkdown,
  type ReaderHighlightInput,
  type ReaderMarkdownPayload
} from './utils/markdownBuilder';
import { getMessages } from '../../i18n';
import type {
  ReaderHighlightTheme,
  ReadingSessionOptions,
  StoredOptions
} from '../../shared/types/options';
import {
  DEFAULT_FRAGMENT_CONFIG,
  createModifierState,
  loadFragmentConfig,
  resetModifierState,
  shouldTriggerSelectionWithModifiers,
  syncModifierState
} from '../clipper/services/fragmentConfig';
import { ADD_HIGHLIGHT_EVENT } from './constants';
import type { ReaderBootstrapHighlight } from './types';

interface ReaderHighlight {
  id: string;
  selectedHtml: string;
  selectedText: string;
  comment: string;
  fragmentUrl: string;
  wrapper: HTMLElement;
  footnoteIndex?: number;
}

interface SessionMessages {
  panel: ReaderPanelTexts;
  hintNoHighlights: string;
  hintExporting: string;
  hintFailure: string;
  hintSelectionFailure: string;
}

const DEFAULT_SESSION_MESSAGES: SessionMessages = {
  panel: {
    title: 'Reading session active',
    status: 'Select text to highlight and annotate',
    counter: 'Collected {count} highlights',
    counterZero: 'Collected 0 highlights',
    finish: 'Finish & export',
    cancel: 'Cancel',
    hint: 'Tip: release the mouse to open the annotation dialog; leave it blank to save highlight only.',
    highlightEditLabel: 'Edit note',
    highlightDeleteLabel: 'Remove highlight',
    highlightNoComment: 'No note yet',
    highlightSaveLabel: 'Save note',
    highlightCancelLabel: 'Cancel',
    highlightEditPlaceholder: 'Update the note here...',
    highlightFocusLabel: 'Jump to highlight {index}'
  },
  hintNoHighlights: 'No highlights yet. Select some text first.',
  hintExporting: 'Generating Markdown...',
  hintFailure: 'Export failed, please try again later.',
  hintSelectionFailure: 'Failed to highlight, please try again.'
};

export interface ReaderSessionDependencies {
  viewFactory: ReaderSessionViewFactory;
}

const defaultReaderSessionDependencies: ReaderSessionDependencies = {
  viewFactory: createReaderPanelViewFactory()
};

const DEFAULT_READING_CONFIG: ReadingSessionOptions = {
  exportMode: 'highlights',
  highlightTheme: 'gradient'
};

const AVAILABLE_HIGHLIGHT_THEMES: ReadonlyArray<ReaderHighlightTheme> = [
  'gradient',
  'purple',
  'neonYellow',
  'neonGreen',
  'neonOrange'
];

function resolveHighlightTheme(theme: unknown): ReaderHighlightTheme {
  return AVAILABLE_HIGHLIGHT_THEMES.includes(theme as ReaderHighlightTheme)
    ? (theme as ReaderHighlightTheme)
    : DEFAULT_READING_CONFIG.highlightTheme;
}

function resolveReadingConfig(raw?: Partial<ReadingSessionOptions> | null): ReadingSessionOptions {
  if (!raw) {
    return { ...DEFAULT_READING_CONFIG };
  }
  return {
    exportMode: raw.exportMode === 'full' ? 'full' : DEFAULT_READING_CONFIG.exportMode,
    highlightTheme: resolveHighlightTheme(raw.highlightTheme)
  };
}

async function loadReadingConfig(): Promise<ReadingSessionOptions> {
  try {
    const { options } = await chrome.storage.sync.get('options');
    const reading = options?.readingSession as Partial<ReadingSessionOptions> | undefined;
    return resolveReadingConfig(reading);
  } catch (error) {
    console.warn('[ReaderSession] Failed to load reading config, using defaults:', error);
  }
  return { ...DEFAULT_READING_CONFIG };
}

declare global {
  interface Window {
    __aiobReaderActive?: boolean;
    __aiobReaderController?: ReaderSession;
  }
}

interface ExternalHighlightPayload {
  range: Range;
  selectedHtml: string;
  selectedText: string;
  comment: string;
}

export class ReaderSession {
  private readonly clipPrompt: ClipPromptGateway;
  private highlights: ReaderHighlight[] = [];
  private panel: ReaderSessionView | null = null;
  private styleManager: InlineStyleManager;
  private handlingSelection = false;
  private exporting = false;
  private messages: SessionMessages = DEFAULT_SESSION_MESSAGES;
  private externalHighlightHandler: ((event: Event) => void) | null = null;
  private highlightFocusTimeout: number | null = null;
  private fragmentConfig = DEFAULT_FRAGMENT_CONFIG;
  private storageChangeHandler: ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) | null = null;
  private modifierState = createModifierState();
  private selectionModifierActive = false;
  private modifierKeyHandler: ((event: KeyboardEvent) => void) | null = null;
  private windowBlurHandler: (() => void) | null = null;
  private selectionStartHandler: ((event: MouseEvent) => void) | null = null;
  private readingConfig: ReadingSessionOptions = { ...DEFAULT_READING_CONFIG };

  constructor(
    private readonly doc: Document,
    private readonly url: string,
    clipPromptGateway: ClipPromptGateway,
    private readonly dependencies: ReaderSessionDependencies = defaultReaderSessionDependencies
  ) {
    this.clipPrompt = clipPromptGateway;
    this.styleManager = new InlineStyleManager(doc);
  }

  async start(initialHighlights?: ReaderBootstrapHighlight | ReaderBootstrapHighlight[]): Promise<void> {
    if (window.__aiobReaderActive) {
      return;
    }

    window.__aiobReaderActive = true;
    this.doc.documentElement.dataset.aiobReaderActive = 'true';

    const fragmentConfigPromise = loadFragmentConfig().catch(() => DEFAULT_FRAGMENT_CONFIG);
    const readingConfigPromise = loadReadingConfig().catch(() => ({ ...DEFAULT_READING_CONFIG }));

    try {
      const msgs = await getMessages();
      this.messages = {
        panel: {
          title: msgs.readerPanelTitle,
          status: msgs.readerPanelStatus,
          counter: msgs.readerPanelCounter,
          counterZero: msgs.readerPanelCounterZero,
          finish: msgs.readerPanelFinish,
          cancel: msgs.readerPanelCancel,
          hint: msgs.readerPanelHint,
          highlightEditLabel: msgs.readerHighlightEditLabel,
          highlightDeleteLabel: msgs.readerHighlightDeleteLabel,
          highlightNoComment: msgs.readerHighlightNoComment,
          highlightSaveLabel: msgs.readerHighlightSaveLabel,
          highlightCancelLabel: msgs.readerHighlightCancelLabel,
          highlightEditPlaceholder: msgs.readerHighlightEditPlaceholder,
          highlightFocusLabel: msgs.readerHighlightFocusLabel
        },
        hintNoHighlights: msgs.readerHintNoHighlights,
        hintExporting: msgs.readerHintExporting,
        hintFailure: msgs.readerHintFailure,
        hintSelectionFailure: msgs.readerHintSelectionFailure
      };
    } catch (error) {
      console.warn('[ReaderSession] Failed to load i18n messages, using defaults:', error);
      this.messages = DEFAULT_SESSION_MESSAGES;
    }

    this.fragmentConfig = await fragmentConfigPromise;
    this.readingConfig = await readingConfigPromise;
    this.applyHighlightTheme(this.readingConfig.highlightTheme);
    if (!this.fragmentConfig.selectionModifierEnabled) {
      this.selectionModifierActive = false;
      resetModifierState(this.modifierState);
    }

    if (chrome?.storage?.onChanged?.addListener) {
      this.storageChangeHandler = (changes, areaName) => {
        if (areaName !== 'sync' || !changes.options) {
          return;
        }
        void loadFragmentConfig()
          .then((config) => {
            this.fragmentConfig = config;
            if (!this.fragmentConfig.selectionModifierEnabled) {
              this.selectionModifierActive = false;
              resetModifierState(this.modifierState);
            }
          })
          .catch(() => {
            this.fragmentConfig = DEFAULT_FRAGMENT_CONFIG;
          });
        const newOptions = (changes.options.newValue ?? null) as StoredOptions | null;
        if (newOptions && Object.prototype.hasOwnProperty.call(newOptions, 'readingSession')) {
          const nextReadingConfig = resolveReadingConfig(newOptions.readingSession as Partial<ReadingSessionOptions> | undefined);
          this.readingConfig = nextReadingConfig;
          this.applyHighlightTheme(nextReadingConfig.highlightTheme);
        }
      };
      chrome.storage.onChanged.addListener(this.storageChangeHandler);
    } else {
      this.storageChangeHandler = null;
    }

    this.styleManager.mount(READER_STYLES);

    this.panel = this.dependencies.viewFactory.createView({
      onFinish: () => void this.finish(),
      onCancel: () => this.cancel(),
      onDeleteHighlight: (id) => this.removeHighlightById(id),
      onSubmitHighlightEdit: (id, comment) => this.submitHighlightEdit(id, comment),
      onFocusHighlight: (id) => this.focusHighlight(id)
    }, this.messages.panel);
    this.panel.updateCount(0);
    this.panel.setHighlights([]);

    this.selectionStartHandler = (event: MouseEvent) => {
      if (event.button !== 0) {
        this.selectionModifierActive = false;
        return;
      }
      syncModifierState(this.modifierState, event);
      if (!this.fragmentConfig.selectionModifierEnabled) {
        this.selectionModifierActive = false;
        return;
      }
      this.selectionModifierActive = shouldTriggerSelectionWithModifiers(this.fragmentConfig, this.modifierState);
    };

    this.modifierKeyHandler = (event: KeyboardEvent) => {
      syncModifierState(this.modifierState, event);
    };

    this.windowBlurHandler = () => {
      resetModifierState(this.modifierState);
      this.selectionModifierActive = false;
    };

    this.doc.addEventListener('mousedown', this.selectionStartHandler, true);
    this.doc.addEventListener('keydown', this.modifierKeyHandler, true);
    this.doc.addEventListener('keyup', this.modifierKeyHandler, true);
    this.doc.defaultView?.addEventListener('blur', this.windowBlurHandler, true);
    this.doc.addEventListener('mouseup', this.handleMouseUp, true);
    this.doc.addEventListener('keydown', this.handleKeydown, true);

    this.externalHighlightHandler = (event: Event) => {
      const detail = (event as CustomEvent<ExternalHighlightPayload>).detail;
      if (!detail) {
        return;
      }
      this.ingestExternalHighlight(detail.range, detail.selectedHtml, detail.selectedText, detail.comment);
    };
    this.doc.addEventListener(ADD_HIGHLIGHT_EVENT, this.externalHighlightHandler as EventListener);

    const bootHighlights = initialHighlights
      ? (Array.isArray(initialHighlights) ? initialHighlights : [initialHighlights])
      : [];

    for (const highlight of bootHighlights) {
      try {
        this.addHighlightFromRange(highlight.range, highlight.selectedHtml, highlight.selectedText, highlight.comment);
      } catch (error) {
        console.error('[ReaderSession] Failed to add initial highlight:', error);
      }
    }

    window.__aiobReaderController = this;
  }

  private handleMouseUp = async (event: MouseEvent): Promise<void> => {
    if (this.handlingSelection || this.exporting) {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    if (selection.isCollapsed) {
      return;
    }

    if (this.isSelectionInsideUi(selection)) {
      selection.removeAllRanges();
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      selection.removeAllRanges();
      return;
    }

    syncModifierState(this.modifierState, event);
    const modifierRequired = this.fragmentConfig.selectionModifierEnabled;
    const modifiersSatisfied = this.selectionModifierActive
      || shouldTriggerSelectionWithModifiers(this.fragmentConfig, this.modifierState);
    if (modifierRequired && !modifiersSatisfied) {
      this.selectionModifierActive = false;
      return;
    }

    const range = selection.getRangeAt(0);
    const savedRange = range.cloneRange();

    const container = this.doc.createElement('div');
    container.appendChild(savedRange.cloneContents());
    const selectedHtml = container.innerHTML;

    this.handlingSelection = true;

    try {
      const promptResult = await this.clipPrompt.requestSelectionAction({
        selectedText,
        allowReaderMode: false,
        readerModeBehavior: 'start'
      });
      if (promptResult.action !== 'clip') {
        selection.removeAllRanges();
        return;
      }

      this.addHighlightFromRange(savedRange, selectedHtml, selectedText, promptResult.comment.trim());
      selection.removeAllRanges();
    } catch (error) {
      console.error('[ReaderSession] Failed to capture selection:', error);
      this.panel?.updateHint(this.messages.hintSelectionFailure);
    } finally {
      this.handlingSelection = false;
      this.selectionModifierActive = false;
    }
  };

  private handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (this.panel?.isEditing()) {
        return;
      }
      event.preventDefault();
      this.cancel();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void this.finish();
    }
  };

  private isSelectionInsideUi(selection: Selection): boolean {
    return [selection.anchorNode, selection.focusNode].some((node) => this.isNodeInsideUi(node));
  }

  private isNodeInsideUi(node: Node | null): boolean {
    if (!node) {
      return false;
    }

    let element: Element | null = null;
    if (node instanceof Element) {
      element = node;
    } else if (node instanceof Text) {
      element = node.parentElement;
    }

    if (!element) {
      return false;
    }

    if (this.panel?.element.contains(element)) {
      return true;
    }

    const dialog = this.doc.getElementById('obsidian-clipper-dialog');
    if (dialog && dialog.contains(element)) {
      return true;
    }

    return false;
  }

  private addHighlightFromRange(range: Range, selectedHtml: string, selectedText: string, comment: string): void {
    const highlightRange = range.cloneRange();
    const highlightId = `aiob-reader-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const fragmentUrl = generateTextFragmentUrl(this.url, selectedText);
    const normalizedComment = comment.trim();

    const wrapper = this.doc.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = highlightId;

    const fragment = highlightRange.extractContents();
    wrapper.appendChild(fragment);
    highlightRange.insertNode(wrapper);

    this.highlights.push({
      id: highlightId,
      selectedHtml,
      selectedText,
      comment: normalizedComment,
      fragmentUrl,
      wrapper,
      footnoteIndex: undefined
    });
    this.panel?.updateCount(this.highlights.length);
    this.panel?.updateHint(this.messages.panel.hint);
    this.syncHighlightsUi();
  }

  ingestExternalHighlight(range: Range, selectedHtml: string, selectedText: string, comment: string): void {
    this.addHighlightFromRange(range, selectedHtml, selectedText, comment);
    window.getSelection()?.removeAllRanges();
  }

  private prepareHighlightsForExport(): ReaderHighlightInput[] {
    let footnoteCursor = 1;
    return this.highlights.map((highlight) => {
      const trimmedComment = highlight.comment.trim();
      let footnoteIndex: number | undefined;
      if (trimmedComment) {
        footnoteIndex = footnoteCursor++;
        highlight.wrapper.dataset.readerFootnote = String(footnoteIndex);
        highlight.wrapper.dataset.readerComment = trimmedComment;
      } else {
        delete highlight.wrapper.dataset.readerFootnote;
        delete highlight.wrapper.dataset.readerComment;
      }
      highlight.footnoteIndex = footnoteIndex;

      return {
        id: highlight.id,
        selectedHtml: highlight.selectedHtml,
        selectedText: highlight.selectedText,
        comment: trimmedComment,
        fragmentUrl: highlight.fragmentUrl,
        footnoteIndex
      };
    });
  }

  private applyFootnotesToClone(clone: Document, highlights: ReaderHighlightInput[]): void {
    for (const highlight of highlights) {
      if (!highlight.id) {
        continue;
      }
      const node = clone.querySelector(`[data-reader-highlight-id="${highlight.id}"]`);
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      if (highlight.footnoteIndex) {
        node.setAttribute('data-reader-footnote', String(highlight.footnoteIndex));
      } else {
        node.removeAttribute('data-reader-footnote');
      }
      if (highlight.comment) {
        node.setAttribute('data-reader-comment', highlight.comment);
      } else {
        node.removeAttribute('data-reader-comment');
      }
    }
  }

  private async finish(): Promise<void> {
    if (this.exporting) {
      return;
    }

    if (!this.highlights.length) {
      this.panel?.updateHint(this.messages.hintNoHighlights);
      return;
    }

    this.exporting = true;
    this.panel?.updateHint(this.messages.hintExporting);

    try {
      const readingConfig = await loadReadingConfig();
      this.readingConfig = readingConfig;
      const highlightRecords = this.prepareHighlightsForExport();
      const pageTitle = this.doc.title || new URL(this.url).hostname;

      let payload: ReaderMarkdownPayload;
      if (readingConfig.exportMode === 'full') {
        const clone = this.doc.cloneNode(true) as Document;
        this.applyFootnotesToClone(clone, highlightRecords);
        payload = buildReaderFullMarkdown({
          pageTitle,
          pageUrl: this.url,
          highlights: highlightRecords,
          documentClone: clone
        });
      } else {
        payload = buildReaderHighlightsMarkdown({
          pageTitle,
          pageUrl: this.url,
          highlights: highlightRecords
        });
      }

      await this.sendClipResult(payload);
      this.cleanup();
    } catch (error) {
      console.error('[ReaderSession] Export failed:', error);
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

  private cleanup(): void {
    this.doc.removeEventListener('mouseup', this.handleMouseUp, true);
    this.doc.removeEventListener('keydown', this.handleKeydown, true);
    if (this.selectionStartHandler) {
      this.doc.removeEventListener('mousedown', this.selectionStartHandler, true);
      this.selectionStartHandler = null;
    }
    if (this.modifierKeyHandler) {
      this.doc.removeEventListener('keydown', this.modifierKeyHandler, true);
      this.doc.removeEventListener('keyup', this.modifierKeyHandler, true);
      this.modifierKeyHandler = null;
    }
    if (this.windowBlurHandler) {
      this.doc.defaultView?.removeEventListener('blur', this.windowBlurHandler, true);
      this.windowBlurHandler = null;
    }
    if (this.externalHighlightHandler) {
      this.doc.removeEventListener(ADD_HIGHLIGHT_EVENT, this.externalHighlightHandler as EventListener);
      this.externalHighlightHandler = null;
    }
    if (this.storageChangeHandler && chrome?.storage?.onChanged?.removeListener) {
      chrome.storage.onChanged.removeListener(this.storageChangeHandler);
      this.storageChangeHandler = null;
    }
    resetModifierState(this.modifierState);
    this.selectionModifierActive = false;

    for (const highlight of this.highlights) {
      this.unwrapHighlight(highlight.wrapper);
    }
    this.highlights = [];

    this.panel?.destroy();
    this.panel = null;

    this.styleManager.unmount();
    window.__aiobReaderActive = false;
    window.__aiobReaderController = undefined;
    delete this.doc.documentElement.dataset.aiobReaderActive;
    delete this.doc.documentElement.dataset.aiobReaderHighlight;
    this.exporting = false;
    this.handlingSelection = false;
    if (this.highlightFocusTimeout !== null) {
      window.clearTimeout(this.highlightFocusTimeout);
      this.highlightFocusTimeout = null;
    }

    const selection = window.getSelection();
    selection?.removeAllRanges();
  }

  private unwrapHighlight(wrapper: HTMLElement): void {
    const parent = wrapper.parentNode;
    if (!parent) {
      return;
    }
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    wrapper.remove();
  }

  private sendClipResult(payload: ReaderMarkdownPayload): Promise<void> {
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

  private sortHighlightsByDocumentOrder(): void {
    this.highlights.sort((a, b) => {
      if (a.wrapper === b.wrapper) {
        return 0;
      }
      if (!a.wrapper.isConnected) {
        return 1;
      }
      if (!b.wrapper.isConnected) {
        return -1;
      }
      const position = a.wrapper.compareDocumentPosition(b.wrapper);
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      return 0;
    });
  }

  private buildExcerpt(text: string, limit = 80): string {
    const normalized = this.normalizeSelectedText(text);
    if (!normalized) {
      return '[empty]';
    }
    if (normalized.length <= limit) {
      return normalized;
    }
    return `${normalized.slice(0, limit - 3)}...`;
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

  private applyHighlightTheme(theme: ReaderHighlightTheme): void {
    this.doc.documentElement.dataset.aiobReaderHighlight = theme;
  }

  private syncHighlightsUi(): void {
    this.sortHighlightsByDocumentOrder();
    const panelHighlights: ReaderPanelHighlight[] = this.highlights.map((highlight, index) => ({
      id: highlight.id,
      excerpt: this.buildExcerpt(highlight.selectedText),
      comment: highlight.comment,
      fullText: this.normalizeSelectedText(highlight.selectedText),
      commentPreview: this.buildCommentPreview(highlight.comment),
      index: index + 1
    }));
    this.panel?.setHighlights(panelHighlights);
  }

  private focusHighlight(id: string): void {
    const highlight = this.highlights.find((item) => item.id === id);
    if (!highlight) {
      return;
    }
    const { wrapper } = highlight;
    if (!wrapper.isConnected) {
      return;
    }

    try {
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch {
      wrapper.scrollIntoView();
    }

    if (this.highlightFocusTimeout !== null) {
      window.clearTimeout(this.highlightFocusTimeout);
      this.highlightFocusTimeout = null;
    }
    this.doc.querySelectorAll<HTMLElement>('.aiob-reader-highlight--focus').forEach((element) => {
      element.classList.remove('aiob-reader-highlight--focus');
    });
    wrapper.classList.add('aiob-reader-highlight--focus');
    this.highlightFocusTimeout = window.setTimeout(() => {
      wrapper.classList.remove('aiob-reader-highlight--focus');
      this.highlightFocusTimeout = null;
    }, 1600);
  }

  private removeHighlightById(id: string): void {
    if (this.exporting) {
      return;
    }
    const index = this.highlights.findIndex((highlight) => highlight.id === id);
    if (index === -1) {
      return;
    }
    const [removed] = this.highlights.splice(index, 1);
    this.unwrapHighlight(removed.wrapper);
    this.panel?.updateCount(this.highlights.length);
    this.panel?.updateHint(this.highlights.length ? this.messages.panel.hint : this.messages.hintNoHighlights);
    this.syncHighlightsUi();
  }

  private submitHighlightEdit(id: string, nextComment: string): void {
    if (this.exporting) {
      return;
    }
    const highlight = this.highlights.find((item) => item.id === id);
    if (!highlight) {
      this.panel?.stopEditing();
      return;
    }

    const trimmedComment = nextComment.trim();
    highlight.comment = trimmedComment;
    highlight.footnoteIndex = undefined;
    delete highlight.wrapper.dataset.readerFootnote;
    if (trimmedComment) {
      highlight.wrapper.dataset.readerComment = trimmedComment;
    } else {
      delete highlight.wrapper.dataset.readerComment;
    }

    this.panel?.updateHint(this.messages.panel.hint);
    this.syncHighlightsUi();
    this.panel?.stopEditing();
  }

  private normalizeSelectedText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }
}
