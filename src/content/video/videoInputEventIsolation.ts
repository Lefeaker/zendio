export const VIDEO_INPUT_TARGET_SELECTORS = [
  '[data-capture-input]',
  '[data-aiob-video-control-bar-note-input="true"]'
] as const;

const KEYBOARD_EVENT_TYPES = ['keydown', 'keyup', 'keypress'] as const;

export function isVideoEditableTarget(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.matches(
      'input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]'
    ) ||
      target.isContentEditable)
  );
}

export function eventTargetsVideoInput(event: Event): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  return path.some((target) => {
    if (!(target instanceof HTMLElement) || !isVideoEditableTarget(target)) {
      return false;
    }
    return VIDEO_INPUT_TARGET_SELECTORS.some((selector) => target.matches(selector));
  });
}

export function isolateVideoInputKeyboardEvent(event: KeyboardEvent): void {
  if (!eventTargetsVideoInput(event)) {
    return;
  }
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function needsOwnedTargetCommandHandler(event: KeyboardEvent): boolean {
  return !event.isComposing && (event.key === 'Enter' || event.key === 'Escape');
}

function isolateVideoInputKeyboardBoundaryEvent(event: KeyboardEvent): void {
  if (needsOwnedTargetCommandHandler(event)) {
    return;
  }
  isolateVideoInputKeyboardEvent(event);
}

export function bindVideoInputKeyboardIsolation(
  root: EventTarget,
  options: { capture?: boolean; preTargetBoundary?: boolean } = {}
): () => void {
  const handler = (event: Event): void => {
    if (event instanceof KeyboardEvent) {
      if (options.preTargetBoundary) {
        isolateVideoInputKeyboardBoundaryEvent(event);
        return;
      }
      isolateVideoInputKeyboardEvent(event);
    }
  };
  KEYBOARD_EVENT_TYPES.forEach((type) => root.addEventListener(type, handler, options.capture));
  return () => {
    KEYBOARD_EVENT_TYPES.forEach((type) =>
      root.removeEventListener(type, handler, options.capture)
    );
  };
}

export function bindVideoInputKeyboardIsolationBoundary(
  root: ShadowRoot | HTMLElement
): () => void {
  const ownerDocument = root.ownerDocument;
  const disposers = [
    bindVideoInputKeyboardIsolation(root),
    bindVideoInputKeyboardIsolation(ownerDocument, { capture: true, preTargetBoundary: true }),
    ownerDocument.defaultView
      ? bindVideoInputKeyboardIsolation(ownerDocument.defaultView, {
          capture: true,
          preTargetBoundary: true
        })
      : () => undefined
  ];
  return () => {
    disposers.forEach((dispose) => dispose());
  };
}
