import { generateTextFragmentUrl } from '../clipper/utils/textFragment';
import type { ReaderHighlightManager, ReaderHighlightRecord } from './services/highlightManager';
import type { ReaderPanelCoordinator } from './panelCoordinator';

export interface ReaderHighlightControllerOptions {
  doc: Document;
  url: string;
  highlightManager: ReaderHighlightManager;
  panelCoordinator: ReaderPanelCoordinator;
}

/**
 * 负责 ReaderSession 内的高亮列表管理，集中处理 UI 同步与 DOM 交互。
 */
export class ReaderHighlightController {
  private highlights: ReaderHighlightRecord[] = [];
  private highlightFocusTimeout: number | null = null;

  constructor(private readonly options: ReaderHighlightControllerOptions) {}

  addHighlightFromRange(
    range: Range,
    selectedHtml: string,
    selectedText: string,
    comment: string
  ): void {
    const highlightId = `aiob-reader-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const fragmentUrl = generateTextFragmentUrl(this.options.url, selectedText);

    const highlight = this.options.highlightManager.createHighlight({
      id: highlightId,
      range,
      selectedHtml,
      selectedText,
      comment,
      fragmentUrl
    });

    if (!highlight) {
      return;
    }

    this.highlights.push(highlight);
    this.options.highlightManager.sortByDocumentOrder(this.highlights);
    this.syncPanel('panel');
  }

  ingestExternalHighlight(
    range: Range,
    selectedHtml: string,
    selectedText: string,
    comment: string
  ): void {
    this.addHighlightFromRange(range, selectedHtml, selectedText, comment);
  }

  removeHighlightById(id: string): void {
    const index = this.highlights.findIndex((highlight) => highlight.id === id);
    if (index === -1) {
      return;
    }
    const [removed] = this.highlights.splice(index, 1);
    this.options.highlightManager.unwrapHighlight(removed);
    this.options.highlightManager.sortByDocumentOrder(this.highlights);
    this.syncPanel(this.highlights.length ? 'panel' : 'noHighlights');
  }

  submitHighlightEdit(id: string, nextComment: string): void {
    const highlight = this.highlights.find((item) => item.id === id);
    if (!highlight) {
      this.options.panelCoordinator.stopEditing();
      return;
    }
    this.options.highlightManager.updateComment(highlight, nextComment);
    this.options.panelCoordinator.updateHighlights(this.highlights);
    this.options.panelCoordinator.applyHint('panel', this.highlights.length);
    this.options.panelCoordinator.stopEditing();
  }

  focusHighlight(id: string): void {
    const highlight = this.highlights.find((item) => item.id === id);
    if (!highlight) {
      return;
    }
    const primaryWrapper = this.options.highlightManager.getPrimaryWrapper(highlight);
    if (!primaryWrapper) {
      return;
    }

    try {
      primaryWrapper.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch {
      primaryWrapper.scrollIntoView();
    }

    this.clearFocusState();
    for (const segment of highlight.wrapperSegments) {
      if (segment.isConnected) {
        segment.classList.add('aiob-reader-highlight--focus');
      }
    }
    this.highlightFocusTimeout = window.setTimeout(() => {
      this.clearFocusState();
    }, 1600);
  }

  resetHighlights(): void {
    for (const highlight of this.highlights) {
      this.options.highlightManager.unwrapHighlight(highlight);
    }
    this.highlights = [];
    this.clearFocusState();
    this.options.panelCoordinator.updateHighlights(this.highlights);
    this.options.panelCoordinator.applyHint('noHighlights', 0);
  }

  getHighlights(): ReaderHighlightRecord[] {
    return this.highlights;
  }

  refreshHint(): void {
    this.options.panelCoordinator.refreshHint(this.highlights.length);
  }

  /** 仅用于测试：直接替换高亮集合 */
  setHighlightsForTests(highlights: ReaderHighlightRecord[]): void {
    this.highlights = [...highlights];
  }

  private syncPanel(state: 'panel' | 'noHighlights'): void {
    this.options.panelCoordinator.updateHighlights(this.highlights);
    this.options.panelCoordinator.applyHint(state, this.highlights.length);
  }

  private clearFocusState(): void {
    if (this.highlightFocusTimeout !== null) {
      window.clearTimeout(this.highlightFocusTimeout);
      this.highlightFocusTimeout = null;
    }
    this.options.doc
      .querySelectorAll<HTMLElement>('.aiob-reader-highlight--focus')
      .forEach((element) => {
        element.classList.remove('aiob-reader-highlight--focus');
      });
  }
}
