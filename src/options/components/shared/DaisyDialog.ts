import { clipperStyleSheetManager } from '@content/clipper/shared/styleSheetManager';
import { FocusTrapController } from '@content/shared/focusTrap';

export type DaisyDialogContent = HTMLElement | DocumentFragment | string;

export interface DaisyDialogProps {
  title: string;
  body: DaisyDialogContent;
  footer?: HTMLElement | DocumentFragment;
  onClose?: () => void;
  closeLabel?: string;
}

const CLOSE_LABEL_DEFAULT = 'Close dialog';

let dialogInstanceCounter = 0;

/**
 * DaisyUI 风格的对话框，使用 Shadow DOM 与 FocusTrap 提供无障碍体验。
 */
export class DaisyDialog extends HTMLElement {
  private props: DaisyDialogProps;
  private focusTrap: FocusTrapController | null = null;
  private stylesApplied = false;
  private isClosing = false;
  private readonly instanceId = dialogInstanceCounter++;
  private disposers: Array<() => void> = [];

  constructor(props?: DaisyDialogProps) {
    super();
    this.props = props ?? { title: '', body: '' };
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    void clipperStyleSheetManager.initialize().then(() => {
      this.stylesApplied = false;
      if (this.isConnected) {
        this.render();
      }
    });
    this.render();
  }

  disconnectedCallback(): void {
    this.teardownEventHandlers();
    this.cleanupFocusTrap();
  }

  /**
   * 动态更新属性后重新渲染。
   */
  setProps(next: Partial<DaisyDialogProps>): void {
    this.props = { ...this.props, ...next };
    if (this.isConnected) {
      this.render();
    }
  }

  /**
   * 用于测试验证焦点陷阱是否激活。
   */
  isFocusTrapActive(): boolean {
    return this.focusTrap?.isActive() ?? false;
  }

  /**
   * 关闭对话框并触发回调。
   */
  close(): void {
    if (this.isClosing) {
      return;
    }
    this.isClosing = true;
    this.teardownEventHandlers();
    this.cleanupFocusTrap();
    this.props.onClose?.();
    if (this.isConnected) {
      this.remove();
    }
    this.isClosing = false;
  }

  private render(): void {
    const root = this.shadowRoot;
    if (!root) {
      return;
    }
    this.teardownEventHandlers();

    if (!this.stylesApplied) {
      clipperStyleSheetManager.applyTo(root);
      this.stylesApplied = true;
    }

    root.innerHTML = '';

    const doc = root.ownerDocument ?? document;
    const modal = doc.createElement('div');
    modal.className = 'modal modal-open';

    const modalBox = doc.createElement('div');
    modalBox.className = 'modal-box space-y-4';
    modalBox.setAttribute('role', 'dialog');
    const titleId = `daisy-dialog-title-${this.instanceId}`;
    modalBox.setAttribute('aria-labelledby', titleId);

    modal.append(modalBox);
    root.append(modal);

    this.composeHeader(modalBox, titleId, doc);
    this.composeBody(modalBox, doc);
    this.composeFooter(modalBox, doc);
    this.bindOverlayDismiss(modal);
    this.setupFocusTrap(modalBox);
  }

  private composeHeader(container: HTMLElement, titleId: string, doc: Document): void {
    const header = doc.createElement('div');
    header.className = 'flex items-start justify-between gap-4 text-base-content';

    const title = doc.createElement('h3');
    title.id = titleId;
    title.className = 'font-bold text-lg m-0';
    title.textContent = this.props.title;
    header.append(title);

    const closeButton = doc.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn btn-sm btn-circle btn-ghost';
    closeButton.dataset.action = 'close';
    closeButton.setAttribute('aria-label', this.props.closeLabel ?? CLOSE_LABEL_DEFAULT);
    closeButton.textContent = '✕';
    header.append(closeButton);

    container.append(header);
    this.bindCloseHandler(closeButton);
  }

  private composeBody(container: HTMLElement, doc: Document): void {
    const bodyHost = doc.createElement('div');
    bodyHost.className = 'py-4 text-base-content';
    bodyHost.dataset.element = 'body';

    this.populateSlot(bodyHost, this.props.body, doc);
    container.append(bodyHost);
  }

  private composeFooter(container: HTMLElement, doc: Document): void {
    const footer = doc.createElement('div');
    footer.className = 'modal-action';
    footer.dataset.element = 'footer';

    if (this.props.footer) {
      footer.replaceChildren(this.props.footer);
    } else {
      const closeBtn = doc.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'btn btn-primary';
      closeBtn.dataset.action = 'close';
      closeBtn.textContent = this.props.closeLabel ?? 'Close';
      footer.append(closeBtn);
      this.bindCloseHandler(closeBtn);
    }

    container.append(footer);
  }

  private populateSlot(target: HTMLElement, content: DaisyDialogContent, doc: Document): void {
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
      const dispose = this.disposers.pop();
      dispose?.();
    }
  }

  private setupFocusTrap(target: HTMLElement): void {
    this.cleanupFocusTrap();
    this.focusTrap = new FocusTrapController(target, {
      initialFocus: () => {
        const candidate = this.shadowRoot?.querySelector('[data-action="close"]');
        return candidate instanceof HTMLElement ? candidate : null;
      },
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

const TAG_NAME = 'daisy-dialog';
if (typeof globalThis !== 'undefined' && 'customElements' in globalThis) {
  if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, DaisyDialog);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'daisy-dialog': DaisyDialog;
  }
}
