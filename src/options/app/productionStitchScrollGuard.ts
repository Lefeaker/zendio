export interface OptionsScrollSnapshot {
  main: HTMLElement | null;
  mainTop: number;
  windowX: number;
  windowY: number;
}

export interface ButtonPressScrollGuard {
  cleanup(): void;
  getSnapshot(): OptionsScrollSnapshot | null;
}

export function captureOptionsScroll(root: HTMLElement): OptionsScrollSnapshot {
  const main = root.querySelector<HTMLElement>('.main');
  return {
    main,
    mainTop: main?.scrollTop ?? 0,
    windowX: window.scrollX,
    windowY: window.scrollY
  };
}

export function setScrollTopImmediately(element: HTMLElement, scrollTop: number): void {
  const previousScrollBehavior = element.style.scrollBehavior;
  element.style.scrollBehavior = 'auto';
  element.scrollTop = scrollTop;
  if (previousScrollBehavior) {
    element.style.scrollBehavior = previousScrollBehavior;
    return;
  }
  element.style.removeProperty('scroll-behavior');
}

function restoreOptionsScroll(root: HTMLElement, snapshot: OptionsScrollSnapshot): void {
  const main =
    snapshot.main?.isConnected === true ? snapshot.main : root.querySelector<HTMLElement>('.main');
  if (main) {
    setScrollTopImmediately(main, snapshot.mainTop);
  }
  if (window.scrollX !== snapshot.windowX || window.scrollY !== snapshot.windowY) {
    window.scrollTo(snapshot.windowX, snapshot.windowY);
  }
}

export function restoreOptionsScrollSoon(root: HTMLElement, snapshot: OptionsScrollSnapshot): void {
  restoreOptionsScroll(root, snapshot);
  queueMicrotask(() => restoreOptionsScroll(root, snapshot));
  window.requestAnimationFrame?.(() => restoreOptionsScroll(root, snapshot));
  window.setTimeout(() => restoreOptionsScroll(root, snapshot), 0);
}

export function shouldPreserveButtonActionScroll(actionId: string): boolean {
  return !actionId.startsWith('navigation:');
}

function shouldIgnoreButtonScrollGuard(button: Element): boolean {
  if (button.closest('[data-nav-panel]')) {
    return true;
  }
  const actionId = button.closest<HTMLElement>('[data-action-id]')?.dataset.actionId ?? '';
  return actionId.startsWith('navigation:');
}

export function installButtonPressScrollGuard(root: HTMLElement): ButtonPressScrollGuard {
  let lastScroll: OptionsScrollSnapshot | null = null;
  let clearTimer: number | null = null;

  const clearLater = (): void => {
    if (clearTimer !== null) {
      window.clearTimeout(clearTimer);
    }
    clearTimer = window.setTimeout(() => {
      lastScroll = null;
      clearTimer = null;
    }, 250);
  };

  const remember = (event: Event): void => {
    const target = event.target;
    const button = target instanceof Element ? target.closest('button') : null;
    if (!button) {
      return;
    }
    if (shouldIgnoreButtonScrollGuard(button)) {
      lastScroll = null;
      return;
    }
    lastScroll = captureOptionsScroll(root);
    clearLater();
    if (event.cancelable) {
      event.preventDefault();
    }
  };

  const restoreSoon = (event: Event): void => {
    const target = event?.target;
    const button = target instanceof Element ? target.closest('button') : null;
    if (button && shouldIgnoreButtonScrollGuard(button)) {
      lastScroll = null;
      return;
    }
    if (!lastScroll) {
      return;
    }
    restoreOptionsScrollSoon(root, lastScroll);
  };

  root.addEventListener('pointerdown', remember, true);
  root.addEventListener('mousedown', remember, true);
  root.addEventListener('click', restoreSoon, true);

  return {
    cleanup() {
      if (clearTimer !== null) {
        window.clearTimeout(clearTimer);
      }
      root.removeEventListener('pointerdown', remember, true);
      root.removeEventListener('mousedown', remember, true);
      root.removeEventListener('click', restoreSoon, true);
    },
    getSnapshot() {
      return lastScroll;
    }
  };
}
