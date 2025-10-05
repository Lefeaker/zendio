const FOCUSABLE_SELECTOR = [
  'a[href]','area[href]','button:not([disabled])','input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])','textarea:not([disabled])','iframe','object','embed',
  '[tabindex]:not([tabindex="-1"])','[contenteditable="true"]'
].join(',');

function isVisible(element: HTMLElement): boolean {
  if (element.hasAttribute('hidden')) {
    return false;
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) {
    return true;
  }
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return elements.filter(element => {
    if (!isVisible(element)) {
      return false;
    }
    if (element.dataset.focusTrapExclude === 'true') {
      return false;
    }
    if (element.tabIndex < 0 && !element.hasAttribute('contenteditable')) {
      return false;
    }
    return true;
  });
}

export class FocusTrap {
  private container: HTMLElement;
  private ownerDocument: Document;
  private listener: (event: KeyboardEvent) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    const ownerDocument = container.ownerDocument;
    if (!ownerDocument) {
      throw new Error('FocusTrap requires a valid document.');
    }
    this.ownerDocument = ownerDocument;
    this.listener = event => this.onKeyDown(event);
  }

  activate(): void {
    this.ownerDocument.addEventListener('keydown', this.listener, true);
  }

  deactivate(): void {
    this.ownerDocument.removeEventListener('keydown', this.listener, true);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }

    const focusable = getFocusable(this.container);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const active = this.ownerDocument.activeElement as HTMLElement | null;
    const currentIndex = active ? focusable.indexOf(active) : -1;

    let nextIndex: number;
    if (event.shiftKey) {
      if (currentIndex <= 0) {
        nextIndex = focusable.length - 1;
      } else {
        nextIndex = currentIndex - 1;
      }
    } else {
      if (currentIndex === -1 || currentIndex === focusable.length - 1) {
        nextIndex = 0;
      } else {
        nextIndex = currentIndex + 1;
      }
    }

    event.preventDefault();
    focusable[nextIndex].focus();
  }
}
