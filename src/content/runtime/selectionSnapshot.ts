export type SelectionSnapshot = {
  range: Range;
  root: DocumentOrShadowRoot;
};

export type ActiveSelectionInfo = {
  selection: Selection;
  root: DocumentOrShadowRoot;
};

export function hasUsableSelection(selection: Selection | null | undefined): boolean {
  return Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);
}

export function getDocumentSelection(document: Document, window: Window): Selection | null {
  const docSelection = typeof document.getSelection === 'function' ? document.getSelection() : null;
  if (hasUsableSelection(docSelection)) {
    return docSelection;
  }
  if (typeof window.getSelection === 'function') {
    const winSelection = window.getSelection();
    if (hasUsableSelection(winSelection)) {
      return winSelection;
    }
  }
  return null;
}

export function getSelectionFromRoot(
  root: DocumentOrShadowRoot,
  document: Document,
  window: Window
): Selection | null {
  if (root instanceof Document) {
    return getDocumentSelection(document, window);
  }
  if (root instanceof ShadowRoot) {
    const shadowWithSelection = root as ShadowRoot & { getSelection?: () => Selection | null };
    const selection =
      typeof shadowWithSelection.getSelection === 'function'
        ? shadowWithSelection.getSelection()
        : null;
    if (hasUsableSelection(selection)) {
      return selection;
    }
  }
  return null;
}

export function captureSelectionSnapshotFromActive(
  active: ActiveSelectionInfo | null
): SelectionSnapshot | null {
  if (!active) {
    return null;
  }
  const { selection, root } = active;
  if (!hasUsableSelection(selection)) {
    return null;
  }
  try {
    const range = selection.getRangeAt(0).cloneRange();
    return { range, root };
  } catch {
    return null;
  }
}

export function restoreSelectionSnapshot(
  snapshot: SelectionSnapshot | null,
  getLastSelectionSnapshot: () => SelectionSnapshot | null,
  document: Document,
  window: Window
): ActiveSelectionInfo | null {
  const resolvedSnapshot = snapshot ?? getLastSelectionSnapshot();
  if (!resolvedSnapshot) {
    return null;
  }
  const selection = getSelectionFromRoot(resolvedSnapshot.root, document, window);
  if (!selection) {
    return null;
  }
  try {
    selection.removeAllRanges();
    selection.addRange(resolvedSnapshot.range.cloneRange());
    return { selection, root: resolvedSnapshot.root };
  } catch {
    return null;
  }
}
