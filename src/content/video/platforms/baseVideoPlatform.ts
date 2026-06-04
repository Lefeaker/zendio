import type { VideoFragmentCapture } from '../types';
import type { VideoPlatform } from '../utils';
import type {
  PlatformSelectionInput,
  PlatformSelectionResult,
  TimestampBuildContext,
  VideoPlatformAdapter,
  VideoPlatformContext
} from './videoPlatformTypes';

export type {
  PlatformSelectionInput,
  PlatformSelectionResult,
  TimestampBuildContext,
  VideoPlatformAdapter,
  VideoPlatformContext
} from './videoPlatformTypes';

export class BaseVideoPlatform implements VideoPlatformAdapter {
  constructor(
    public readonly platform: VideoPlatform,
    protected readonly context: VideoPlatformContext
  ) {}

  protected get document(): Document {
    return this.context.doc;
  }

  shouldActivate(_doc: Document): boolean {
    return true;
  }

  resolveSelection(input: PlatformSelectionInput): PlatformSelectionResult | null {
    const text = this.normalizeWhitespace(input.selectedText);
    if (!text) {
      return null;
    }

    const html = input.selectedHtml.trim().length
      ? input.selectedHtml
      : this.wrapPlainTextAsHtml(text);

    return {
      text,
      html,
      ...(input.range !== null && { range: input.range })
    };
  }

  findTextRange(text: string): Range | null {
    const normalized = this.normalizeWhitespace(text);
    if (!normalized) {
      return null;
    }

    const rangeWithFinder = this.findRangeWithWindowFind(normalized);
    if (rangeWithFinder) {
      return rangeWithFinder;
    }

    return this.findRangeWithWalker(normalized);
  }

  highlight(range: Range, captureId: string, fragmentUrl: string): string | undefined {
    return this.context.highlightSelection(range, captureId, fragmentUrl);
  }

  restoreHighlight(capture: VideoFragmentCapture): string | undefined {
    const existing = capture.wrapperId ? this.context.getElementByIdDeep(capture.wrapperId) : null;
    if (existing) {
      this.context.decorateHighlight(existing);
      this.context.scheduleFragmentHighlightRestore();
      return existing.id || capture.wrapperId;
    }

    const existingByData = this.context.querySelectorDeep<HTMLElement>(
      `mark[data-video-fragment-id="${capture.id}"]`
    );
    if (existingByData) {
      if (!existingByData.id) {
        existingByData.id = `${capture.id}-wrapper`;
      }
      this.context.decorateHighlight(existingByData);
      this.context.scheduleFragmentHighlightRestore();
      return existingByData.id;
    }

    const range = this.findTextRange(capture.selectedText);
    if (!range) {
      return capture.wrapperId;
    }

    const wrapperId = this.highlight(range, capture.id, capture.fragmentUrl);
    if (wrapperId) {
      this.context.scheduleFragmentHighlightRestore();
    }
    return wrapperId;
  }

  observeDomChanges(_observer: MutationObserver): void {
    // Default platforms do not need additional DOM observation.
  }

  handleMutations(_mutations: MutationRecord[]): void {
    // Default platforms do not need mutation handling hooks.
  }

  observeSelectionRoots(): void {
    // Default platforms do not need shadow-root selection observation.
  }

  buildTimestampUrl(_timeSec: number, _ctx: TimestampBuildContext): string | null {
    return null;
  }

  formatVideoTitle(_rawTitle: string): string | null {
    return null;
  }

  dispose(): void {
    // No-op by default.
  }

  protected normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  protected wrapPlainTextAsHtml(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) {
      return '';
    }
    return `<p>${this.escapeHtml(trimmed)}</p>`;
  }

  protected escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  protected shouldSkipTextNode(node: Text): boolean {
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

  protected findRangeWithWindowFind(normalized: string): Range | null {
    const selection = this.document.defaultView?.getSelection() ?? window.getSelection();
    const finder = (this.document.defaultView ?? window) as typeof window & {
      find?: (
        searchString: string,
        caseSensitive?: boolean,
        backwards?: boolean,
        wrapAround?: boolean,
        wholeWord?: boolean,
        searchInFrames?: boolean,
        showDialog?: boolean
      ) => boolean;
    };

    const findMethod = finder.find;
    if (!selection || typeof findMethod !== 'function') {
      return null;
    }

    selection.removeAllRanges();
    const found =
      findMethod.call(finder, normalized, false, false, true, false, false, false) === true;
    if (found && selection.rangeCount > 0) {
      const clone = selection.getRangeAt(0).cloneRange();
      selection.removeAllRanges();
      return clone;
    }
    selection.removeAllRanges();
    return null;
  }

  protected findRangeWithWalker(normalized: string): Range | null {
    const root: Node | null = this.document.body ?? this.document.documentElement;
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

    const range = this.document.createRange();
    range.setStart(startChar.node, startChar.offset);
    range.setEnd(endChar.node, endChar.offset + 1);
    return range;
  }

  protected traverseShadowInclusive<T>(
    node: Node | null,
    visitor: (node: Node) => T | null
  ): T | null {
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

  protected isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }
}
