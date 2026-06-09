import type { PendingSelectionTracker } from './pendingSelectionTracker';

interface ShadowSelectionBridgeOptions {
  suppressSelectionCapture: () => boolean;
  getDocumentSelection: () => Selection | null;
  isRangeInsideUi: (range: Range) => boolean;
  pendingSelection: PendingSelectionTracker;
  activatePendingSelection: (event: Event, options?: { allowEventFallback?: boolean }) => void;
}

interface ShadowPointerStart {
  x: number;
  y: number;
}

interface ShadowMouseEventData {
  button: number;
  clientX: number;
  clientY: number;
}

interface ShadowRootListeners {
  syncSelection: () => void;
  handleMouseDown: (event: Event) => void;
  scheduleSync: (event: Event) => void;
}

export class ShadowSelectionBridge {
  private registeredRoots = new Map<ShadowRoot, ShadowRootListeners>();
  private pointerStarts = new WeakMap<ShadowRoot, ShadowPointerStart>();
  private activatedEvents = new WeakSet<Event>();

  constructor(private readonly options: ShadowSelectionBridgeOptions) {}

  register(root: ShadowRoot): void {
    if (this.registeredRoots.has(root)) {
      return;
    }

    const syncSelection = () => {
      if (this.options.suppressSelectionCapture()) {
        return;
      }
      const selection = this.getSelectionForRoot(root);
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

    const handleMouseDown = (event: Event) => {
      const mouse = readShadowMouseEventData(event);
      if (!mouse || mouse.button !== 0) {
        this.pointerStarts.delete(root);
        return;
      }
      this.pointerStarts.set(root, { x: mouse.clientX, y: mouse.clientY });
    };

    const activateOnce = (eventKey: Event, activationEvent: Event, allowEventFallback: boolean) => {
      if (this.activatedEvents.has(eventKey)) {
        return;
      }
      this.activatedEvents.add(eventKey);
      this.options.activatePendingSelection(activationEvent, { allowEventFallback });
    };

    const scheduleSync = (event: Event) => {
      const view = root.ownerDocument.defaultView ?? window;
      const allowEventFallback = this.isDragSelectionEnd(root, event);
      const activationEvent = snapshotShadowSelectionEvent(event);
      view.setTimeout(syncSelection, 0);
      view.setTimeout(() => {
        syncSelection();
        activateOnce(event, activationEvent, allowEventFallback);
      }, 32);
    };

    root.addEventListener('selectionchange', syncSelection, true);
    root.addEventListener('mousedown', handleMouseDown, true);
    root.addEventListener('mouseup', scheduleSync, true);
    root.addEventListener('touchend', scheduleSync, true);
    root.addEventListener('keyup', scheduleSync, true);
    this.registeredRoots.set(root, {
      syncSelection,
      handleMouseDown,
      scheduleSync
    });
  }

  reset(): void {
    for (const [root, listeners] of this.registeredRoots) {
      root.removeEventListener('selectionchange', listeners.syncSelection, true);
      root.removeEventListener('mousedown', listeners.handleMouseDown, true);
      root.removeEventListener('mouseup', listeners.scheduleSync, true);
      root.removeEventListener('touchend', listeners.scheduleSync, true);
      root.removeEventListener('keyup', listeners.scheduleSync, true);
    }
    this.registeredRoots.clear();
    this.pointerStarts = new WeakMap();
    this.activatedEvents = new WeakSet();
  }

  private getSelectionForRoot(root: ShadowRoot): Selection | null {
    const rootWithSelection = root as ShadowRoot & {
      getSelection?: () => Selection | null;
    };
    if (typeof rootWithSelection.getSelection === 'function') {
      const rootSelection = rootWithSelection.getSelection();
      if (rootSelection) {
        return rootSelection;
      }
    }
    return this.options.getDocumentSelection();
  }

  private isDragSelectionEnd(root: ShadowRoot, event: Event): boolean {
    const mouse = readShadowMouseEventData(event);
    if (!mouse) {
      return false;
    }
    const start = this.pointerStarts.get(root);
    this.pointerStarts.delete(root);
    if (!start) {
      return false;
    }
    return Math.hypot(mouse.clientX - start.x, mouse.clientY - start.y) >= 4;
  }
}

function readShadowMouseEventData(event: Event): ShadowMouseEventData | null {
  if (
    !('button' in event) ||
    !('clientX' in event) ||
    !('clientY' in event) ||
    typeof event.button !== 'number' ||
    typeof event.clientX !== 'number' ||
    typeof event.clientY !== 'number'
  ) {
    return null;
  }
  return {
    button: event.button,
    clientX: event.clientX,
    clientY: event.clientY
  };
}

function snapshotShadowSelectionEvent(event: Event): Event {
  const path = event.composedPath();
  if (!path.length) {
    return event;
  }

  const snapshot = new Event(event.type, {
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    composed: event.composed
  });
  Object.defineProperty(snapshot, 'composedPath', {
    configurable: true,
    value: () => path
  });
  copyEventProperty(event, snapshot, 'button');
  copyEventProperty(event, snapshot, 'clientX');
  copyEventProperty(event, snapshot, 'clientY');
  copyEventProperty(event, snapshot, 'altKey');
  copyEventProperty(event, snapshot, 'metaKey');
  copyEventProperty(event, snapshot, 'ctrlKey');
  copyEventProperty(event, snapshot, 'shiftKey');
  return snapshot;
}

function copyEventProperty(source: Event, target: Event, key: string): void {
  if (!(key in source)) {
    return;
  }
  Object.defineProperty(target, key, {
    configurable: true,
    value: source[key as keyof Event]
  });
}
