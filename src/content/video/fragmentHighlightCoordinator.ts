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
    if (Array.from(this.options.getFragments()).length === 0) {
      return;
    }
    this.observer = new MutationObserver((mutations) => {
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
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-*']
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
    if (Array.from(this.options.getFragments()).length > 0) {
      this.start();
    }
  }

  scheduleRestore(): void {
    if (this.restoreHandle !== null) {
      return;
    }
    const hasFragments = Array.from(this.options.getFragments()).length > 0;
    if (!hasFragments) {
      return;
    }
    this.restoreHandle = window.setTimeout(() => {
      this.restoreHandle = null;
      this.restoreMissingHighlights();
    }, 120);
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
