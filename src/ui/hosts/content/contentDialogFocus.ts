import { FocusTrapController } from '../../primitives/dialog';

export interface ContentDialogFocusTrapOptions {
  initialFocus?: string | HTMLElement | (() => HTMLElement | null);
  closeOnEscape?: boolean;
  trapFocus?: boolean;
  isVisible?: boolean;
}

export function createContentDialogFocusTrap(
  container: HTMLElement,
  closeButton: HTMLElement,
  options: ContentDialogFocusTrapOptions
): FocusTrapController | null {
  if (options.trapFocus === false) {
    return null;
  }
  const focusTrap = new FocusTrapController(container, {
    initialFocus: options.initialFocus ?? (() => closeButton),
    escapeDeactivates: options.closeOnEscape ?? true,
    clickOutsideDeactivates: false,
    fallbackFocus: closeButton
  });
  if (options.isVisible) {
    focusTrap.activate();
  }
  return focusTrap;
}

export function focusContentDialogElement(
  root: ParentNode | null | undefined,
  selector: string
): boolean {
  const element = root?.querySelector<HTMLElement>(selector) ?? null;
  if (!element) {
    return false;
  }
  element.focus();
  return true;
}

export function focusContentDialogElementByDataset(
  root: ParentNode | null | undefined,
  datasetKey: string,
  value: string
): boolean {
  const selector = `[data-${toKebabCase(datasetKey)}]`;
  const element =
    Array.from(root?.querySelectorAll<HTMLElement>(selector) ?? []).find(
      (candidate) => candidate.dataset[datasetKey] === value
    ) ?? null;
  if (!element) {
    return false;
  }
  element.focus();
  return true;
}

export function restoreContentDialogFocus(element: HTMLElement | null | undefined): void {
  if (!element) {
    return;
  }
  queueMicrotask(() => {
    if (element.isConnected) {
      element.focus();
    }
  });
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
