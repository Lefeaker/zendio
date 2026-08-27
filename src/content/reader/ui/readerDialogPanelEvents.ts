import type { RuntimeSurfaceHandle } from '@content/stitch/runtimeSurfaceRenderer';
import { createRootActionDispatcher } from '@ui/stitch-runtime/render/rootActionDispatcher';
import type { ReaderPanelCallbacks, ReaderPanelHighlight } from '../application/readerPanelModel';
import type { SessionCommentDraftController } from '@content/shared/panels/sessionCommentDrafts';
import type { SessionPanelCollapsePersistence } from '@content/shared/panels/sessionPanelCollapsePersistence';

const INTERACTIVE_TARGET_SELECTOR =
  'button,input,textarea,select,a,[contenteditable="true"],[data-action-id]';

export interface ReaderDialogPanelEventHandlers {
  isCollapsed(): boolean;
  expandCollapsedPanel(): void;
  finish(): void;
  cancel(): void;
  toggleCollapse(): void;
  selectDestination(id: string): void;
  deleteHighlight(id: string): void;
  saveHighlight(id: string, input: HTMLInputElement): void;
  focusHighlight(id: string): void;
  focusInput(id: string): void;
  input(id: string, input: HTMLInputElement): void;
  keydown(id: string, input: HTMLInputElement, event: KeyboardEvent): void;
}

export function createReaderDialogPanelEventHandlers(options: {
  callbacks: ReaderPanelCallbacks;
  drafts: SessionCommentDraftController<ReaderPanelHighlight>;
  collapse: SessionPanelCollapsePersistence;
  setEditing(id: string): void;
}): ReaderDialogPanelEventHandlers {
  return {
    isCollapsed: () => options.collapse.value,
    expandCollapsedPanel: () => options.collapse.set(false, { persist: true }),
    finish: () => {
      void options.drafts.runAfterFlush(() => options.callbacks.onFinish());
    },
    cancel: () => options.callbacks.onCancel(),
    toggleCollapse: () => options.collapse.toggle({ persist: true }),
    selectDestination: (id) => {
      void options.callbacks.onSelectDestination?.(id);
    },
    deleteHighlight: (id) => {
      options.drafts.captureRenderedInputs();
      void Promise.resolve(options.callbacks.onDeleteHighlight(id))
        .then(() => options.drafts.clear(id))
        .catch((error) =>
          console.warn('[ReaderDialogPanel] Failed to complete async panel action:', error)
        );
    },
    saveHighlight: (id, input) => {
      void options.drafts.submit(id, input.value);
    },
    focusHighlight: (id) => options.callbacks.onFocusHighlight(id),
    focusInput: options.setEditing,
    input: (id, input) => options.drafts.handleInput(input, id),
    keydown: (id, input, event) => options.drafts.handleKeydown(event, input, id)
  };
}

export function bindReaderDialogPanelEvents(
  handle: RuntimeSurfaceHandle,
  handlers: ReaderDialogPanelEventHandlers
): () => void {
  const dispatcher = createRootActionDispatcher(handle.root);
  const disposers = [
    dispatcher.register(handle.root, 'click', () => handlers.cancel()),
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
      const item = target?.closest<HTMLElement>('[data-highlight-id]') ?? null;
      if (item && !target?.closest(INTERACTIVE_TARGET_SELECTOR)) {
        const id = item.dataset.highlightId;
        if (id) handlers.focusHighlight(id);
      }
    }),
    dispatcher.register(handle.sessionWindow, 'input', (event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      const id = input?.dataset.highlightInput;
      if (input && id) handlers.input(id, input);
    }),
    dispatcher.register(handle.sessionWindow, 'focusin', (event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      const id = input?.dataset.highlightInput;
      if (id) handlers.focusInput(id);
    }),
    dispatcher.register(handle.sessionWindow, 'keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      const id = input?.dataset.highlightInput;
      if (input && id) handlers.keydown(id, input, event);
    })
  ];

  return () => {
    disposers.forEach((dispose) => dispose());
    dispatcher.dispose();
  };
}

function routeAction(target: HTMLElement, handlers: ReaderDialogPanelEventHandlers): void {
  switch (target.dataset.actionId) {
    case 'reader:finish':
      handlers.finish();
      return;
    case 'reader:cancel':
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
    case 'reader:delete': {
      const id =
        target.dataset.highlightId ??
        target.closest<HTMLElement>('[data-highlight-id]')?.dataset.highlightId;
      if (id) handlers.deleteHighlight(id);
      return;
    }
    case 'reader:save': {
      const item = target.closest<HTMLElement>('[data-highlight-id]');
      const id = target.dataset.highlightId ?? item?.dataset.highlightId;
      const input = item?.querySelector<HTMLInputElement>('[data-highlight-input]') ?? null;
      if (id && input) handlers.saveHighlight(id, input);
    }
  }
}
