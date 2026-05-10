import { panelStyleSheetManager } from '@content/shared/panels/styleSheetManager';
import {
  createDialogFrame,
  createDialogTitleId,
  FocusTrapController
} from '../../primitives/dialog';
import type { UiMountable } from '../shared/contract';
import { mountContentHost, unmountContentHost } from './contentHostMount';

export type ContentDialogHostSize = 'md' | 'lg';

export interface ContentDialogHostConfig {
  title: string;
  size?: ContentDialogHostSize;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  modal?: boolean;
  trapFocus?: boolean;
  showHeader?: boolean;
  modalClassName?: string;
  modalBoxClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  headerClassName?: string;
  closeButtonClassName?: string;
  closeLabel?: string;
  initialFocus?: string | HTMLElement | (() => HTMLElement | null);
  onClose?: () => void;
}

export class ContentDialogHost
  implements
    UiMountable<HTMLElement | undefined, Partial<ContentDialogHostConfig> | undefined, HTMLElement>
{
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private overlayEl: HTMLDivElement | null = null;
  private modalBoxEl: HTMLDivElement | null = null;
  private bodyEl: HTMLDivElement | null = null;
  private footerEl: HTMLDivElement | null = null;
  private titleEl: HTMLHeadingElement | null = null;
  private focusTrap: FocusTrapController | null = null;
  private isMounted = false;
  private isVisible = false;
  private disposers: Array<() => void> = [];
  private readonly titleId = createDialogTitleId('content-daisy-dialog-title');

  constructor(private config: ContentDialogHostConfig) {
    this.host = document.createElement('div');
    this.host.dataset.aiobPanelTheme = 'tool';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    void panelStyleSheetManager.initialize();
    panelStyleSheetManager.applyReaderStyles(this.shadow);
    this.renderStructure();
  }

  render(): HTMLElement {
    return this.host;
  }

  mount(target?: HTMLElement): HTMLElement {
    if (!this.isMounted) {
      mountContentHost(this.host, target);
      this.isMounted = true;
    }
    return this.host;
  }

  update(config?: Partial<ContentDialogHostConfig>): HTMLElement {
    if (config) {
      this.updateConfig(config);
    }
    return this.host;
  }

  setContent(content: HTMLElement): void {
    this.bodyEl?.replaceChildren(content);
  }

  setFooter(footer: HTMLElement): void {
    this.footerEl?.replaceChildren(footer);
  }

  getShadowRoot(): ShadowRoot {
    return this.shadow;
  }

  getDialogElement(): HTMLDivElement {
    if (!this.modalBoxEl) {
      throw new Error('[ContentDialogHost] Dialog element is not ready.');
    }
    return this.modalBoxEl;
  }

  updateConfig(config: Partial<ContentDialogHostConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.titleEl && config.title) {
      this.titleEl.textContent = config.title;
    }
  }

  show(): void {
    this.mount();
    this.overlayEl?.classList.add('modal-open');
    this.isVisible = true;
    this.focusTrap?.activate();
  }

  hide(): void {
    this.overlayEl?.classList.remove('modal-open');
    this.focusTrap?.deactivate();
    this.isVisible = false;
  }

  destroy(): void {
    this.hide();
    this.teardownEventHandlers();
    this.focusTrap?.deactivate();
    this.focusTrap = null;
    unmountContentHost(this.host);
    this.isMounted = false;
  }

  isFocusTrapActive(): boolean {
    return this.focusTrap?.isActive() ?? false;
  }

  private renderStructure(): void {
    this.teardownEventHandlers();
    this.shadow.innerHTML = '';

    const frame = createDialogFrame(document, {
      title: this.config.title,
      titleId: this.titleId,
      modalClassName: this.config.modalClassName ?? 'modal',
      modalBoxClassName: this.config.modalBoxClassName ?? 'modal-box space-y-4 text-base-content',
      bodyClassName: this.config.bodyClassName ?? 'reader-dialog-body space-y-4',
      footerClassName: this.config.footerClassName ?? 'reader-dialog-footer modal-action',
      closeLabel: this.config.closeLabel ?? 'Close dialog'
    });

    if (this.config.headerClassName) {
      frame.header.className = this.config.headerClassName;
    }
    if (this.config.closeButtonClassName) {
      frame.closeButton.className = this.config.closeButtonClassName;
    }
    if (this.config.showHeader === false) {
      frame.header.hidden = true;
      frame.closeButton.tabIndex = -1;
    }

    this.shadow.append(frame.overlay);
    this.overlayEl = frame.overlay;
    this.modalBoxEl = frame.modalBox;
    this.bodyEl = frame.body;
    this.footerEl = frame.footer;
    this.titleEl = frame.title;
    if (this.config.modal === false) {
      frame.overlay.style.pointerEvents = 'none';
      frame.overlay.style.background = 'transparent';
      frame.modalBox.style.pointerEvents = 'auto';
      frame.modalBox.setAttribute('aria-modal', 'false');
    }
    this.setupFocusTrap(frame.modalBox, frame.closeButton);
    this.bindCloseHandler(frame.closeButton);
    this.bindBackdropDismiss(frame.overlay);
    this.bindEscape();
  }

  private setupFocusTrap(container: HTMLElement, closeButton: HTMLElement): void {
    this.focusTrap?.deactivate();
    if (this.config.trapFocus === false) {
      this.focusTrap = null;
      return;
    }
    this.focusTrap = new FocusTrapController(container, {
      initialFocus: this.config.initialFocus ?? (() => closeButton),
      escapeDeactivates: this.config.closeOnEscape ?? true,
      clickOutsideDeactivates: false,
      fallbackFocus: closeButton
    });
    if (this.isVisible) {
      this.focusTrap.activate();
    }
  }

  private invokeClose(): void {
    const shouldNotify = this.isVisible || this.isMounted;
    this.hide();
    if (shouldNotify) {
      this.config.onClose?.();
    }
  }

  private bindCloseHandler(element: HTMLElement): void {
    const handler = () => this.invokeClose();
    element.addEventListener('click', handler);
    this.disposers.push(() => element.removeEventListener('click', handler));
  }

  private bindBackdropDismiss(overlay: HTMLElement): void {
    if (!(this.config.closeOnBackdrop ?? false)) {
      return;
    }
    const handler = (event: MouseEvent) => {
      if (event.target === overlay) {
        this.invokeClose();
      }
    };
    overlay.addEventListener('click', handler);
    this.disposers.push(() => overlay.removeEventListener('click', handler));
  }

  private bindEscape(): void {
    if (!(this.config.closeOnEscape ?? true)) {
      return;
    }
    const handler: EventListener = (event) => {
      if (!(event instanceof KeyboardEvent)) {
        return;
      }
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.invokeClose();
      }
    };
    this.shadow.addEventListener('keydown', handler);
    this.disposers.push(() => this.shadow.removeEventListener('keydown', handler));
  }

  private teardownEventHandlers(): void {
    while (this.disposers.length) {
      this.disposers.pop()?.();
    }
  }
}
