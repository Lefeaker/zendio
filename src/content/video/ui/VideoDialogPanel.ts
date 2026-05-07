import type {
  VideoPanelCallbacks,
  VideoPanelCapture,
  VideoPanelTexts
} from '../application/videoPanelModel';
import { VideoDialog } from '@ui/domains/video';
import type { UiMountable } from '@ui/hosts/shared/contract';
import type { PopupCoordinator } from '@content/runtime/popupCoordinator';
import { resolveContentPopupCoordinator } from '@content/runtime/popupCoordinatorAccess';

interface VideoDialogPanelOptions {
  callbacks: VideoPanelCallbacks;
  texts: VideoPanelTexts;
}

export class VideoDialogPanel
  implements
    UiMountable<
      HTMLElement | undefined,
      | { texts?: VideoPanelTexts; count?: number; hint?: string; captures?: VideoPanelCapture[] }
      | undefined,
      HTMLElement
    >
{
  private readonly dialog: VideoDialog;
  private readonly renderRoot: HTMLElement;
  private readonly pointerDownHandler: (event: PointerEvent) => void;
  private readonly popupCoordinator: PopupCoordinator | null;
  private unregisterPopup: (() => void) | null = null;
  private pointerListenerAttached = false;
  private texts: VideoPanelTexts;
  private captureCount = 0;

  constructor(options: VideoDialogPanelOptions) {
    this.texts = options.texts;
    this.dialog = new VideoDialog({
      title: options.texts.title,
      status: options.texts.status,
      captures: [],
      texts: {
        hint: options.texts.hint,
        add: options.texts.add,
        finish: options.texts.finish,
        cancel: options.texts.cancel,
        captureNoComment: options.texts.captureNoComment,
        captureFocusLabel: options.texts.captureFocusLabel,
        captureEditPlaceholder: options.texts.captureEditPlaceholder,
        captureSaveLabel: options.texts.captureSaveLabel,
        captureCancelLabel: options.texts.captureCancelLabel,
        captureDeleteLabel: options.texts.captureDeleteLabel
      },
      onClose: options.callbacks.onCancel,
      onAddCapture: options.callbacks.onAddCapture,
      onFinish: options.callbacks.onFinish,
      onCancel: options.callbacks.onCancel,
      onDeleteCapture: options.callbacks.onDeleteCapture,
      onFocusCapture: options.callbacks.onFocusCapture,
      onSubmitCaptureEdit: options.callbacks.onSubmitCaptureEdit
    });
    this.renderRoot = this.dialog.render();
    this.renderRoot.id = 'aiob-video-panel';
    this.renderRoot.dataset.stitchSurface = 'video';
    Object.assign(this.renderRoot.style, {
      inset: '0',
      pointerEvents: 'none',
      position: 'fixed',
      zIndex: '2147483647'
    });
    this.dialog.setCounterText(this.formatCounter(0));
    this.popupCoordinator = resolveContentPopupCoordinator();

    this.pointerDownHandler = (event: PointerEvent) => {
      const path = event.composedPath();
      const target = path[0];
      if (!(target instanceof Element)) {
        return;
      }
      const captureItem = target.closest<HTMLElement>('[data-capture-id]');
      const captureId = captureItem?.dataset.captureId ?? null;
      this.dialog.maybeCommitEditing(captureId);
      if (!captureItem) {
        this.dialog.clearExpanded();
      }
    };
  }

  get element(): HTMLElement {
    return this.renderRoot;
  }

  mount(target: HTMLElement = document.body): HTMLElement {
    if (!this.renderRoot.isConnected) {
      target.append(this.renderRoot);
    }
    return this.renderRoot;
  }

  show(): void {
    this.mount();
    this.dialog.show();
    if (!this.pointerListenerAttached) {
      document.addEventListener('pointerdown', this.pointerDownHandler);
      this.pointerListenerAttached = true;
    }
    if (!this.unregisterPopup && this.popupCoordinator) {
      this.unregisterPopup = this.popupCoordinator.register(this);
    }
  }

  hide(): void {
    this.unregisterPopup?.();
    this.unregisterPopup = null;
    if (this.pointerListenerAttached) {
      document.removeEventListener('pointerdown', this.pointerDownHandler);
      this.pointerListenerAttached = false;
    }
    this.dialog.hide();
  }

  update(payload?: {
    texts?: VideoPanelTexts;
    count?: number;
    hint?: string;
    captures?: VideoPanelCapture[];
  }): HTMLElement {
    if (!payload) {
      return this.renderRoot;
    }
    if (payload.texts) {
      this.updateTexts(payload.texts);
    }
    if (typeof payload.count === 'number') {
      this.updateCount(payload.count);
    }
    if (typeof payload.hint === 'string') {
      this.updateHint(payload.hint);
    }
    if (payload.captures) {
      this.setCaptures(payload.captures);
    }
    return this.renderRoot;
  }

  updateTexts(texts: VideoPanelTexts): void {
    this.texts = texts;
    this.dialog.updateTitle(texts.title);
    this.dialog.setStatusText(texts.status);
    this.dialog.setHintText(texts.hint);
    this.dialog.setCounterText(this.formatCounter(this.captureCount));
  }

  updateCount(count: number): void {
    this.captureCount = count;
    this.dialog.setCounterText(this.formatCounter(count));
  }

  updateHint(text: string): void {
    this.dialog.setHintText(text);
  }

  setCaptures(captures: VideoPanelCapture[]): void {
    this.captureCount = captures.length;
    this.dialog.updateCaptures(captures);
    this.dialog.setCounterText(this.formatCounter(captures.length));
  }

  beginEditingCapture(id: string, draft: string): void {
    this.dialog.beginEditingCapture(id, draft);
  }

  stopEditing(): void {
    this.dialog.stopEditing();
  }

  destroy(): void {
    this.unregisterPopup?.();
    this.unregisterPopup = null;
    if (this.pointerListenerAttached) {
      document.removeEventListener('pointerdown', this.pointerDownHandler);
      this.pointerListenerAttached = false;
    }
    this.dialog.destroy();
  }

  private formatCounter(count: number): string {
    if (count <= 0) {
      return this.texts.counterZero;
    }
    return this.texts.counter.replace('{count}', String(count));
  }
}
