import { clipperStyleSheetManager } from '@content/clipper/shared/styleSheetManager';
import {
  createDialogFrame,
  createDialogTitleId,
  FocusTrapController
} from '../../primitives/dialog';
import type { UiMountable } from '../shared/contract';

export type ShadowDialogContent = HTMLElement | DocumentFragment | string;

export interface ShadowDialogHostConfig {
  title: string;
  body: ShadowDialogContent;
  footer?: HTMLElement | DocumentFragment;
  onClose?: () => void;
  closeLabel?: string;
}

const CLOSE_LABEL_DEFAULT = 'Close dialog';

export class ShadowDialogHost
  implements
    UiMountable<HTMLElement | undefined, Partial<ShadowDialogHostConfig> | undefined, HTMLElement>
{
  private readonly host: HTMLDivElement;
  private readonly shadowRootRef: ShadowRoot;
  private focusTrap: FocusTrapController | null = null;
  private stylesApplied = false;
  private isClosing = false;
  private disposers: Array<() => void> = [];
  private readonly titleId = createDialogTitleId('shadow-dialog-title');

  constructor(private props: ShadowDialogHostConfig) {
    this.host = document.createElement('div');
    this.shadowRootRef = this.host.attachShadow({ mode: 'open' });
    void clipperStyleSheetManager.initialize().then(() => {
      this.stylesApplied = false;
      this.renderFrame();
    });
    this.renderFrame();
  }

  render(): HTMLElement {
    return this.host;
  }

  mount(target?: HTMLElement): HTMLElement {
    if (!this.host.isConnected) {
      (target ?? document.body).append(this.host);
    }
    return this.host;
  }

  update(config?: Partial<ShadowDialogHostConfig>): HTMLElement {
    if (config) {
      this.props = { ...this.props, ...config };
    }
    this.renderFrame();
    return this.host;
  }

  close(): void {
    if (this.isClosing) {
      return;
    }
    this.isClosing = true;
    this.teardownEventHandlers();
    this.cleanupFocusTrap();
    this.props.onClose?.();
    this.host.remove();
    this.isClosing = false;
  }

  destroy(): void {
    this.close();
  }

  isFocusTrapActive(): boolean {
    return this.focusTrap?.isActive() ?? false;
  }

  private renderFrame(): void {
    this.teardownEventHandlers();

    if (!this.stylesApplied) {
      clipperStyleSheetManager.applyTo(this.shadowRootRef);
      this.stylesApplied = true;
    }

    this.shadowRootRef.innerHTML = '';
    const frame = createDialogFrame(this.shadowRootRef.ownerDocument ?? document, {
      title: this.props.title,
      titleId: this.titleId,
      modalClassName: 'modal modal-open',
      modalBoxClassName: 'modal-box space-y-4 text-base-content',
      bodyClassName: 'py-4 text-base-content',
      footerClassName: 'modal-action',
      closeLabel: this.props.closeLabel ?? CLOSE_LABEL_DEFAULT
    });

    this.shadowRootRef.append(frame.overlay);
    this.populateSlot(frame.body, this.props.body, this.shadowRootRef.ownerDocument ?? document);
    this.composeFooter(frame.footer, this.shadowRootRef.ownerDocument ?? document);
    this.bindCloseHandler(frame.closeButton);
    this.bindOverlayDismiss(frame.overlay);
    this.setupFocusTrap(frame.modalBox, frame.closeButton);
  }

  private composeFooter(container: HTMLElement, doc: Document): void {
    if (this.props.footer) {
      if (this.props.footer instanceof DocumentFragment) {
        container.replaceChildren(this.props.footer.cloneNode(true));
      } else {
        container.replaceChildren(this.props.footer);
      }
      return;
    }

    const closeButton = doc.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn btn-primary';
    closeButton.dataset.action = 'close';
    closeButton.textContent = this.props.closeLabel ?? 'Close';
    container.append(closeButton);
    this.bindCloseHandler(closeButton);
  }

  private populateSlot(target: HTMLElement, content: ShadowDialogContent, doc: Document): void {
    if (typeof content === 'string') {
      target.textContent = content;
      return;
    }
    if (content instanceof DocumentFragment) {
      target.append(content.cloneNode(true));
      return;
    }
    if (content instanceof HTMLElement) {
      target.append(content);
      return;
    }

    const fallback = doc.createElement('p');
    fallback.textContent = String(content);
    target.append(fallback);
  }

  private bindCloseHandler(element: Element): void {
    const handler = () => this.close();
    element.addEventListener('click', handler);
    this.disposers.push(() => element.removeEventListener('click', handler));
  }

  private bindOverlayDismiss(modal: HTMLElement): void {
    const handler = (event: Event) => {
      if (event.target === event.currentTarget) {
        this.close();
      }
    };
    modal.addEventListener('click', handler);
    this.disposers.push(() => modal.removeEventListener('click', handler));
  }

  private teardownEventHandlers(): void {
    while (this.disposers.length) {
      this.disposers.pop()?.();
    }
  }

  private setupFocusTrap(target: HTMLElement, closeButton: HTMLElement): void {
    this.cleanupFocusTrap();
    this.focusTrap = new FocusTrapController(target, {
      initialFocus: () => closeButton,
      fallbackFocus: target,
      escapeDeactivates: true,
      clickOutsideDeactivates: true,
      onDeactivate: () => {
        if (!this.isClosing) {
          this.close();
        }
      }
    });
    this.focusTrap.activate();
  }

  private cleanupFocusTrap(): void {
    this.focusTrap?.deactivate();
    this.focusTrap = null;
  }
}
