import type { VideoFragmentCapture } from './types';
import { FragmentHighlighter } from './fragmentHighlighter';
import type { VideoPlatformAdapter } from './platforms';
import type {
  DocumentMutationDisposer,
  DocumentMutationHubApi
} from '../runtime/documentMutationTypes';

interface FragmentHighlightCoordinatorOptions {
  documentMutationHub: DocumentMutationHubApi;
  highlighter: FragmentHighlighter;
  getFragments(): Iterable<VideoFragmentCapture>;
  ensureCaptureHighlight(capture: VideoFragmentCapture): void;
}

export class FragmentHighlightCoordinator {
  private disposeDocumentMutations: DocumentMutationDisposer | null = null;
  private restoreHandle: number | null = null;

  constructor(private readonly options: FragmentHighlightCoordinatorOptions) {}

  start(): void {
    if (this.disposeDocumentMutations || !this.hasFragments()) return;
    this.disposeDocumentMutations = this.options.documentMutationHub.subscribe({
      subscriberId: 'video-fragment-highlights',
      filter: (record) => this.isMutationRelevant(record),
      coalescingKey: 'restore',
      delayMs: 0,
      callback: () => this.scheduleRestore()
    });
  }

  ensureStartedForFragments(): void {
    if (!this.hasFragments()) {
      this.stopIfNoFragments();
      return;
    }
    this.start();
  }

  scheduleRestore(): void {
    if (this.restoreHandle !== null) {
      return;
    }
    if (!this.hasFragments()) {
      this.stopIfNoFragments();
      return;
    }
    this.restoreHandle = window.setTimeout(() => {
      this.restoreHandle = null;
      if (!this.hasFragments()) {
        this.stopIfNoFragments();
        return;
      }
      this.restoreMissingHighlights();
    }, 120);
  }

  stopIfNoFragments(): void {
    if (!this.hasFragments()) {
      this.stop();
    }
  }

  stop(): void {
    this.disposeDocumentMutations?.();
    this.disposeDocumentMutations = null;
    if (this.restoreHandle !== null) {
      window.clearTimeout(this.restoreHandle);
      this.restoreHandle = null;
    }
  }

  updateAdapter(adapter: VideoPlatformAdapter | null): void {
    if (adapter && this.hasFragments()) this.scheduleRestore();
  }

  private hasFragments(): boolean {
    for (const _capture of this.options.getFragments()) {
      return true;
    }
    return false;
  }

  private isMutationRelevant(record: MutationRecord): boolean {
    if (record.type !== 'childList') return false;
    if (Array.from(record.addedNodes).some((node) => this.isRelevantAddedNode(node))) return true;
    const target = mutationElement(record.target);
    if (!target?.isConnected || isBilibiliDanmakuElement(target)) return false;
    return Array.from(record.removedNodes).some((node) => {
      const removed = mutationElement(node);
      return Boolean(
        (removed && isFragmentHighlightElement(removed)) || isFragmentHighlightElement(target)
      );
    });
  }

  private isRelevantAddedNode(node: Node): boolean {
    const element = mutationElement(node);
    if (!element?.isConnected || isBilibiliDanmakuElement(element)) return false;
    if (isFragmentHighlightElement(element)) return true;
    const text = normalizeMutationText(
      `${node.textContent ?? ''} ${element.shadowRoot?.textContent ?? ''}`
    );
    if (!text) return false;
    for (const capture of this.options.getFragments()) {
      const selectedText = normalizeMutationText(capture.selectedText);
      if (selectedText && text.includes(selectedText)) return true;
    }
    return false;
  }

  private restoreMissingHighlights(): void {
    for (const capture of this.options.getFragments()) {
      const element = capture.wrapperId
        ? this.options.highlighter.getElementByIdDeep(capture.wrapperId)
        : null;
      if (!element || !element.isConnected) {
        this.options.ensureCaptureHighlight(capture);
      } else {
        this.options.highlighter.decorateElement(element);
      }
    }
  }
}

const BILIBILI_DANMAKU_SELECTOR =
  '.bpx-player-render-dm-wrap,.bpx-player-dm-mask-wrap,.bpx-player-adv-dm-wrap,' +
  '.bpx-player-row-dm-wrap,.bpx-player-bas-dm-wrap,.bpx-player-cmd-dm-wrap,' +
  '.bili-danmaku-x-dm,.bili-danmaku-x-dm-vip';

const FRAGMENT_HIGHLIGHT_SELECTOR = '.aiob-video-fragment-highlight,[data-video-fragment-id]';

function mutationElement(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

function isBilibiliDanmakuElement(element: Element): boolean {
  return Boolean(
    element.matches(BILIBILI_DANMAKU_SELECTOR) || element.closest(BILIBILI_DANMAKU_SELECTOR)
  );
}

function isFragmentHighlightElement(element: Element): boolean {
  return Boolean(
    element.matches(FRAGMENT_HIGHLIGHT_SELECTOR) ||
    element.closest(FRAGMENT_HIGHLIGHT_SELECTOR) ||
    element.querySelector(FRAGMENT_HIGHLIGHT_SELECTOR)
  );
}

function normalizeMutationText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
