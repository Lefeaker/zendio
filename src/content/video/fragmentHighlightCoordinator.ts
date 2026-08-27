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
      filter: isFragmentHighlightMutationRelevant,
      coalescingKey: 'restore',
      delayMs: 120,
      callback: () => {
        if (!this.hasFragments()) this.stop();
        else this.restoreMissingHighlights();
      }
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

function isFragmentHighlightMutationRelevant(record: MutationRecord): boolean {
  if (record.type !== 'childList') return false;
  const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
  return nodes.some((node) => {
    const element = node instanceof Element ? node : node.parentElement;
    return (
      !element ||
      (!element.matches(BILIBILI_DANMAKU_SELECTOR) && !element.closest(BILIBILI_DANMAKU_SELECTOR))
    );
  });
}
