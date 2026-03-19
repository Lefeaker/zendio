import type { PendingSelectionTracker } from './pendingSelectionTracker';

interface ShadowSelectionBridgeOptions {
  suppressSelectionCapture: () => boolean;
  getDocumentSelection: () => Selection | null;
  isRangeInsideUi: (range: Range) => boolean;
  pendingSelection: PendingSelectionTracker;
}

export class ShadowSelectionBridge {
  private registeredRoots: WeakSet<ShadowRoot> = new WeakSet();

  constructor(private readonly options: ShadowSelectionBridgeOptions) {}

  register(root: ShadowRoot): void {
    if (this.registeredRoots.has(root)) {
      return;
    }

    const syncSelection = () => {
      if (this.options.suppressSelectionCapture()) {
        return;
      }
      const selection = this.options.getDocumentSelection();
      if (!selection) {
        return;
      }
      if (!selection.rangeCount || selection.isCollapsed) {
        if (this.options.pendingSelection.hasActiveRange()) {
          this.options.pendingSelection.scheduleClear();
        }
        return;
      }

      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      if (!root.contains(container)) {
        return;
      }
      if (this.options.isRangeInsideUi(range)) {
        this.options.pendingSelection.reset();
        return;
      }
      this.options.pendingSelection.capture(range);
    };

    const scheduleSync = () => {
      window.setTimeout(syncSelection, 0);
    };

    root.addEventListener('selectionchange', syncSelection, true);
    root.addEventListener('mouseup', scheduleSync, true);
    root.addEventListener('touchend', scheduleSync, true);
    root.addEventListener('keyup', scheduleSync, true);
    this.registeredRoots.add(root);
  }

  reset(): void {
    this.registeredRoots = new WeakSet();
  }
}
