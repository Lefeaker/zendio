interface ReaderPanelCompatibilityOptions {
  collapsed: boolean;
  onExpand: () => void;
}

interface ReaderHighlightInteractionHandlers {
  onFocusHighlight: (id: string) => void;
  onInputFocus: (id: string) => void;
  bindInput: (input: HTMLInputElement | null, id: string) => void;
}

export function applyReaderPanelCompatibilityAttributes(
  surface: HTMLElement,
  options: ReaderPanelCompatibilityOptions
): void {
  surface.style.pointerEvents = 'none';
  const modal = surface.querySelector<HTMLElement>('.resource-modal--session');
  modal?.classList.toggle('is-collapsed', options.collapsed);
  const surfaceWindow = surface.querySelector<HTMLElement>('.reader-surface-window');
  surfaceWindow?.classList.toggle('is-collapsed', options.collapsed);
  const dialog = surface.querySelector<HTMLElement>('[role="dialog"]');
  if (dialog) {
    dialog.dataset.role = 'dialog-title';
    dialog.style.pointerEvents = 'auto';
  }
  surfaceWindow?.style.setProperty('pointer-events', 'auto');
  if (options.collapsed && surfaceWindow) {
    surfaceWindow.addEventListener('click', options.onExpand);
  }
  surface
    .querySelector<HTMLElement>('[data-action-id="reader:finish"]')
    ?.setAttribute('data-role', 'export-btn');
  surface
    .querySelector<HTMLElement>('[data-action-id="reader:cancel"]')
    ?.setAttribute('data-role', 'close-btn');
  const collapseTrigger = surface.querySelector<HTMLButtonElement>(
    '[data-action-id="session:toggleCollapse"]'
  );
  if (collapseTrigger) {
    collapseTrigger.hidden = options.collapsed;
    collapseTrigger.setAttribute('aria-expanded', options.collapsed ? 'false' : 'true');
    collapseTrigger.setAttribute(
      'aria-label',
      options.collapsed ? 'Expand panel' : 'Collapse panel'
    );
    collapseTrigger.textContent = options.collapsed ? '⌃' : '⌄';
  }
  surface.querySelectorAll<HTMLElement>('article[data-highlight-id]').forEach((item) => {
    item.dataset.role = 'highlight-item';
  });
}

export function bindReaderHighlightInteractions(
  surface: HTMLElement,
  handlers: ReaderHighlightInteractionHandlers
): void {
  surface.querySelectorAll<HTMLElement>('[data-highlight-id]').forEach((item) => {
    const id = item.dataset.highlightId;
    if (!id) {
      return;
    }
    item.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (isInteractiveHighlightTarget(target)) {
        return;
      }
      handlers.onFocusHighlight(id);
    });
    const input = item.querySelector<HTMLInputElement>('[data-highlight-input]');
    input?.addEventListener('focus', () => {
      handlers.onInputFocus(id);
    });
    handlers.bindInput(input, id);
  });
}

function isInteractiveHighlightTarget(target: Element | null): boolean {
  return Boolean(
    target?.closest(
      'button, input, textarea, select, a, [contenteditable="true"], [data-action-id]'
    )
  );
}
