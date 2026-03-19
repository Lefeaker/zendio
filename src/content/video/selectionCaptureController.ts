import type { PendingSelectionTracker } from './pendingSelectionTracker';

export interface SelectionActivationPayload {
  range: Range;
  selection: Selection | null;
  event: MouseEvent;
}

interface SelectionCaptureControllerOptions {
  doc: Document;
  pendingSelection: PendingSelectionTracker;
  suppressSelectionCapture: () => boolean;
  isRangeInsideUi: (range: Range) => boolean;
  getDocumentSelection: () => Selection | null;
  onSelectionActivated: (payload: SelectionActivationPayload) => void;
  onSelectionCleared?: () => void;
}

export class SelectionCaptureController {
  private readonly doc: Document;
  private readonly pendingSelection: PendingSelectionTracker;
  private readonly suppressSelectionCapture: () => boolean;
  private readonly isRangeInsideUi: (range: Range) => boolean;
  private readonly getDocumentSelection: () => Selection | null;
  private readonly onSelectionActivated: (payload: SelectionActivationPayload) => void;
  private readonly onSelectionCleared: (() => void) | undefined;
  private started = false;

  constructor(options: SelectionCaptureControllerOptions) {
    this.doc = options.doc;
    this.pendingSelection = options.pendingSelection;
    this.suppressSelectionCapture = options.suppressSelectionCapture;
    this.isRangeInsideUi = options.isRangeInsideUi;
    this.getDocumentSelection = options.getDocumentSelection;
    this.onSelectionActivated = options.onSelectionActivated;
    this.onSelectionCleared = options.onSelectionCleared;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.doc.addEventListener('selectionchange', this.handleSelectionChange, true);
    this.doc.addEventListener('mouseup', this.handleMouseUp, true);
    this.doc.defaultView?.addEventListener('blur', this.handleWindowBlur, true);
    this.started = true;
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.doc.removeEventListener('selectionchange', this.handleSelectionChange, true);
    this.doc.removeEventListener('mouseup', this.handleMouseUp, true);
    this.doc.defaultView?.removeEventListener('blur', this.handleWindowBlur, true);
    this.started = false;
  }

  private handleSelectionChange = (): void => {
    const selection = this.getDocumentSelection();
    if (!selection || this.suppressSelectionCapture()) {
      return;
    }

    if (!selection.rangeCount || selection.isCollapsed) {
      if (this.pendingSelection.hasActiveRange()) {
        this.pendingSelection.scheduleClear();
      }
      return;
    }

    const range = selection.getRangeAt(0);
    if (this.isRangeInsideUi(range)) {
      this.pendingSelection.reset();
      this.onSelectionCleared?.();
      return;
    }

    this.pendingSelection.capture(range);
  };

  private handleWindowBlur = (): void => {
    this.pendingSelection.reset();
    this.onSelectionCleared?.();
  };

  private handleMouseUp = (event: MouseEvent): void => {
    if (event.button !== 0) {
      return;
    }

    const selection = this.getDocumentSelection();
    let activeRange: Range | null = null;

    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      activeRange = selection.getRangeAt(0).cloneRange();
      this.pendingSelection.reset();
    } else {
      activeRange = this.pendingSelection.consume();
    }

    if (!activeRange) {
      return;
    }

    if (this.isRangeInsideUi(activeRange)) {
      selection?.removeAllRanges();
      this.pendingSelection.reset();
      this.onSelectionCleared?.();
      return;
    }

    this.onSelectionActivated({
      range: activeRange,
      selection,
      event
    });
  };
}
