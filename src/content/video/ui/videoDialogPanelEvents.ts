import {
  handleRuntimeOptionsLink,
  type RuntimeSurfaceHandle
} from '@content/stitch/runtimeSurfaceRenderer';
import type { VideoPanelCallbacks, VideoPanelCapture } from '../application/videoPanelModel';
import type {
  SessionCommentDraftController,
  SessionCommentDraftKeyboardEvent
} from '@content/shared/panels/sessionCommentDrafts';
import type { SessionPanelCollapsePersistence } from '@content/shared/panels/sessionPanelCollapsePersistence';

const INTERACTIVE_TARGET_SELECTOR =
  'button,input,textarea,select,a,[contenteditable="true"],[data-action-id]';

export interface VideoDialogPanelEventHandlers {
  isCollapsed(): boolean;
  expandCollapsedPanel(): void;
  addCapture(source: 'button' | 'note-input'): void;
  finish(): void;
  cancel(): void;
  toggleCollapse(): void;
  selectDestination(id: string): void;
  deleteCapture(id: string): void;
  toggleScreenshot(id: string): void;
  focusCapture(id: string): void;
  focusInput(id: string): void;
  blurInput(id: string, relatedTarget: EventTarget | null): void;
  input(id: string, input: HTMLInputElement): void;
  keydown(id: string, input: HTMLInputElement, event: SessionCommentDraftKeyboardEvent): void;
}

export function createVideoDialogPanelEventHandlers(options: {
  callbacks: VideoPanelCallbacks;
  root: HTMLElement;
  drafts: SessionCommentDraftController<VideoPanelCapture>;
  collapse: SessionPanelCollapsePersistence;
  getEditing(): string | null;
  setEditing(id: string | null): void;
  cancelActiveEditor(): void;
}): VideoDialogPanelEventHandlers {
  return {
    isCollapsed: () => options.collapse.value,
    expandCollapsedPanel: () => options.collapse.set(false, { persist: true }),
    addCapture: (source) => {
      void options.drafts.runAfterFlush(() => options.callbacks.onAddCapture(source));
    },
    finish: () => {
      void options.drafts.runAfterFlush(() => options.callbacks.onFinish());
    },
    cancel: () => {
      options.cancelActiveEditor();
      options.callbacks.onCancel();
    },
    toggleCollapse: () => options.collapse.toggle({ persist: true }),
    selectDestination: (id) => {
      void options.callbacks.onSelectDestination?.(id);
    },
    deleteCapture: (id) => {
      if (id === options.getEditing()) {
        options.callbacks.onCaptureEditorCancel?.(id);
        options.setEditing(null);
      }
      options.drafts.clear(id);
      options.callbacks.onDeleteCapture(id);
    },
    toggleScreenshot: (id) => {
      void options.callbacks.onToggleScreenshot(id);
    },
    focusCapture: (id) => options.callbacks.onFocusCapture(id),
    focusInput: (id) => options.callbacks.onCaptureEditorFocus?.(id),
    blurInput: (id, target) =>
      options.callbacks.onCaptureEditorBlur?.(
        id,
        isTargetInsidePanel(options.root, target) ? 'inside-panel' : 'outside-panel'
      ),
    input: (id, input) => options.drafts.handleInput(input, id),
    keydown: (id, input, event) => options.drafts.handleKeydown(event, input, id)
  };
}

function isTargetInsidePanel(root: HTMLElement, target: EventTarget | null): boolean {
  const node = asNode(root.ownerDocument, target);
  return (
    node !== null &&
    (node === root || root.contains(node) || Boolean(root.shadowRoot?.contains(node)))
  );
}

export function bindVideoDialogPanelEvents(
  handle: RuntimeSurfaceHandle,
  handlers: VideoDialogPanelEventHandlers
): () => void {
  const disposers = [
    bindEvent(handle.root, 'click', (event) => {
      if (!isInsideDialog(event, handle.dialog)) handlers.cancel();
    }),
    bindEvent(handle.sessionWindow, 'click', (event) => {
      if (handleRuntimeOptionsLink(event)) return;
      const target = asElement(event.target);
      if (handlers.isCollapsed()) {
        handlers.expandCollapsedPanel();
        return;
      }
      const actionTarget = target?.closest<HTMLElement>('[data-action-id]') ?? null;
      if (actionTarget) {
        routeAction(actionTarget, handlers);
        return;
      }
      const item = target?.closest<HTMLElement>('[data-capture-id]') ?? null;
      if (item && !target?.closest(INTERACTIVE_TARGET_SELECTOR)) {
        const id = item.dataset.captureId;
        if (id) handlers.focusCapture(id);
      }
    }),
    bindEvent(handle.sessionWindow, 'input', (event) => {
      const input = asInput(event.target);
      const id = input?.dataset.captureInput;
      if (input && id) handlers.input(id, input);
    }),
    bindEvent(handle.sessionWindow, 'focusin', (event) => {
      const input = asInput(event.target);
      const id = input?.dataset.captureInput;
      if (id) handlers.focusInput(id);
    }),
    bindEvent(handle.sessionWindow, 'focusout', (event) => {
      const input = asInput(event.target);
      const id = input?.dataset.captureInput;
      const relatedTarget = 'relatedTarget' in event ? event.relatedTarget : null;
      if (id) handlers.blurInput(id, isEventTarget(relatedTarget) ? relatedTarget : null);
    }),
    bindEvent(handle.sessionWindow, 'keydown', (event) => {
      if (!isSessionCommentDraftKeyboardEvent(event)) return;
      const input = asInput(event.target);
      const id = input?.dataset.captureInput;
      if (input && id) handlers.keydown(id, input, event);
    })
  ];

  return () => {
    disposers.forEach((dispose) => dispose());
  };
}

function bindEvent(
  target: HTMLElement,
  type: 'click' | 'input' | 'focusin' | 'focusout' | 'keydown',
  handler: (event: Event) => void
): () => void {
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}

function asElement(target: EventTarget | null): Element | null {
  if (
    !target ||
    typeof target !== 'object' ||
    !('closest' in target) ||
    typeof target.closest !== 'function'
  ) {
    return null;
  }
  return target as Element;
}

function asInput(target: EventTarget | null): HTMLInputElement | null {
  const element = asElement(target);
  return element?.tagName === 'INPUT' ? (element as HTMLInputElement) : null;
}

function isEventTarget(value: unknown): value is EventTarget {
  return typeof value === 'object' && value !== null && 'addEventListener' in value;
}

function asNode(document: Document, target: EventTarget | null): Node | null {
  const NodeConstructor = document.defaultView?.Node;
  return NodeConstructor && target instanceof NodeConstructor ? (target as Node) : null;
}

function isSessionCommentDraftKeyboardEvent(
  event: Event
): event is Event & SessionCommentDraftKeyboardEvent {
  return (
    'key' in event &&
    typeof event.key === 'string' &&
    'isComposing' in event &&
    typeof event.isComposing === 'boolean'
  );
}

function isInsideDialog(event: Event, dialog: HTMLElement): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  if (path.length > 0) return path.includes(dialog);
  const target = asNode(dialog.ownerDocument, event.target);
  return target !== null && dialog.contains(target);
}

function routeAction(target: HTMLElement, handlers: VideoDialogPanelEventHandlers): void {
  switch (target.dataset.actionId) {
    case 'video:add':
      handlers.addCapture('button');
      return;
    case 'video:add-note':
      handlers.addCapture('note-input');
      return;
    case 'video:finish':
      handlers.finish();
      return;
    case 'video:cancel':
      handlers.cancel();
      return;
    case 'session:toggleCollapse':
      handlers.toggleCollapse();
      return;
    case 'export-destination:select': {
      const id = target.dataset.destinationId;
      if (id) handlers.selectDestination(id);
      return;
    }
    case 'video:delete': {
      const id =
        target.dataset.captureId ??
        target.closest<HTMLElement>('[data-capture-id]')?.dataset.captureId;
      if (id) handlers.deleteCapture(id);
      return;
    }
    case 'video:toggle-screenshot': {
      const id =
        target.dataset.captureId ??
        target.closest<HTMLElement>('[data-capture-id]')?.dataset.captureId;
      if (id) handlers.toggleScreenshot(id);
    }
  }
}
