import type { ReaderHighlightTheme } from '@shared/types/options';
import { applyHighlightThemeState } from '../../shared/highlightThemeState';

const BLOCK_LEVEL_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'BODY',
  'CAPTION',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL'
]);

export interface ReaderHighlightRecord {
  id: string;
  selectedHtml: string;
  selectedText: string;
  comment: string;
  fragmentUrl: string;
  wrapper: HTMLElement;
  wrapperSegments: HTMLElement[];
  footnoteIndex?: number;
  createdAt: number;
}

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
    const rawSegments = this.createHighlightWrappers(highlightRange, options.id);
    const wrapperSegments = this.mergeWrapperSegments(rawSegments, options.id);
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
    for (const wrapper of highlight.wrapperSegments) {
      const parent = wrapper.parentNode;
      if (!parent) {
        continue;
      }
      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
      }
      wrapper.remove();
    }
  }

  getPrimaryWrapper(highlight: ReaderHighlightRecord): HTMLElement | null {
    if (highlight.wrapper.isConnected) {
      return highlight.wrapper;
    }
    for (const segment of highlight.wrapperSegments) {
      if (segment.isConnected) {
        highlight.wrapper = segment;
        return segment;
      }
    }
    return null;
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
    if (highlight.wrapperSegments.length <= 1) {
      return highlight.selectedText;
    }

    const connectedSegments = highlight.wrapperSegments.filter((segment) => segment.isConnected);
    if (!connectedSegments.length) {
      return highlight.selectedText;
    }

    connectedSegments.sort((a, b) => {
      const indexA = parseInt(a.dataset.segmentIndex || '0', 10);
      const indexB = parseInt(b.dataset.segmentIndex || '0', 10);
      if (a.dataset.segmentIndex && b.dataset.segmentIndex) {
        return indexA - indexB;
      }
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      return 0;
    });

    const segmentTexts = connectedSegments.map((segment) => segment.textContent || '');
    let reconstructedText = '';

    for (let i = 0; i < segmentTexts.length; i++) {
      const currentText = segmentTexts[i];
      if (i > 0) {
        const prevText = segmentTexts[i - 1];
        const prevChar = prevText?.slice(-1) ?? '';
        const nextChar = currentText?.charAt(0) ?? '';
        const isAsciiWordChar = (char: string): boolean => /[A-Za-z0-9]/.test(char);
        const isCjkChar = (char: string): boolean => /[\u3400-\u9FFF]/.test(char);
        const needsSpace =
          prevText &&
          currentText &&
          !prevText.endsWith(' ') &&
          !currentText.startsWith(' ') &&
          !prevText.match(/[。，、；：！？）】」』]$/) &&
          !currentText.match(/^[。，、；：！？（【「『]/) &&
          !prevText.match(/[.,:;!?)\]}]$/) &&
          !currentText.match(/^[.,:;!?([{]/) &&
          !(isCjkChar(prevChar) && isCjkChar(nextChar)) &&
          (isAsciiWordChar(prevChar) || isAsciiWordChar(nextChar));
        if (needsSpace) {
          reconstructedText += ' ';
        }
      }
      reconstructedText += currentText;
    }

    const normalizedReconstructed = this.normalizeText(reconstructedText);
    const normalizedOriginal = this.normalizeText(highlight.selectedText);

    if (highlight.wrapperSegments.length > 1) {
      if (normalizedReconstructed.length >= normalizedOriginal.length) {
        return reconstructedText;
      }
    }

    if (
      normalizedReconstructed.length > normalizedOriginal.length * 1.1 ||
      (normalizedOriginal.length < 10 && normalizedReconstructed.length > normalizedOriginal.length)
    ) {
      return reconstructedText;
    }

    return highlight.selectedText;
  }

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private createHighlightWrappers(range: Range, highlightId: string): HTMLElement[] {
    const baseRange = range.cloneRange();
    const textNodes: Text[] = [];
    const walker = this.doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!range.intersectsNode(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.textContent?.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text);
    }

    const wrappers: HTMLElement[] = [];
    for (const node of textNodes) {
      const highlightRange = this.doc.createRange();
      try {
        const maxOffset = node.textContent?.length ?? 0;
        const startOffset = node === range.startContainer ? range.startOffset : 0;
        const endOffset = node === range.endContainer ? range.endOffset : maxOffset;

        if (endOffset <= startOffset) {
          highlightRange.detach?.();
          continue;
        }

        highlightRange.setStart(node, startOffset);
        highlightRange.setEnd(node, endOffset);
      } catch {
        highlightRange.setStart(node, 0);
        highlightRange.setEnd(node, node.textContent?.length ?? 0);
      }

      const wrapper = this.doc.createElement('mark');
      wrapper.className = 'aiob-reader-highlight';
      wrapper.dataset.readerHighlightId = highlightId;

      try {
        highlightRange.surroundContents(wrapper);
        wrappers.push(wrapper);
      } catch {
        const fragment = highlightRange.extractContents();
        if (!fragment.childNodes.length) {
          highlightRange.detach?.();
          continue;
        }
        wrapper.appendChild(fragment);
        this.flattenNestedHighlightMarks(wrapper);
        highlightRange.insertNode(wrapper);
        wrappers.push(wrapper);
      }

      highlightRange.detach?.();
    }

    if (!wrappers.length) {
      const fallbackWrapper = this.doc.createElement('mark');
      fallbackWrapper.className = 'aiob-reader-highlight';
      fallbackWrapper.dataset.readerHighlightId = highlightId;

      const fragment = baseRange.extractContents();
      if (!fragment.childNodes.length) {
        baseRange.detach?.();
        return wrappers;
      }
      fallbackWrapper.appendChild(fragment);
      this.flattenNestedHighlightMarks(fallbackWrapper);
      baseRange.insertNode(fallbackWrapper);
      wrappers.push(fallbackWrapper);
    }

    baseRange.detach?.();
    return wrappers;
  }

  private mergeWrapperSegments(segments: HTMLElement[], highlightId: string): HTMLElement[] {
    const connectedSegments = segments.filter((segment) => segment.isConnected);
    if (connectedSegments.length <= 1) {
      return connectedSegments.length ? connectedSegments : segments;
    }

    const referenceBlock = this.findBlockContainer(connectedSegments[0]);
    const canMerge =
      !!referenceBlock &&
      connectedSegments.every((segment) => this.findBlockContainer(segment) === referenceBlock) &&
      this.isSafeToMergeSegments(connectedSegments);

    if (!canMerge) {
      return connectedSegments;
    }

    const mergeRange = this.doc.createRange();
    mergeRange.setStartBefore(connectedSegments[0]);
    mergeRange.setEndAfter(connectedSegments[connectedSegments.length - 1]);

    const wrapper = this.doc.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = highlightId;

    try {
      const fragment = mergeRange.extractContents();
      wrapper.appendChild(fragment);
      this.flattenNestedHighlightMarks(wrapper);
      mergeRange.insertNode(wrapper);
      mergeRange.detach?.();
      return [wrapper];
    } catch (error) {
      console.warn('[ReaderHighlightManager] Failed to merge highlight segments:', error);
      mergeRange.detach?.();
      return connectedSegments;
    }
  }

  private isSafeToMergeSegments(segments: HTMLElement[]): boolean {
    const probeRange = this.doc.createRange();
    probeRange.setStartBefore(segments[0]);
    probeRange.setEndAfter(segments[segments.length - 1]);
    const fragment = probeRange.cloneContents();
    probeRange.detach?.();

    return !this.hasMeaningfulNonHighlightContent(fragment);
  }

  private hasMeaningfulNonHighlightContent(
    node: Node,
    insideHighlight = false
  ): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      return !insideHighlight && Boolean(node.textContent?.trim());
    }

    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      return false;
    }

    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : null;
    const nextInsideHighlight =
      insideHighlight ||
      (element?.tagName === 'MARK' && element.classList.contains('aiob-reader-highlight'));

    if (
      element &&
      !nextInsideHighlight &&
      !element.childNodes.length &&
      ['IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG', 'BR', 'HR', 'IFRAME'].includes(element.tagName)
    ) {
      return true;
    }

    for (const child of Array.from(node.childNodes)) {
      if (this.hasMeaningfulNonHighlightContent(child, nextInsideHighlight)) {
        return true;
      }
    }

    return false;
  }

  private findBlockContainer(element: HTMLElement | null): HTMLElement | null {
    let current: HTMLElement | null = element;
    while (current) {
      if (BLOCK_LEVEL_TAGS.has(current.tagName)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
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

  private flattenNestedHighlightMarks(wrapper: HTMLElement): void {
    const nestedMarks = Array.from(
      wrapper.querySelectorAll<HTMLElement>('mark.aiob-reader-highlight')
    );
    for (const nested of nestedMarks) {
      if (nested === wrapper) {
        continue;
      }
      const parent = nested.parentNode;
      if (!parent) {
        continue;
      }
      while (nested.firstChild) {
        parent.insertBefore(nested.firstChild, nested);
      }
      parent.removeChild(nested);
    }
  }
}
