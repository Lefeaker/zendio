interface ReaderKeydownOptions {
  isPanelEditing: () => boolean;
  onCancel: () => void;
  onFinish: () => void | Promise<void>;
}

export function handleReaderKeydown(event: KeyboardEvent, options: ReaderKeydownOptions): void {
  if (event.key === 'Escape') {
    if (options.isPanelEditing()) {
      return;
    }
    event.preventDefault();
    options.onCancel();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    void options.onFinish();
  }
}

export function isNodeInsideReaderUi(
  node: Node | null,
  panelElement: HTMLElement | null,
  doc: Document
): boolean {
  if (!node) {
    return false;
  }

  let element: Element | null = null;
  if (node instanceof Element) {
    element = node;
  } else if (node instanceof Text) {
    element = node.parentElement;
  }

  if (!element) {
    return false;
  }

  if (panelElement && panelElement.contains(element)) {
    return true;
  }

  const dialog = doc.getElementById('obsidian-clipper-dialog');
  if (dialog && dialog.contains(element)) {
    return true;
  }

  return false;
}
