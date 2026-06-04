import { bindVideoInputKeyboardIsolationBoundary } from './videoInputEventIsolation';

export const CONTROL_POPOVER_CLASS = 'aiob-video-control-bar-popover';

export type VideoControlBarPopoverCloseReason =
  | 'outside-dismiss'
  | 'toggle-dismiss'
  | 'submit'
  | 'owner-removal';

interface VideoControlBarPreferencesSnapshot {
  autoPauseEnabled: boolean;
  captureScreenshotEnabled: boolean;
}

interface VideoControlBarPopoverControllerOptions {
  doc: Document;
  button: HTMLButtonElement;
  popover: HTMLElement;
  getPreferences: () => VideoControlBarPreferencesSnapshot;
  onPopoverDismiss?: ((preferences: VideoControlBarPreferencesSnapshot) => void) | undefined;
  onPopoverClose?:
    | ((
        reason: VideoControlBarPopoverCloseReason,
        preferences: VideoControlBarPreferencesSnapshot
      ) => void)
    | undefined;
}

interface VideoControlBarPopoverController {
  close(reason: VideoControlBarPopoverCloseReason): void;
}

const popoverKeyboardIsolationDisposers = new WeakMap<HTMLElement, () => void>();
const popoverCloseHandlers = new WeakMap<
  HTMLElement,
  (reason: VideoControlBarPopoverCloseReason) => void
>();

export function closeVideoControlBarPopovers(
  doc: Document,
  reason: VideoControlBarPopoverCloseReason = 'owner-removal'
): void {
  doc.querySelectorAll<HTMLElement>(`.${CONTROL_POPOVER_CLASS}`).forEach((popover) => {
    const closePopover = popoverCloseHandlers.get(popover);
    if (closePopover) {
      closePopover(reason);
      return;
    }
    disposePopoverKeyboardIsolation(popover);
    popoverCloseHandlers.delete(popover);
    popover.remove();
  });
}

export function createVideoControlBarPopoverController(
  options: VideoControlBarPopoverControllerOptions
): VideoControlBarPopoverController {
  const disposeKeyboardIsolation = bindVideoInputKeyboardIsolationBoundary(options.popover);
  popoverKeyboardIsolationDisposers.set(options.popover, disposeKeyboardIsolation);
  let closed = false;

  const closePopover = (reason: VideoControlBarPopoverCloseReason): void => {
    if (closed) {
      return;
    }
    closed = true;
    options.doc.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    disposeKeyboardIsolation();
    popoverKeyboardIsolationDisposers.delete(options.popover);
    popoverCloseHandlers.delete(options.popover);
    options.popover.remove();
    const preferences = options.getPreferences();
    if (reason === 'outside-dismiss' || reason === 'toggle-dismiss') {
      options.onPopoverDismiss?.(preferences);
    }
    options.onPopoverClose?.(reason, preferences);
  };

  function handleDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (options.popover.contains(target) || options.button.contains(target)) {
      return;
    }
    closePopover('outside-dismiss');
  }

  popoverCloseHandlers.set(options.popover, closePopover);
  options.doc.addEventListener('pointerdown', handleDocumentPointerDown, true);
  return { close: closePopover };
}

function disposePopoverKeyboardIsolation(popover: HTMLElement): void {
  popoverKeyboardIsolationDisposers.get(popover)?.();
  popoverKeyboardIsolationDisposers.delete(popover);
}
