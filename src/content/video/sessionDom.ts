import type { VideoPanelCallbacks, VideoPanelTexts } from './application/videoPanelModel';
import type { VideoSessionViewFactory } from './application/videoSessionView';
import { VideoPanelPresenter } from './videoPanelPresenter';
import type { VideoHintState } from './videoHintManager';
import { VideoHintManager } from './videoHintManager';
import {
  buildVideoHintContext,
  partitionVideoPanelCaptures,
  type VideoSessionState
} from './sessionState';
import type { VideoFragmentCapture } from './types';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';

export interface VideoSessionDomListenerHandlers {
  onMouseDown: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
  onWindowBlur: () => void;
}

export class VideoSessionDomController {
  private panelPresenter: VideoPanelPresenter | null = null;
  private panel = null as ReturnType<VideoSessionViewFactory['createView']> | null;
  private listeners: VideoSessionDomListenerHandlers | null = null;

  constructor(
    private readonly doc: Document,
    private readonly viewFactory: VideoSessionViewFactory,
    private readonly hintManager: VideoHintManager
  ) {}

  async waitForDocumentReady(): Promise<void> {
    if (this.doc.body) {
      return;
    }

    if (this.doc.readyState === 'loading') {
      await new Promise<void>((resolve) => {
        this.doc.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
      });
      if (this.doc.body) {
        return;
      }
    }

    if (typeof MutationObserver === 'undefined') {
      if (this.doc.body) {
        return;
      }
      await new Promise<void>((resolve) => {
        const view = this.doc.defaultView ?? window;
        const interval = view.setInterval(() => {
          if (this.doc.body) {
            view.clearInterval(interval);
            resolve();
          }
        }, 16);
      });
      return;
    }

    await new Promise<void>((resolve) => {
      const target = this.doc.documentElement ?? this.doc;
      const observer = new MutationObserver(() => {
        if (this.doc.body) {
          observer.disconnect();
          resolve();
        }
      });
      try {
        observer.observe(target, { childList: true, subtree: target === this.doc.documentElement });
      } catch {
        resolve();
        return;
      }
      if (this.doc.body) {
        observer.disconnect();
        resolve();
      }
    });
  }

  mountPanel(
    callbacks: VideoPanelCallbacks,
    texts: VideoPanelTexts,
    options: { initialCollapsed?: boolean } = {}
  ): void {
    this.panel = this.viewFactory.createView(callbacks, texts, options);
    if (options.initialCollapsed) {
      this.panel.collapse?.();
    }
    this.panelPresenter = new VideoPanelPresenter(this.panel);
    this.panelPresenter.updateTexts(texts);
    this.panelPresenter.render({ timestamps: [], fragments: [] });
  }

  updateTexts(texts: VideoPanelTexts): void {
    this.panelPresenter?.updateTexts(texts);
  }

  updateDestination(destination: ExportDestinationSurfacePreview | undefined): void {
    this.panel?.updateDestination?.(destination);
  }

  syncPanel(
    state: VideoSessionState,
    getFragmentElement: (capture: VideoFragmentCapture) => HTMLElement | null
  ): number {
    if (!this.panelPresenter) {
      return 0;
    }

    const groups = partitionVideoPanelCaptures(state.captures, getFragmentElement);
    return this.panelPresenter.render(groups);
  }

  applyHint(
    state: VideoHintState,
    sessionState: Pick<VideoSessionState, 'videoElement' | 'captures'>
  ): void {
    const { hint } = this.hintManager.apply(state, buildVideoHintContext(sessionState));
    this.panel?.updateHint(hint);
  }

  refreshHint(sessionState: Pick<VideoSessionState, 'videoElement' | 'captures'>): void {
    const { hint } = this.hintManager.refresh(buildVideoHintContext(sessionState));
    this.panel?.updateHint(hint);
  }

  beginEditingCapture(captureId: string, comment: string): void {
    this.panel?.beginEditingCapture(captureId, comment);
  }

  stopEditing(): void {
    this.panel?.stopEditing();
  }

  isEventInsidePanel(event: Event): boolean {
    return event.composedPath().some((entry) => {
      if (!(entry instanceof HTMLElement)) {
        return false;
      }
      return (
        entry.dataset.stitchSurface === 'video' ||
        entry.classList.contains('video-surface-window') ||
        entry.hasAttribute('data-capture-input') ||
        entry.hasAttribute('data-capture-id')
      );
    });
  }

  collapsePanel(): void {
    this.panel?.collapse?.();
  }

  registerInteractionHandlers(handlers: VideoSessionDomListenerHandlers): void {
    this.listeners = handlers;
    this.doc.addEventListener('mousedown', handlers.onMouseDown, true);
    this.doc.addEventListener('keydown', handlers.onKeyDown, true);
    this.doc.addEventListener('keyup', handlers.onKeyUp, true);
    this.doc.defaultView?.addEventListener('blur', handlers.onWindowBlur, true);
  }

  removeInteractionHandlers(): void {
    if (!this.listeners) {
      return;
    }
    this.doc.removeEventListener('mousedown', this.listeners.onMouseDown, true);
    this.doc.removeEventListener('keydown', this.listeners.onKeyDown, true);
    this.doc.removeEventListener('keyup', this.listeners.onKeyUp, true);
    this.doc.defaultView?.removeEventListener('blur', this.listeners.onWindowBlur, true);
    this.listeners = null;
  }

  destroy(): void {
    this.removeInteractionHandlers();
    this.panel?.destroy();
    this.panel = null;
    this.panelPresenter = null;
  }
}
