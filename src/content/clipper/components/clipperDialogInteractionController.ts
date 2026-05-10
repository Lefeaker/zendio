export type KeyboardMove = { handled: true; deltaX: number; deltaY: number } | { handled: false };

export function resolveClipperDialogKeyboardMove(event: KeyboardEvent): KeyboardMove {
  if (!event.altKey) {
    return { handled: false };
  }

  const step = event.shiftKey ? 40 : 20;
  switch (event.key) {
    case 'ArrowUp':
      return { handled: true, deltaX: 0, deltaY: -step };
    case 'ArrowDown':
      return { handled: true, deltaX: 0, deltaY: step };
    case 'ArrowLeft':
      return { handled: true, deltaX: -step, deltaY: 0 };
    case 'ArrowRight':
      return { handled: true, deltaX: step, deltaY: 0 };
    default:
      return { handled: false };
  }
}
