import {
  BaseVideoPlatform,
  type PlatformSelectionInput,
  type PlatformSelectionResult,
  type TimestampBuildContext,
  type VideoPlatformContext
} from './baseVideoPlatform';
import type { VideoFragmentCapture } from '../types';
import {
  buildRangeCoveringBilibiliRichText as buildBilibiliRichTextRange,
  buildBilibiliSearchCandidates,
  extractBilibiliSelection,
  extractBilibiliSelectionFromEvent,
  findBilibiliTextRangeInScopedNodes,
  findBilibiliTextRangeInShadowDOM
} from './bilibiliPlatformSelection';
import { BilibiliShadowObserver } from './bilibiliPlatformObserver';
import { collectBilibiliCommentRestoreRoots } from './bilibiliCommentRestoreScope';

export class BilibiliVideoPlatform extends BaseVideoPlatform {
  private readonly selectionHelpers = {
    document: this.document,
    normalizeWhitespace: (value: string) => this.normalizeWhitespace(value),
    wrapPlainTextAsHtml: (value: string) => this.wrapPlainTextAsHtml(value),
    escapeHtml: (value: string) => this.escapeHtml(value),
    shouldSkipTextNode: (node: Text) => this.shouldSkipTextNode(node),
    isWhitespace: (value: string) => this.isWhitespace(value)
  };
  private readonly shadowObserver: BilibiliShadowObserver;

  constructor(context: VideoPlatformContext) {
    super('bilibili', context);
    this.shadowObserver = new BilibiliShadowObserver(this.document, context);
  }

  shouldActivate(doc: Document): boolean {
    const hostname = doc.location?.hostname ?? '';
    return hostname.includes('bilibili.com');
  }

  resolveSelection(input: PlatformSelectionInput): PlatformSelectionResult | null {
    let range = input.range ? input.range.cloneRange() : null;
    let selectedText = this.normalizeWhitespace(input.selectedText);
    let selectedHtml = input.selectedHtml.trim();

    if (range && (!selectedText || !selectedHtml)) {
      const fallback = this.extractBilibiliSelection(range);
      if (fallback) {
        if (!selectedText && fallback.text.trim()) {
          selectedText = this.normalizeWhitespace(fallback.text);
        }
        if (!selectedHtml && fallback.html.trim()) {
          selectedHtml = fallback.html;
        }
      }
    }

    if ((!selectedText || !selectedHtml) && input.event) {
      const fallbackFromEvent = this.extractBilibiliSelectionFromEvent(
        input.event,
        range,
        selectedText
      );
      if (fallbackFromEvent) {
        if (!selectedText && fallbackFromEvent.text.trim()) {
          selectedText = this.normalizeWhitespace(fallbackFromEvent.text);
        }
        if (!selectedHtml && fallbackFromEvent.html.trim()) {
          selectedHtml = fallbackFromEvent.html;
        }
        if (!range && fallbackFromEvent.range) {
          range = fallbackFromEvent.range.cloneRange();
        }
      }
    }

    if (!selectedText) {
      return null;
    }

    const html = selectedHtml || this.wrapPlainTextAsHtml(selectedText);

    return {
      text: selectedText,
      html,
      ...(range !== null && { range })
    };
  }

  findTextRange(text: string): Range | null {
    const normalized = this.normalizeWhitespace(text);
    if (!normalized) {
      return null;
    }

    const candidates = this.buildSearchCandidates(normalized);
    for (const candidate of candidates) {
      const roots = this.shadowObserver.getObservedCommentRootsForSearch();
      const shadowRange = findBilibiliTextRangeInShadowDOM(candidate, this.selectionHelpers, roots);
      if (shadowRange) {
        return shadowRange;
      }
      const range = findBilibiliTextRangeInScopedNodes(
        candidate,
        this.selectionHelpers,
        collectBilibiliCommentRestoreRoots(this.document)
      );
      if (range) {
        return range;
      }
    }
    return null;
  }

  highlight(range: Range, captureId: string, fragmentUrl: string): string | undefined {
    this.shadowObserver.ensureObservedRoots();
    return super.highlight(range, captureId, fragmentUrl);
  }

  restoreHighlight(capture: VideoFragmentCapture): string | undefined {
    this.shadowObserver.ensureObservedRoots();
    return super.restoreHighlight(capture);
  }

  observeSelectionRoots(): void {
    this.shadowObserver.ensureObservedRoots();
  }

  observeDomChanges(observer: MutationObserver): void {
    this.shadowObserver.observeDomChanges(observer);
  }

  handleMutations(mutations: MutationRecord[]): void {
    this.shadowObserver.handleMutations(mutations);
  }

  private ensureShadowHostObservation(host: Element): void {
    this.shadowObserver.ensureShadowHostObservationForTests(host);
  }

  buildTimestampUrl(timeSec: number, ctx: TimestampBuildContext): string | null {
    try {
      const baseUrl = new URL(ctx.canonicalUrl || ctx.currentUrl);
      baseUrl.searchParams.set('t', String(timeSec));

      if (!baseUrl.searchParams.has('p')) {
        const activeEpisode = this.document.querySelector<HTMLElement>(
          '.video-episode-card__entry.is-active[data-index]'
        );
        if (activeEpisode) {
          const indexAttr = activeEpisode.dataset.index || activeEpisode.getAttribute('data-index');
          const parsedIndex = indexAttr ? Number.parseInt(indexAttr, 10) : Number.NaN;
          if (Number.isFinite(parsedIndex) && parsedIndex + 1 > 1) {
            baseUrl.searchParams.set('p', String(parsedIndex + 1));
          }
        }
      }

      return baseUrl.toString();
    } catch {
      return null;
    }
  }

  formatVideoTitle(rawTitle: string): string | null {
    const cleaned = rawTitle.replace(/_+哔哩哔哩.*/i, '').trim();
    return cleaned || null;
  }

  dispose(): void {
    this.shadowObserver.dispose();
  }

  private buildSearchCandidates(normalized: string): string[] {
    return buildBilibiliSearchCandidates(normalized);
  }

  private extractBilibiliSelection(range: Range): { text: string; html: string } | null {
    return extractBilibiliSelection(range, this.selectionHelpers);
  }

  private extractBilibiliSelectionFromEvent(
    event: Event,
    existingRange: Range | null,
    selectedText = ''
  ): { text: string; html: string; range?: Range } | null {
    return extractBilibiliSelectionFromEvent(
      event,
      existingRange,
      this.selectionHelpers,
      selectedText
    );
  }

  private buildRangeCoveringBilibiliRichText(host: HTMLElement): Range | null {
    return buildBilibiliRichTextRange(host, this.selectionHelpers);
  }
}
