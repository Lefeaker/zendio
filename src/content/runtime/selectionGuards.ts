export function isSelectionInsideUi(selection: Selection): boolean {
  for (const node of [selection.anchorNode, selection.focusNode]) {
    let element: Element | null = null;
    if (node instanceof Element) {
      element = node;
    } else if (node instanceof Text) {
      element = node.parentElement;
    }
    while (element) {
      if (element.id === 'obsidian-clipper-dialog' || element.id === 'aiob-reader-panel') {
        return true;
      }
      element = element.parentElement;
    }
  }
  return false;
}

export function isSelectionEditable(selection: Selection): boolean {
  for (const node of [selection.anchorNode, selection.focusNode]) {
    let element: Element | null = null;
    if (node instanceof Element) {
      element = node;
    } else if (node instanceof Text) {
      element = node.parentElement;
    }
    if (!element) {
      continue;
    }
    if (
      element.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=true]'
      )
    ) {
      return true;
    }
  }
  return false;
}
