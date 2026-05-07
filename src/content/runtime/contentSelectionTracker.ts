export type SelectionSnapshot = {
  range: Range;
  root: DocumentOrShadowRoot;
};

export type ActiveSelectionInfo = {
  selection: Selection;
  root: DocumentOrShadowRoot;
};

export interface ContentSelectionTracker {
  handleSelectionChange(): void;
  handleSelectStart(): void;
  resolveActiveSelection(): ActiveSelectionInfo | null;
  restoreSelectionFromSnapshot(snapshot: SelectionSnapshot | null): ActiveSelectionInfo | null;
  captureSelectionSnapshot(activeSelection?: ActiveSelectionInfo | null): SelectionSnapshot | null;
  findActiveSelection(): ActiveSelectionInfo | null;
  isSelectionInsideUi(selection: Selection): boolean;
  isSelectionEditable(selection: Selection): boolean;
}

export interface CreateContentSelectionTrackerOptions {
  document: Document;
  window: Window;
  enablePlatformShadowSelection?: boolean;
  getLastSelectionSnapshot: () => SelectionSnapshot | null;
  setLastSelectionSnapshot: (snapshot: SelectionSnapshot | null) => void;
}

const BILIBILI_SHADOW_HOST_SELECTORS = [
  'bili-comment-thread-renderer',
  'bili-comment-renderer',
  'bili-comment-reply-renderer',
  'bili-rich-text',
  'bili-comment-area',
  'bili-comment-list',
  'bili-comment-item',
  'bili-comment-content',
  'bili-comment-text',
  'bili-comment-reply-list',
  'bili-comment-reply-item',
  'bili-comment-user-info',
  'bili-avatar',
  'bili-dynamic-content',
  'bili-comment-box',
  'bili-comment-editor',
  'bili-comment-actions',
  'bili-comment-time',
  'bili-comment-like',
  'bili-comment-reply-btn'
] as const;

export function createContentSelectionTracker(
  options: CreateContentSelectionTrackerOptions
): ContentSelectionTracker {
  const { document, window, getLastSelectionSnapshot, setLastSelectionSnapshot } = options;

  function handleSelectionChange(): void {
    const active = findActiveSelection();
    if (!active) {
      setLastSelectionSnapshot(null);
      return;
    }
    if (isSelectionInsideUi(active.selection) || isSelectionEditable(active.selection)) {
      return;
    }
    const snapshot = captureSelectionSnapshot(active);
    if (snapshot) {
      setLastSelectionSnapshot(snapshot);
    }
  }

  function handleSelectStart(): void {
    const snapshot = captureSelectionSnapshot();
    if (snapshot) {
      setLastSelectionSnapshot(snapshot);
    }
  }

  function resolveActiveSelection(): ActiveSelectionInfo | null {
    const active = findActiveSelection();
    if (!active) {
      return null;
    }
    const snapshot = captureSelectionSnapshot(active);
    if (snapshot) {
      setLastSelectionSnapshot(snapshot);
    }
    return active;
  }

  function restoreSelectionFromSnapshot(
    snapshot: SelectionSnapshot | null
  ): ActiveSelectionInfo | null {
    const resolvedSnapshot = snapshot ?? getLastSelectionSnapshot();
    if (!resolvedSnapshot) {
      return null;
    }
    const selection = getSelectionFromRoot(resolvedSnapshot.root);
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

  function captureSelectionSnapshot(
    activeSelection?: ActiveSelectionInfo | null
  ): SelectionSnapshot | null {
    const active = activeSelection ?? findActiveSelection();
    if (!active) {
      return null;
    }
    const { selection, root } = active;
    if (selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }
    try {
      const range = selection.getRangeAt(0).cloneRange();
      return { range, root };
    } catch {
      return null;
    }
  }

  function findActiveSelection(): ActiveSelectionInfo | null {
    const docSelection = getDocumentSelection();
    if (docSelection) {
      return { selection: docSelection, root: document };
    }
    if (!options.enablePlatformShadowSelection) {
      return null;
    }
    const shadowSelection = findShadowSelection();
    if (shadowSelection) {
      return shadowSelection;
    }
    return null;
  }

  function findShadowSelection(): ActiveSelectionInfo | null {
    const visited = new Set<ShadowRoot>();
    const queue = collectInitialShadowRoots();

    while (queue.length) {
      const root = queue.pop();
      if (!root || visited.has(root)) {
        continue;
      }
      visited.add(root);

      const selection = getSelectionFromRoot(root);
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        return { selection, root };
      }

      collectChildShadowRoots(root, queue);
    }

    return null;
  }

  function collectInitialShadowRoots(): ShadowRoot[] {
    const roots: ShadowRoot[] = [];
    BILIBILI_SHADOW_HOST_SELECTORS.forEach((selector) => {
      const hosts = Array.from(document.querySelectorAll<HTMLElement>(selector));
      hosts.forEach((host) => {
        if (host.shadowRoot) {
          roots.push(host.shadowRoot);
        }
      });
    });
    return roots;
  }

  function collectChildShadowRoots(root: ShadowRoot, queue: ShadowRoot[]): void {
    const elements = Array.from(root.querySelectorAll<HTMLElement>('*'));
    elements.forEach((element) => {
      if (element.shadowRoot) {
        queue.push(element.shadowRoot);
      }
    });
  }

  function getSelectionFromRoot(root: DocumentOrShadowRoot): Selection | null {
    if (root instanceof Document) {
      return getDocumentSelection();
    }
    if (root instanceof ShadowRoot) {
      const shadowWithSelection = root as ShadowRoot & { getSelection?: () => Selection | null };
      const selection =
        typeof shadowWithSelection.getSelection === 'function'
          ? shadowWithSelection.getSelection()
          : null;
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        return selection;
      }
    }
    return null;
  }

  function getDocumentSelection(): Selection | null {
    const docSelection =
      typeof document.getSelection === 'function' ? document.getSelection() : null;
    if (docSelection && docSelection.rangeCount > 0 && !docSelection.isCollapsed) {
      return docSelection;
    }
    if (typeof window.getSelection === 'function') {
      const winSelection = window.getSelection();
      if (winSelection && winSelection.rangeCount > 0 && !winSelection.isCollapsed) {
        return winSelection;
      }
    }
    return null;
  }

  function isSelectionInsideUi(selection: Selection): boolean {
    const nodes = [selection.anchorNode, selection.focusNode];
    return nodes.some((node) => {
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
      return false;
    });
  }

  function isSelectionEditable(selection: Selection): boolean {
    const nodes = [selection.anchorNode, selection.focusNode];
    return nodes.some((node) => {
      let element: Element | null = null;
      if (node instanceof Element) {
        element = node;
      } else if (node instanceof Text) {
        element = node.parentElement;
      }
      if (!element) {
        return false;
      }
      return Boolean(
        element.closest(
          'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=true]'
        )
      );
    });
  }

  return {
    handleSelectionChange,
    handleSelectStart,
    resolveActiveSelection,
    restoreSelectionFromSnapshot,
    captureSelectionSnapshot,
    findActiveSelection,
    isSelectionInsideUi,
    isSelectionEditable
  };
}
