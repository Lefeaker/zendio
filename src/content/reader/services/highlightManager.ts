import type { ReaderHighlightTheme } from '@shared/types/options';
import { applyHighlightThemeState } from '../../shared/highlightThemeState';
import type { ReaderHighlightRecord } from './highlightTypes';
import {
  createHighlightWrappers as createRangeHighlightWrappers,
  flattenNestedHighlightMarks as flattenNestedRangeHighlightMarks,
  mergeWrapperSegments as mergeRangeWrapperSegments
} from './highlightRangeWrapping';
import {
  getPrimaryHighlightWrapper,
  reconstructHighlightText,
  unwrapHighlightWrappers
} from './highlightWrapperRestoration';

export type { ReaderHighlightRecord } from './highlightTypes';

export interface CreateHighlightOptions {
  id: string;
  range: Range;
  selectedHtml: string;
  selectedText: string;
  comment: string;
  fragmentUrl: string;
}

export class ReaderHighlightManager {
  private currentTheme: ReaderHighlightTheme | null = null;

  constructor(private readonly doc: Document) {}

  applyTheme(theme: ReaderHighlightTheme): void {
    if (this.currentTheme === theme) {
      return;
    }
    this.currentTheme = theme;
    applyHighlightThemeState(this.doc, theme);
  }

  createHighlight(options: CreateHighlightOptions): ReaderHighlightRecord | null {
    const highlightRange = options.range.cloneRange();
    const wrapperSegments = this.createHighlightWrappers(highlightRange, options.id);
    if (!wrapperSegments.length) {
      return null;
    }
    const primaryWrapper = wrapperSegments[0];
    const trimmedComment = options.comment.trim();

    const highlight: ReaderHighlightRecord = {
      id: options.id,
      selectedHtml: options.selectedHtml,
      selectedText: options.selectedText,
      comment: trimmedComment,
      fragmentUrl: options.fragmentUrl,
      wrapper: primaryWrapper,
      wrapperSegments,
      createdAt: Date.now()
    };

    this.updateSegmentMetadata(highlight, trimmedComment);
    return highlight;
  }

  updateComment(highlight: ReaderHighlightRecord, comment: string): void {
    const trimmed = comment.trim();
    highlight.comment = trimmed;
    delete (highlight as Partial<ReaderHighlightRecord>).footnoteIndex;
    this.updateSegmentMetadata(highlight, trimmed);
  }

  assignFootnote(highlight: ReaderHighlightRecord, comment: string, footnoteIndex?: number): void {
    const trimmed = comment.trim();
    highlight.comment = trimmed;
    if (footnoteIndex !== undefined) {
      highlight.footnoteIndex = footnoteIndex;
    } else {
      delete (highlight as Partial<ReaderHighlightRecord>).footnoteIndex;
    }
    this.updateSegmentMetadata(highlight, trimmed, footnoteIndex);
  }

  unwrapHighlight(highlight: ReaderHighlightRecord): void {
    unwrapHighlightWrappers(highlight);
  }

  getPrimaryWrapper(highlight: ReaderHighlightRecord): HTMLElement | null {
    return getPrimaryHighlightWrapper(highlight);
  }

  sortByDocumentOrder(highlights: ReaderHighlightRecord[]): void {
    highlights.sort((a, b) => {
      const wrapperA = this.getPrimaryWrapper(a);
      const wrapperB = this.getPrimaryWrapper(b);
      if (wrapperA === wrapperB) {
        return 0;
      }
      if (!wrapperA) {
        return 1;
      }
      if (!wrapperB) {
        return -1;
      }
      const position = wrapperA.compareDocumentPosition(wrapperB);
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      return 0;
    });
  }

  focusHighlight(
    highlight: ReaderHighlightRecord,
    currentTimeout: number | null,
    timer: Pick<Window, 'setTimeout' | 'clearTimeout'> = window
  ): number | null {
    const wrapper = this.getPrimaryWrapper(highlight);
    if (!wrapper) {
      return null;
    }

    try {
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch {
      wrapper.scrollIntoView();
    }

    if (currentTimeout !== null) {
      timer.clearTimeout(currentTimeout);
    }

    this.doc
      .querySelectorAll<HTMLElement>('.aiob-reader-highlight--focus')
      .forEach((element) => element.classList.remove('aiob-reader-highlight--focus'));

    wrapper.classList.add('aiob-reader-highlight--focus');
    return timer.setTimeout(() => {
      wrapper.classList.remove('aiob-reader-highlight--focus');
    }, 1600);
  }

  reconstructText(highlight: ReaderHighlightRecord): string {
    return reconstructHighlightText(highlight);
  }

  private createHighlightWrappers(range: Range, highlightId: string): HTMLElement[] {
    return createRangeHighlightWrappers(this.doc, range, highlightId);
  }

  private mergeWrapperSegments(segments: HTMLElement[], highlightId: string): HTMLElement[] {
    return mergeRangeWrapperSegments(this.doc, segments, highlightId);
  }

  private flattenNestedHighlightMarks(wrapper: HTMLElement): void {
    flattenNestedRangeHighlightMarks(wrapper);
  }

  private updateSegmentMetadata(
    highlight: ReaderHighlightRecord,
    comment: string,
    footnoteIndex?: number
  ): void {
    const trimmedComment = comment.trim();
    const totalSegments = highlight.wrapperSegments.length;

    highlight.wrapperSegments.forEach((segment, index) => {
      segment.dataset.segmentIndex = String(index);
      const role =
        totalSegments === 1
          ? 'single'
          : index === 0
            ? 'start'
            : index === totalSegments - 1
              ? 'end'
              : 'middle';

      segment.dataset.readerSegmentRole = role;

      if (trimmedComment) {
        segment.dataset.readerComment = trimmedComment;
      } else {
        delete segment.dataset.readerComment;
      }

      if (footnoteIndex !== undefined && (role === 'end' || role === 'single')) {
        segment.dataset.readerFootnote = String(footnoteIndex);
      } else {
        delete segment.dataset.readerFootnote;
      }
    });
  }
}
