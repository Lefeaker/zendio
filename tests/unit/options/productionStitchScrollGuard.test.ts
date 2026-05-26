/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  captureOptionsScroll,
  installButtonPressScrollGuard,
  restoreOptionsScrollSoon,
  setScrollTopImmediately,
  shouldPreserveButtonActionScroll
} from '@options/app/productionStitchScrollGuard';

function setWindowScroll(x: number, y: number): void {
  Object.defineProperty(window, 'scrollX', {
    configurable: true,
    value: x
  });
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value: y
  });
}

function createRoot(): { root: HTMLElement; main: HTMLElement; button: HTMLButtonElement } {
  const root = document.createElement('div');
  root.innerHTML = '<main class="main"><button type="button">Run</button></main>';
  document.body.append(root);
  const main = root.querySelector<HTMLElement>('.main');
  const button = root.querySelector<HTMLButtonElement>('button');
  if (!main || !button) {
    throw new Error('Failed to create scroll guard fixture.');
  }
  return { root, main, button };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('productionStitchScrollGuard', () => {
  it('captures the main scroll position and window scroll coordinates', () => {
    const { root, main } = createRoot();
    main.scrollTop = 128;
    setWindowScroll(12, 34);

    expect(captureOptionsScroll(root)).toEqual({
      main,
      mainTop: 128,
      windowX: 12,
      windowY: 34
    });
  });

  it('temporarily disables smooth scroll while assigning scrollTop', () => {
    const element = document.createElement('div');
    element.style.scrollBehavior = 'smooth';

    setScrollTopImmediately(element, 42);

    expect(element.scrollTop).toBe(42);
    expect(element.style.scrollBehavior).toBe('smooth');

    element.style.removeProperty('scroll-behavior');
    setScrollTopImmediately(element, 7);

    expect(element.scrollTop).toBe(7);
    expect(element.style.scrollBehavior).toBe('');
  });

  it('restores immediately and on queued passes', async () => {
    vi.useFakeTimers();
    const { root, main } = createRoot();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    setWindowScroll(0, 0);
    const snapshot = {
      main,
      mainTop: 99,
      windowX: 5,
      windowY: 6
    };

    restoreOptionsScrollSoon(root, snapshot);

    expect(main.scrollTop).toBe(99);
    expect(scrollTo).toHaveBeenCalledWith(5, 6);

    main.scrollTop = 0;
    await Promise.resolve();
    expect(main.scrollTop).toBe(99);

    main.scrollTop = 0;
    frameCallbacks.forEach((callback) => callback(1));
    expect(main.scrollTop).toBe(99);

    main.scrollTop = 0;
    vi.runOnlyPendingTimers();
    expect(main.scrollTop).toBe(99);
  });

  it('excludes navigation actions from button action scroll preservation', () => {
    expect(shouldPreserveButtonActionScroll('navigation:usage')).toBe(false);
    expect(shouldPreserveButtonActionScroll('export:settings')).toBe(true);
  });

  it('captures button pointerdown, prevents default, restores on click, and cleans up', () => {
    vi.useFakeTimers();
    const { root, main, button } = createRoot();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    setWindowScroll(3, 4);
    main.scrollTop = 77;
    const guard = installButtonPressScrollGuard(root);

    const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true });
    button.dispatchEvent(pointerDown);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(guard.getSnapshot()).toMatchObject({
      main,
      mainTop: 77,
      windowX: 3,
      windowY: 4
    });

    main.scrollTop = 0;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(main.scrollTop).toBe(77);
    expect(scrollTo).not.toHaveBeenCalled();

    guard.cleanup();
    main.scrollTop = 5;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(main.scrollTop).toBe(5);
  });
});
