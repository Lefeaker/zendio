import type { RuntimeSurfaceHandle } from '@content/stitch/runtimeSurfaceRenderer';
import { createRootActionDispatcher } from '@ui/stitch-runtime/render/rootActionDispatcher';
import type { VideoPanelCallbacks, VideoPanelCapture } from '../application/videoPanelModel';
import type { SessionCommentDraftController } from '@content/shared/panels/sessionCommentDrafts';
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
  keydown(id: string, input: HTMLInputElement, event: KeyboardEvent): void;
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
  return (
    target instanceof Node &&
    (target === root || root.contains(target) || Boolean(root.shadowRoot?.contains(target)))
  );
}

export function bindVideoDialogPanelEvents(
  handle: RuntimeSurfaceHandle,
  handlers: VideoDialogPanelEventHandlers
): () => void {
  const dispatcher = createRootActionDispatcher(handle.root);
  const disposers = [
    dispatcher.register(handle.root, 'click', () => handlers.cancel()),
    dispatcher.register(handle.sessionWindow, 'mousedown', (event) => {
      if (handlers.isCollapsed()) event.preventDefault();
    }),
    dispatcher.register(handle.sessionWindow, 'click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
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
    dispatcher.register(handle.sessionWindow, 'input', (event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      const id = input?.dataset.captureInput;
      if (input && id) handlers.input(id, input);
    }),
    dispatcher.register(handle.sessionWindow, 'focusin', (event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      const id = input?.dataset.captureInput;
      if (id) handlers.focusInput(id);
    }),
    dispatcher.register(handle.sessionWindow, 'focusout', (event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      const id = input?.dataset.captureInput;
      if (id) handlers.blurInput(id, event instanceof FocusEvent ? event.relatedTarget : null);
    }),
    dispatcher.register(handle.sessionWindow, 'keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      const id = input?.dataset.captureInput;
      if (input && id) handlers.keydown(id, input, event);
    })
  ];

  return () => {
    disposers.forEach((dispose) => dispose());
    dispatcher.dispose();
  };
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
