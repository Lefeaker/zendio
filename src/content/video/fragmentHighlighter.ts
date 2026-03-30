import type { ReaderHighlightTheme } from '../../shared/types/options';
import {
  applyManagedShadowStyle,
  createManagedStyleSheet,
  removeManagedShadowStyle
} from '../shared/shadowStyleBridge';
import { applyHighlightThemeState, clearHighlightThemeState } from '../shared/highlightThemeState';

const VIDEO_HIGHLIGHT_BRIDGE_KEY = 'video-fragment-highlight';

export const AVAILABLE_HIGHLIGHT_THEMES: ReadonlyArray<ReaderHighlightTheme> = [
  'gradient',
  'purple',
  'neonYellow',
  'neonGreen',
  'neonOrange'
] as const;

export const DEFAULT_HIGHLIGHT_THEME: ReaderHighlightTheme = 'gradient';

export function resolveHighlightTheme(theme: unknown): ReaderHighlightTheme {
  return AVAILABLE_HIGHLIGHT_THEMES.includes(theme as ReaderHighlightTheme)
    ? (theme as ReaderHighlightTheme)
    : DEFAULT_HIGHLIGHT_THEME;
}

export class FragmentHighlighter {
  private shadowHighlightStyles: ShadowRoot[] = [];
  private highlightSheet: CSSStyleSheet | null = null;
  private currentTheme: ReaderHighlightTheme = DEFAULT_HIGHLIGHT_THEME;

  constructor(private readonly doc: Document) {}

  get theme(): ReaderHighlightTheme {
    return this.currentTheme;
  }

  setTheme(theme: ReaderHighlightTheme): void {
    this.currentTheme = theme;
    applyHighlightThemeState(this.doc, theme);
    this.refreshShadowHighlightStyles();
  }

  highlightRange(range: Range, captureId: string, fragmentUrl: string): string | undefined {
    const wrapperId = `${captureId}-wrapper`;
    const wrapper = this.doc.createElement('mark');
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
        console.warn('[FragmentHighlighter] Failed to wrap selection range:', error);
        return undefined;
      }
    }

    this.decorateElement(wrapper);
    return wrapperId;
  }

  decorateElement(element: HTMLElement): void {
    element.classList.add('aiob-reader-highlight', 'aiob-video-fragment-highlight');
    this.ensureHighlightStylesForNode(element);
  }

  decorateById(id: string | undefined): void {
    if (!id) {
      return;
    }
    const element = this.getElementByIdDeep(id);
    if (element instanceof HTMLElement) {
      this.decorateElement(element);
    }
  }

  ensureHighlightStyles(root: ShadowRoot): void {
    const css = this.buildHighlightCss();
    this.highlightSheet = createManagedStyleSheet(css);
    applyManagedShadowStyle(root, VIDEO_HIGHLIGHT_BRIDGE_KEY, css, this.highlightSheet);
    if (!this.shadowHighlightStyles.includes(root)) {
      this.shadowHighlightStyles.push(root);
    }
  }

  removeById(wrapperId: string): void {
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

  getElementByIdDeep(id: string): HTMLElement | null {
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

  querySelectorDeep<T extends Element>(selector: string): T | null {
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

  decorateExisting(wrapperIds: Iterable<string | null | undefined>): void {
    for (const id of wrapperIds) {
      if (!id) {
        continue;
      }
      const element = this.getElementByIdDeep(id);
      if (element instanceof HTMLElement) {
        this.decorateElement(element);
      }
    }
  }

  refreshShadowHighlightStyles(): void {
    const css = this.buildHighlightCss();
    this.highlightSheet = createManagedStyleSheet(css);
    this.shadowHighlightStyles = this.shadowHighlightStyles.filter((root) => {
      const host = root.host;
      if (!host || !host.isConnected) {
        removeManagedShadowStyle(root, VIDEO_HIGHLIGHT_BRIDGE_KEY);
        return false;
      }
      applyManagedShadowStyle(root, VIDEO_HIGHLIGHT_BRIDGE_KEY, css, this.highlightSheet);
      return true;
    });
  }

  reset(): void {
    for (const root of this.shadowHighlightStyles) {
      removeManagedShadowStyle(root, VIDEO_HIGHLIGHT_BRIDGE_KEY);
    }
    this.shadowHighlightStyles = [];
    this.highlightSheet = null;
    clearHighlightThemeState(this.doc);
  }

  private ensureHighlightStylesForNode(node: Node | null): void {
    if (!node) {
      return;
    }
    const root = node instanceof ShadowRoot ? node : node.getRootNode();
    if (root instanceof ShadowRoot) {
      this.ensureHighlightStyles(root);
    }
  }

  private buildHighlightCss(): string {
    const backgroundFallback =
      'linear-gradient(90deg, rgba(124, 92, 255, 0.45), rgba(87, 205, 255, 0.35))';
    const focusFallback = 'rgba(124, 92, 255, 0.45)';
    const focusSoftFallback = 'rgba(124, 92, 255, 0.2)';
    return [
      '.aiob-reader-highlight {',
      '  position: relative;',
      '  display: inline;',
      '  border-radius: 3px;',
      '  padding: 1px 0;',
      `  background: var(--reader-highlight-bg, ${backgroundFallback});`,
      '  background-repeat: no-repeat;',
      '  background-origin: border-box;',
      '  background-clip: border-box;',
      '  background-color: transparent !important;',
      '  color: inherit !important;',
      '  transition: box-shadow 0.3s ease;',
      '  isolation: isolate;',
      '  box-decoration-break: clone;',
      '  -webkit-box-decoration-break: clone;',
      '}',
      '',
      '.aiob-reader-highlight,',
      '.aiob-reader-highlight * {',
      '  color: inherit !important;',
      '}',
      '',
      '.aiob-reader-highlight.aiob-reader-highlight--focus {',
      '  animation: aiob-video-shadow-highlight-focus 1.4s ease-out;',
      '}',
      '',
      '@keyframes aiob-video-shadow-highlight-focus {',
      `  0% { box-shadow: 0 0 0 0 var(--reader-highlight-focus-color, ${focusFallback}); }`,
      `  50% { box-shadow: 0 0 0 8px var(--reader-highlight-focus-color-soft, ${focusSoftFallback}); }`,
      '  100% { box-shadow: 0 0 0 0 transparent; }',
      '}'
    ].join('\n');
  }

  private traverseShadowInclusive<T>(
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
}
