import type { VideoFragmentCapture } from '../types';
import type { VideoPlatform } from '../utils';

export interface PlatformSelectionInput {
  range: Range | null;
  selectedText: string;
  selectedHtml: string;
  event?: Event;
}

export interface PlatformSelectionResult {
  text: string;
  html: string;
  range?: Range;
}

export interface VideoPlatformContext {
  doc: Document;
  highlightSelection(range: Range, captureId: string, fragmentUrl: string): string | undefined;
  decorateHighlight(element: HTMLElement): void;
  scheduleFragmentHighlightRestore(): void;
  getElementByIdDeep(id: string): HTMLElement | null;
  querySelectorDeep<T extends Element>(selector: string): T | null;
  observeWithFragmentObserver(target: Node, options: MutationObserverInit): void;
  registerShadowSelectionBridge(root: ShadowRoot): void;
  ensureHighlightStyles(root: ShadowRoot): void;
}

export interface TimestampBuildContext {
  canonicalUrl: string;
  currentUrl: string;
  videoId: string | null;
}

export interface VideoPlatformAdapter {
  readonly platform: VideoPlatform;
  shouldActivate(doc: Document): boolean;
  resolveSelection(input: PlatformSelectionInput): PlatformSelectionResult | null;
  findTextRange(text: string): Range | null;
  highlight(range: Range, captureId: string, fragmentUrl: string): string | undefined;
  restoreHighlight(capture: VideoFragmentCapture): string | undefined;
  observeDomChanges(observer: MutationObserver): void;
  handleMutations(mutations: MutationRecord[]): void;
  observeSelectionRoots?(): void;
  buildTimestampUrl(timeSec: number, ctx: TimestampBuildContext): string | null;
  formatVideoTitle(rawTitle: string): string | null;
  dispose(): void;
}
