import type { PendingSelectionTracker } from './pendingSelectionTracker';

export interface SelectionActivationPayload {
  range: Range | null;
  selection: Selection | null;
  event: Event;
}

interface SelectionActivationOptions {
  allowEventFallback?: boolean;
  sourceSelection?: Selection | null;
}

interface SelectionCaptureControllerOptions {
  doc: Document;
  pendingSelection: PendingSelectionTracker;
  shouldTrackSelection: () => boolean;
  suppressSelectionCapture: () => boolean;
  isRangeInsideUi: (range: Range) => boolean;
  getDocumentSelection: () => Selection | null;
  onSelectionActivated: (payload: SelectionActivationPayload) => void;
  onSelectionCleared?: () => void;
}

export class SelectionCaptureController {
  private readonly doc: Document;
  private readonly pendingSelection: PendingSelectionTracker;
  private readonly shouldTrackSelection: () => boolean;
  private readonly suppressSelectionCapture: () => boolean;
  private readonly isRangeInsideUi: (range: Range) => boolean;
  private readonly getDocumentSelection: () => Selection | null;
  private readonly onSelectionActivated: (payload: SelectionActivationPayload) => void;
  private readonly onSelectionCleared: (() => void) | undefined;
  private started = false;

  constructor(options: SelectionCaptureControllerOptions) {
    this.doc = options.doc;
    this.pendingSelection = options.pendingSelection;
    this.shouldTrackSelection = options.shouldTrackSelection;
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

  activatePendingSelection(event: Event, options: SelectionActivationOptions = {}): void {
    const button = readEventMouseButton(event);
    if (button !== null && button !== 0) {
      return;
    }

    const shouldTrack = this.shouldTrackSelection();
    const suppress = this.suppressSelectionCapture();
    if ((!shouldTrack && !options.allowEventFallback) || suppress) {
      return;
    }

    const selection = options.sourceSelection ?? this.getDocumentSelection();
    let activeRange: Range | null = null;

    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      activeRange = selection.getRangeAt(0).cloneRange();
      this.pendingSelection.reset();
    } else {
      activeRange = this.pendingSelection.consume();
    }

    if (!activeRange && !options.allowEventFallback) {
      return;
    }

    if (activeRange && this.isRangeInsideUi(activeRange)) {
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
  }

  private handleSelectionChange = (): void => {
    if (!this.shouldTrackSelection() || this.suppressSelectionCapture()) {
      return;
    }

    const selection = this.getDocumentSelection();
    if (!selection) {
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
    this.activatePendingSelection(event);
  };
}

function readEventMouseButton(event: Event): number | null {
  if (!('button' in event) || typeof event.button !== 'number') {
    return null;
  }
  return event.button;
}
