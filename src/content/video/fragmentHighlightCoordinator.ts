import type { VideoFragmentCapture } from './types';
import { FragmentHighlighter } from './fragmentHighlighter';
import type { VideoPlatformAdapter } from './platforms';

interface FragmentHighlightCoordinatorOptions {
  doc: Document;
  highlighter: FragmentHighlighter;
  getFragments(): Iterable<VideoFragmentCapture>;
  ensureCaptureHighlight(capture: VideoFragmentCapture): void;
}

export class FragmentHighlightCoordinator {
  private observer: MutationObserver | null = null;
  private restoreHandle: number | null = null;
  private currentAdapter: VideoPlatformAdapter | null = null;

  constructor(private readonly options: FragmentHighlightCoordinatorOptions) {}

  start(): void {
    if (this.observer || typeof MutationObserver === 'undefined' || !this.options.doc.body) {
      return;
    }
    if (!this.hasFragments()) {
      return;
    }
    this.observer = new MutationObserver((mutations) => {
      if (!this.hasFragments()) {
        this.stop();
        return;
      }

      if (this.currentAdapter) {
        try {
          this.currentAdapter.handleMutations(mutations);
        } catch (error) {
          console.warn('[FragmentHighlight] Platform mutation handling failed:', error);
        }
      }

      if (mutations.some((mutation) => mutation.type === 'childList')) {
        this.scheduleRestore();
      }
    });

    this.observer.observe(this.options.doc.body, {
      childList: true,
      subtree: true
    });

    if (this.currentAdapter) {
      try {
        this.currentAdapter.observeDomChanges(this.observer);
      } catch (error) {
        console.warn('[FragmentHighlight] Platform observeDomChanges failed:', error);
      }
    }
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
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.restoreHandle !== null) {
      window.clearTimeout(this.restoreHandle);
      this.restoreHandle = null;
    }
  }

  observeWithCoordinator(target: Node, options: MutationObserverInit): void {
    if (!this.observer) {
      return;
    }
    try {
      this.observer.observe(target, options);
    } catch (error) {
      console.warn('[FragmentHighlight] Failed to observe target:', error);
    }
  }

  updateAdapter(adapter: VideoPlatformAdapter | null): void {
    this.currentAdapter = adapter;
    if (this.observer && this.currentAdapter) {
      try {
        this.currentAdapter.observeDomChanges(this.observer);
      } catch (error) {
        console.warn('[FragmentHighlight] Platform observeDomChanges failed:', error);
      }
    }
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
