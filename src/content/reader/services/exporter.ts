import type { ReaderHighlightInput, ReaderMarkdownPayload } from '../utils/markdownBuilder';
import type { ReaderHighlightRecord, ReaderHighlightManager } from './highlightManager';

export interface ReaderMarkdownBuilders {
  buildHighlightsMarkdown: (input: {
    pageTitle: string;
    pageUrl: string;
    highlights: ReaderHighlightInput[];
  }) => ReaderMarkdownPayload;
  buildFullMarkdown: (input: {
    pageTitle: string;
    pageUrl: string;
    highlights: ReaderHighlightInput[];
    documentClone: Document;
  }) => ReaderMarkdownPayload;
}

export interface ReaderExporterDependencies extends Partial<ReaderMarkdownBuilders> {
  loadMarkdownBuilders?: () => Promise<ReaderMarkdownBuilders>;
}

export type ReaderExportMode = 'highlights' | 'full';

export interface BuildMarkdownOptions {
  mode: ReaderExportMode;
  pageTitle: string;
  pageUrl: string;
  highlights: ReaderHighlightInput[];
  documentClone?: Document;
}

export class ReaderSessionExporter {
  private markdownBuildersPromise: Promise<ReaderMarkdownBuilders> | null = null;

  constructor(private readonly deps: ReaderExporterDependencies) {}

  prepareHighlights(
    highlights: ReaderHighlightRecord[],
    manager: ReaderHighlightManager
  ): ReaderHighlightInput[] {
    let footnoteCursor = 1;

    return highlights.map((highlight) => {
      const trimmedComment = highlight.comment.trim();
      let footnoteIndex: number | undefined;
      if (trimmedComment) {
        footnoteIndex = footnoteCursor++;
      }

      manager.assignFootnote(highlight, trimmedComment, footnoteIndex);

      const reconstructedText = manager.reconstructText(highlight);
      const payload: ReaderHighlightInput = {
        id: highlight.id,
        selectedHtml: highlight.selectedHtml,
        selectedText: reconstructedText,
        comment: trimmedComment,
        fragmentUrl: highlight.fragmentUrl
      };

      if (footnoteIndex !== undefined) {
        payload.footnoteIndex = footnoteIndex;
      }

      return payload;
    });
  }

  applyTokens(clone: Document, highlights: ReaderHighlightInput[]): void {
    this.normalizeCloneHighlightSegments(clone, highlights);
    this.applyFootnotesToClone(clone, highlights);
  }

  async buildMarkdown(options: BuildMarkdownOptions): Promise<ReaderMarkdownPayload> {
    const builders = await this.getMarkdownBuilders();

    if (options.mode === 'full') {
      if (!options.documentClone) {
        throw new Error('[ReaderSessionExporter] documentClone is required for full export mode.');
      }
      return builders.buildFullMarkdown({
        pageTitle: options.pageTitle,
        pageUrl: options.pageUrl,
        highlights: options.highlights,
        documentClone: options.documentClone
      });
    }

    return builders.buildHighlightsMarkdown({
      pageTitle: options.pageTitle,
      pageUrl: options.pageUrl,
      highlights: options.highlights
    });
  }

  private getMarkdownBuilders(): Promise<ReaderMarkdownBuilders> {
    if (this.markdownBuildersPromise !== null) {
      return this.markdownBuildersPromise;
    }

    if (this.deps.loadMarkdownBuilders) {
      this.markdownBuildersPromise = this.deps.loadMarkdownBuilders();
      return this.markdownBuildersPromise;
    }

    const { buildHighlightsMarkdown, buildFullMarkdown } = this.deps;
    if (!buildHighlightsMarkdown || !buildFullMarkdown) {
      throw new Error('[ReaderSessionExporter] Markdown builders are not configured.');
    }

    this.markdownBuildersPromise = Promise.resolve({
      buildHighlightsMarkdown,
      buildFullMarkdown
    });
    return this.markdownBuildersPromise;
  }

  private normalizeCloneHighlightSegments(clone: Document, highlights: ReaderHighlightInput[]): void {
    const processed = new Set<string>();
    for (const highlight of highlights) {
      const id = highlight.id;
      if (!id || processed.has(id)) {
        continue;
      }
      processed.add(id);

      const segments = Array.from(
        clone.querySelectorAll<HTMLElement>(`mark.aiob-reader-highlight[data-reader-highlight-id="${id}"]`)
      );
      if (!segments.length) {
        continue;
      }

      segments.sort((a, b) => {
        if (a === b) {
          return 0;
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

      const firstSegment = segments[0];
      const lastSegment = segments[segments.length - 1];

      const startToken = clone.createTextNode(`[[AIIOB_HL:${id}:S]]`);
      const startRange = clone.createRange();
      startRange.setStartBefore(firstSegment);
      startRange.collapse(true);
      startRange.insertNode(startToken);
      startRange.detach?.();

      const endTokenValue =
        highlight.footnoteIndex !== undefined
          ? `[[AIIOB_HL:${id}:E:${highlight.footnoteIndex}]]`
          : `[[AIIOB_HL:${id}:E]]`;
      const endToken = clone.createTextNode(endTokenValue);
      const endRange = clone.createRange();
      endRange.setStartAfter(lastSegment);
      endRange.collapse(true);
      endRange.insertNode(endToken);
      endRange.detach?.();

      segments.forEach((segment, index) => {
        segment.dataset.segmentIndex = String(index);
        const role =
          segments.length === 1
            ? 'single'
            : index === 0
              ? 'start'
              : index === segments.length - 1
                ? 'end'
                : 'middle';
        segment.dataset.readerSegmentRole = role;
        if (highlight.footnoteIndex !== undefined && (role === 'end' || role === 'single')) {
          segment.dataset.readerFootnote = String(highlight.footnoteIndex);
        } else {
          delete segment.dataset.readerFootnote;
        }
        this.unwrapElement(segment);
      });

      this.stripInlineFormattingBetweenTokens(startToken, endToken);
    }
  }

  private applyFootnotesToClone(clone: Document, highlights: ReaderHighlightInput[]): void {
    for (const highlight of highlights) {
      if (!highlight.id) {
        continue;
      }
      const nodes = clone.querySelectorAll<HTMLElement>(`[data-reader-highlight-id="${highlight.id}"]`);
      nodes.forEach((node) => {
        const role = node.dataset.readerSegmentRole ?? 'single';
        if (highlight.footnoteIndex && (role === 'end' || role === 'single')) {
          node.setAttribute('data-reader-footnote', String(highlight.footnoteIndex));
        } else {
          node.removeAttribute('data-reader-footnote');
        }
        if (highlight.comment) {
          node.setAttribute('data-reader-comment', highlight.comment);
        } else {
          node.removeAttribute('data-reader-comment');
        }
      });
    }
  }

  private stripInlineFormattingBetweenTokens(startToken: Node, endToken: Node): void {
    const inlineTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'MARK', 'SMALL', 'SUB', 'SUP']);
    let current: Node | null = startToken.nextSibling;
    while (current && current !== endToken) {
      const next = current.nextSibling;
      if (current.nodeType === Node.ELEMENT_NODE && inlineTags.has((current as Element).tagName)) {
        this.unwrapElement(current as HTMLElement);
      }
      current = next;
    }
  }

  private unwrapElement(node: HTMLElement): void {
    const parent = node.parentNode;
    if (!parent) {
      return;
    }
    while (node.firstChild) {
      parent.insertBefore(node.firstChild, node);
    }
    parent.removeChild(node);
  }
}
