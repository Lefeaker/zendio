export function createSessionPanelRenderRoot(id?: string): HTMLElement {
  const root = document.createElement('div');
  if (id) {
    root.id = id;
  }
  root.style.position = 'fixed';
  root.style.inset = '0';
  root.style.zIndex = '2147483647';
  root.style.pointerEvents = 'none';
  return root;
}
