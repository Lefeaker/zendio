import { ClipperDialog } from '../clipper/components/dialog';
import { InlineStyleManager } from '../clipper/shared/styleManager';
import { generateTextFragmentUrl } from '../clipper/utils/textFragment';
import { READER_STYLES } from './styles';
import { ReaderPanel, ReaderPanelTexts } from './ui/panel';
import {
  buildReaderHighlightsMarkdown,
  buildReaderFullMarkdown,
  type ReaderHighlightInput,
  type ReaderMarkdownPayload
} from './utils/markdownBuilder';
import { getMessages } from '../../i18n';
import type { ReadingSessionOptions } from '../../shared/types/options';

interface ReaderHighlight {
  id: string;
  selectedHtml: string;
  selectedText: string;
  comment: string;
  fragmentUrl: string;
  wrapper: HTMLElement;
  footnoteIndex?: number;
}

export interface ReaderBootstrapHighlight {
  range: Range;
  selectedHtml: string;
  selectedText: string;
  comment: string;
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
    hint: 'Tip: release the mouse to open the annotation dialog; leave it blank to save highlight only.'
  },
  hintNoHighlights: 'No highlights yet. Select some text first.',
  hintExporting: 'Generating Markdown...',
  hintFailure: 'Export failed, please try again later.',
  hintSelectionFailure: 'Failed to highlight, please try again.'
};

const DEFAULT_READING_CONFIG: ReadingSessionOptions = {
  exportMode: 'highlights'
};

async function loadReadingConfig(): Promise<ReadingSessionOptions> {
  try {
    const { options } = await chrome.storage.sync.get('options');
    const reading = options?.readingSession as ReadingSessionOptions | undefined;
    if (reading?.exportMode === 'full') {
      return { exportMode: 'full' };
    }
  } catch (error) {
    console.warn('[ReaderSession] Failed to load reading config, using defaults:', error);
  }
  return DEFAULT_READING_CONFIG;
}

declare global {
  interface Window {
    __aiobReaderActive?: boolean;
    __aiobReaderController?: ReaderSession;
  }
}

export const ADD_HIGHLIGHT_EVENT = 'aiob-reader:add-highlight';

interface ExternalHighlightPayload {
  range: Range;
  selectedHtml: string;
  selectedText: string;
  comment: string;
}

export class ReaderSession {
  private highlights: ReaderHighlight[] = [];
  private panel: ReaderPanel | null = null;
  private styleManager: InlineStyleManager;
  private handlingSelection = false;
  private exporting = false;
  private messages: SessionMessages = DEFAULT_SESSION_MESSAGES;
  private externalHighlightHandler: ((event: Event) => void) | null = null;

  constructor(private readonly doc: Document, private readonly url: string) {
    this.styleManager = new InlineStyleManager(doc);
  }

  async start(initialHighlights?: ReaderBootstrapHighlight | ReaderBootstrapHighlight[]): Promise<void> {
    if (window.__aiobReaderActive) {
      return;
    }

    window.__aiobReaderActive = true;
    this.doc.documentElement.dataset.aiobReaderActive = 'true';

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
          hint: msgs.readerPanelHint
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

    this.styleManager.mount(READER_STYLES);

    this.panel = new ReaderPanel({
      onFinish: () => void this.finish(),
      onCancel: () => this.cancel()
    }, this.messages.panel);
    this.panel.updateCount(0);

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

  private handleMouseUp = async (_event: MouseEvent): Promise<void> => {
    if (this.handlingSelection || this.exporting) {
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

    const range = selection.getRangeAt(0);
    const savedRange = range.cloneRange();

    const container = this.doc.createElement('div');
    container.appendChild(savedRange.cloneContents());
    const selectedHtml = container.innerHTML;

    this.handlingSelection = true;

    try {
      const dialog = new ClipperDialog();
      const dialogResult = await dialog.show(selectedText, { allowReaderMode: false });
      if (dialogResult.action !== 'clip') {
        selection.removeAllRanges();
        return;
      }

      this.addHighlightFromRange(savedRange, selectedHtml, selectedText, dialogResult.comment.trim());
      selection.removeAllRanges();
    } catch (error) {
      console.error('[ReaderSession] Failed to capture selection:', error);
      this.panel?.updateHint(this.messages.hintSelectionFailure);
    } finally {
      this.handlingSelection = false;
    }
  };

  private handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
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
    if (this.externalHighlightHandler) {
      this.doc.removeEventListener(ADD_HIGHLIGHT_EVENT, this.externalHighlightHandler as EventListener);
      this.externalHighlightHandler = null;
    }

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
    this.exporting = false;
    this.handlingSelection = false;

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
}
