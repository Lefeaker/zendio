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
