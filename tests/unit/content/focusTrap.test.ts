/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createFocusTrapMock = vi.hoisted(() => vi.fn());
const trapActivateMock = vi.hoisted(() => vi.fn());
const trapDeactivateMock = vi.hoisted(() => vi.fn());
const trapPauseMock = vi.hoisted(() => vi.fn());
const trapUnpauseMock = vi.hoisted(() => vi.fn());

vi.mock('focus-trap', () => ({
  createFocusTrap: createFocusTrapMock
}));

describe('FocusTrapController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createFocusTrapMock.mockReturnValue({
      activate: trapActivateMock,
      deactivate: trapDeactivateMock,
      pause: trapPauseMock,
      unpause: trapUnpauseMock
    });
    document.body.innerHTML = `
      <div id="container">
        <button id="first">First</button>
        <button id="fallback">Fallback</button>
      </div>
    `;
  });

  it('maps selector-based initial and fallback focus into focus-trap options', async () => {
    const { FocusTrapController } = await import('../../../src/content/shared/focusTrap');
    const container = document.getElementById('container');
    if (!(container instanceof HTMLElement)) {
      throw new Error('Container missing');
    }

    const controller = new FocusTrapController(container, {
      initialFocus: '#first',
      fallbackFocus: '#fallback'
    });
    controller.activate();

    expect(createFocusTrapMock).toHaveBeenCalledTimes(1);
    const [, options] = createFocusTrapMock.mock.calls[0] as [HTMLElement, { initialFocus?: HTMLElement; fallbackFocus?: HTMLElement }];
    expect(options.initialFocus?.id).toBe('first');
    expect(options.fallbackFocus?.id).toBe('fallback');
    expect(controller.isActive()).toBe(true);
  });

  it('supports function and element focus targets and does not recreate active traps', async () => {
    const { FocusTrapController } = await import('../../../src/content/shared/focusTrap');
    const container = document.getElementById('container');
    const first = document.getElementById('first');
    const fallback = document.getElementById('fallback');
    if (!(container instanceof HTMLElement) || !(first instanceof HTMLElement) || !(fallback instanceof HTMLElement)) {
      throw new Error('Focus trap fixtures missing');
    }

    const controller = new FocusTrapController(container, {
      initialFocus: () => first,
      fallbackFocus: fallback
    });
    controller.activate();
    controller.activate();

    expect(createFocusTrapMock).toHaveBeenCalledTimes(1);
    const [, options] = createFocusTrapMock.mock.calls[0] as [HTMLElement, { initialFocus?: HTMLElement; fallbackFocus?: HTMLElement }];
    expect(options.initialFocus).toBe(first);
    expect(options.fallbackFocus).toBe(fallback);
  });

  it('falls back to container, forwards pause and unpause, and deactivates idempotently', async () => {
    const { FocusTrapController } = await import('../../../src/content/shared/focusTrap');
    const container = document.getElementById('container');
    if (!(container instanceof HTMLElement)) {
      throw new Error('Container missing');
    }

    const controller = new FocusTrapController(container);
    controller.pause();
    controller.unpause();
    controller.deactivate();

    expect(trapPauseMock).not.toHaveBeenCalled();
    expect(trapUnpauseMock).not.toHaveBeenCalled();
    expect(trapDeactivateMock).not.toHaveBeenCalled();

    controller.activate();
    const [, options] = createFocusTrapMock.mock.calls[0] as [HTMLElement, { fallbackFocus?: HTMLElement }];
    expect(options.fallbackFocus).toBe(container);

    controller.pause();
    controller.unpause();
    controller.deactivate();
    controller.deactivate();

    expect(trapPauseMock).toHaveBeenCalledTimes(1);
    expect(trapUnpauseMock).toHaveBeenCalledTimes(1);
    expect(trapDeactivateMock).toHaveBeenCalledTimes(1);
    expect(controller.isActive()).toBe(false);
  });
});
