export interface DomEventHandlers {
  handleModifierKey(event: KeyboardEvent): void;
  handleWindowBlur(): void;
  handlePrimaryMouseDown(event: MouseEvent): void;
  handleAutoSelectionClip(event: MouseEvent): void;
  handleSelectionChange(): void;
  handleSelectStart(event: Event): void;
}

export interface WireDomEventsOptions {
  document: Document;
  window: Window;
  handlers: DomEventHandlers;
}

export interface DomEventsDisposer {
  dispose(): void;
}

export function wireDomEvents(options: WireDomEventsOptions): DomEventsDisposer {
  const { document, window, handlers } = options;

  let attached = false;

  const keydown = (event: KeyboardEvent) => handlers.handleModifierKey(event);
  const keyup = (event: KeyboardEvent) => handlers.handleModifierKey(event);
  const blur = () => handlers.handleWindowBlur();
  const mousedown = (event: MouseEvent) => handlers.handlePrimaryMouseDown(event);
  const mouseup = (event: MouseEvent) => handlers.handleAutoSelectionClip(event);
  const selectionchange = () => handlers.handleSelectionChange();
  const selectstart = (event: Event) => handlers.handleSelectStart(event);

  if (!attached) {
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('keyup', keyup, true);
    window.addEventListener('blur', blur, true);
    document.addEventListener('mousedown', mousedown, true);
    document.addEventListener('mouseup', mouseup, true);
    document.addEventListener('selectionchange', selectionchange, true);
    document.addEventListener('selectstart', selectstart, true);
    attached = true;
  }

  return {
    dispose: () => {
      if (!attached) return;
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', blur, true);
      document.removeEventListener('mousedown', mousedown, true);
      document.removeEventListener('mouseup', mouseup, true);
      document.removeEventListener('selectionchange', selectionchange, true);
      document.removeEventListener('selectstart', selectstart, true);
      attached = false;
    }
  };
}
