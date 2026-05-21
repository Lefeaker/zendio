import {
  captureSelectionSnapshotFromActive,
  getDocumentSelection,
  restoreSelectionSnapshot,
  type ActiveSelectionInfo,
  type SelectionSnapshot
} from './selectionSnapshot';
import { findShadowSelection } from './selectionShadowRoots';
import { isSelectionEditable, isSelectionInsideUi } from './selectionGuards';

export type { ActiveSelectionInfo, SelectionSnapshot } from './selectionSnapshot';

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
    return restoreSelectionSnapshot(snapshot, getLastSelectionSnapshot, document, window);
  }

  function captureSelectionSnapshot(
    activeSelection?: ActiveSelectionInfo | null
  ): SelectionSnapshot | null {
    const active = activeSelection ?? findActiveSelection();
    return captureSelectionSnapshotFromActive(active);
  }

  function findActiveSelection(): ActiveSelectionInfo | null {
    const docSelection = getDocumentSelection(document, window);
    if (docSelection) {
      return { selection: docSelection, root: document };
    }
    if (!options.enablePlatformShadowSelection) {
      return null;
    }
    const shadowSelection = findShadowSelection(document);
    if (shadowSelection) {
      return shadowSelection;
    }
    return null;
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
