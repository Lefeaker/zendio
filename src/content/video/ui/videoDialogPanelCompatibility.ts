export interface VideoDialogPanelCompatibilityOptions {
  surface: HTMLElement;
  collapsed: boolean;
  expandCollapsedPanel: () => void;
}

export function applyVideoDialogPanelCompatibilityAttributes(
  options: VideoDialogPanelCompatibilityOptions
): void {
  const { surface, collapsed, expandCollapsedPanel } = options;
  surface.style.pointerEvents = 'none';
  const modal = surface.querySelector<HTMLElement>('.resource-modal--session');
  modal?.classList.toggle('is-collapsed', collapsed);
  const surfaceWindow = surface.querySelector<HTMLElement>('.video-surface-window');
  surfaceWindow?.classList.toggle('is-collapsed', collapsed);
  const dialog = surface.querySelector<HTMLElement>('[role="dialog"]');
  if (dialog) {
    dialog.dataset.element = 'dialog';
    dialog.style.pointerEvents = 'auto';
  }
  surfaceWindow?.style.setProperty('pointer-events', 'auto');
  if (collapsed && surfaceWindow) {
    surfaceWindow.addEventListener('click', expandCollapsedPanel);
  }
  const collapseTrigger = surface.querySelector<HTMLButtonElement>(
    '[data-action-id="session:toggleCollapse"]'
  );
  if (collapseTrigger) {
    collapseTrigger.hidden = collapsed;
    collapseTrigger.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    collapseTrigger.setAttribute('aria-label', collapsed ? 'Expand panel' : 'Collapse panel');
    collapseTrigger.textContent = collapsed ? '⌃' : '⌄';
  }
  surface.querySelectorAll<HTMLElement>('article[data-capture-id]').forEach((item) => {
    item.dataset.role = 'capture-item';
  });
}
