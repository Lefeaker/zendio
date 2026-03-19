import { panelStyleSheetManager } from '../panels/styleSheetManager';
import { FocusTrapController } from '../focusTrap';

export type ContentDaisyDialogSize = 'md' | 'lg';

export interface ContentDaisyDialogConfig {
  title: string;
  size?: ContentDaisyDialogSize;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  onClose?: () => void;
}

export class ContentDaisyDialog {
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private overlayEl: HTMLDivElement | null = null;
  private modalBoxEl: HTMLDivElement | null = null;
  private bodyEl: HTMLDivElement | null = null;
  private footerEl: HTMLDivElement | null = null;
  private focusTrap: FocusTrapController | null = null;
  private isMounted = false;
  private isVisible = false;
  private disposers: Array<() => void> = [];

  constructor(private config: ContentDaisyDialogConfig) {
    this.host = document.createElement('div');
    this.shadow = this.host.attachShadow({ mode: 'open' });
    panelStyleSheetManager.initialize();
    panelStyleSheetManager.applyReaderStyles(this.shadow);
    this.renderStructure();
  }

  render(): HTMLElement {
    return this.host;
  }

  setContent(content: HTMLElement): void {
    this.bodyEl?.replaceChildren(content);
  }

  setFooter(footer: HTMLElement): void {
    this.footerEl?.replaceChildren(footer);
  }

  updateConfig(config: Partial<ContentDaisyDialogConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.modalBoxEl && config.title) {
      const titleEl = this.modalBoxEl.querySelector<HTMLElement>('[data-role="dialog-title"]');
      if (titleEl) {
        titleEl.textContent = config.title;
      }
    }
  }

  show(): void {
    if (!this.isMounted) {
      document.body.appendChild(this.host);
      this.isMounted = true;
    }
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
    this.host.remove();
    this.isMounted = false;
  }

  private renderStructure(): void {
    this.teardownEventHandlers();
    this.shadow.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.className = 'modal modal-open';
    const modalBox = document.createElement('div');
    modalBox.className = 'modal-box space-y-4 text-base-content';

    const titleEl = document.createElement('h3');
    titleEl.dataset.role = 'dialog-title';
    titleEl.className = 'text-lg font-semibold m-0';
    titleEl.textContent = this.config.title;

    const header = document.createElement('header');
    header.className = 'flex items-start justify-between gap-4';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-sm btn-circle btn-ghost';
    closeBtn.dataset.action = 'close';
    closeBtn.textContent = '✕';
    header.append(titleEl, closeBtn);

    const body = document.createElement('div');
    body.className = 'reader-dialog-body space-y-4';

    const footer = document.createElement('div');
    footer.className = 'reader-dialog-footer modal-action';

    modalBox.append(header, body, footer);
    overlay.append(modalBox);
    this.shadow.append(overlay);

    this.overlayEl = overlay;
    this.modalBoxEl = modalBox;
    this.bodyEl = body;
    this.footerEl = footer;
    this.setupFocusTrap(modalBox);
    this.bindCloseHandler(closeBtn);
    this.bindBackdropDismiss(overlay);
    this.bindEscape();
  }

  private setupFocusTrap(container: HTMLElement): void {
    this.focusTrap?.deactivate();
    this.focusTrap = new FocusTrapController(container, {
      escapeDeactivates: this.config.closeOnEscape ?? true,
      clickOutsideDeactivates: false,
      fallbackFocus: container
    });
    if (this.isVisible) {
      this.focusTrap.activate();
    }
  }

  private bindCloseHandler(element: HTMLElement): void {
    const handler = () => {
      this.hide();
      this.config.onClose?.();
    };
    element.addEventListener('click', handler);
    this.disposers.push(() => element.removeEventListener('click', handler));
  }

  private bindBackdropDismiss(overlay: HTMLElement): void {
    if (!(this.config.closeOnBackdrop ?? false)) {
      return;
    }
    const handler = (event: MouseEvent) => {
      if (event.target === overlay) {
        this.hide();
        this.config.onClose?.();
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
        this.hide();
        this.config.onClose?.();
      }
    };
    this.shadow.addEventListener('keydown', handler);
    this.disposers.push(() => this.shadow.removeEventListener('keydown', handler));
  }

  private teardownEventHandlers(): void {
    while (this.disposers.length) {
      const disposer = this.disposers.pop();
      disposer?.();
    }
  }
}
