export type { DialogSize } from '../../foundation/types';
export { FocusTrapController } from '../../foundation/a11y';

export interface DialogFrameOptions {
  title: string;
  titleId: string;
  modalClassName: string;
  modalBoxClassName: string;
  bodyClassName: string;
  footerClassName: string;
  closeLabel: string;
}

export interface DialogFrameRefs {
  overlay: HTMLDivElement;
  modalBox: HTMLDivElement;
  header: HTMLElement;
  title: HTMLHeadingElement;
  closeButton: HTMLButtonElement;
  body: HTMLDivElement;
  footer: HTMLDivElement;
}

let dialogIdCounter = 0;

export function createDialogTitleId(prefix = 'ui-dialog-title'): string {
  dialogIdCounter += 1;
  return `${prefix}-${dialogIdCounter}`;
}

export function createDialogFrame(doc: Document, options: DialogFrameOptions): DialogFrameRefs {
  const overlay = doc.createElement('div');
  overlay.className = options.modalClassName;

  const modalBox = doc.createElement('div');
  modalBox.className = options.modalBoxClassName;
  modalBox.dataset.element = 'dialog';
  modalBox.setAttribute('role', 'dialog');
  modalBox.setAttribute('aria-modal', 'true');
  modalBox.setAttribute('aria-labelledby', options.titleId);

  const header = doc.createElement('header');
  header.className = 'flex items-start justify-between gap-4';
  header.dataset.element = 'header';

  const title = doc.createElement('h3');
  title.id = options.titleId;
  title.className = 'text-lg font-semibold m-0';
  title.textContent = options.title;

  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn btn-sm btn-circle btn-ghost';
  closeButton.dataset.action = 'close';
  closeButton.setAttribute('aria-label', options.closeLabel);
  closeButton.textContent = '✕';

  header.append(title, closeButton);

  const body = doc.createElement('div');
  body.className = options.bodyClassName;
  body.dataset.element = 'body';

  const footer = doc.createElement('div');
  footer.className = options.footerClassName;
  footer.dataset.element = 'footer';

  modalBox.append(header, body, footer);
  overlay.append(modalBox);

  return { overlay, modalBox, header, title, closeButton, body, footer };
}
