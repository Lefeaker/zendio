/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReaderSessionLifecycle } from '@content/reader/sessionLifecycle';

describe('ReaderSessionLifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div></div>';
    vi.clearAllMocks();
  });

  const createLifecycle = () => {
    const selectionController = { start: vi.fn(), stop: vi.fn() };
    const panelCoordinator = { mount: vi.fn(), destroy: vi.fn() };
    const environment = {
      start: vi.fn(() => Promise.resolve({ messages: { start: 'ok' } })),
      stop: vi.fn()
    };
    const handlers = { onSelection: vi.fn(), onExternalHighlight: vi.fn(), onKeydown: vi.fn() };
    const lifecycle = new ReaderSessionLifecycle(
      {
        doc: document,
        selectionController,
        panelCoordinator,
        environment,
        externalHighlightEvent: 'external-highlight'
      } as never,
      handlers as never
    );
    return { lifecycle, selectionController, panelCoordinator, environment, handlers };
  };

  it('starts, mounts styles, and forwards events', async () => {
    const { lifecycle, selectionController, panelCoordinator, handlers } = createLifecycle();
    const envState = await lifecycle.start();
    expect(envState.messages).toEqual({ start: 'ok' });
    expect(document.documentElement.dataset.aiobReaderActive).toBe('true');
    expect(selectionController.start).toHaveBeenCalled();
    expect(panelCoordinator.mount).toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handlers.onKeydown).toHaveBeenCalled();
    document.dispatchEvent(new CustomEvent('external-highlight', { detail: { id: '1' } }));
    expect(handlers.onExternalHighlight).toHaveBeenCalledWith({ id: '1' });
  });

  it('cleans up on cancel and when startup fails', async () => {
    const { lifecycle, selectionController, panelCoordinator, environment } = createLifecycle();
    await lifecycle.start();
    lifecycle.cancel();
    expect(selectionController.stop).toHaveBeenCalled();
    expect(environment.stop).toHaveBeenCalled();
    expect(panelCoordinator.destroy).toHaveBeenCalled();
    expect(document.documentElement.dataset.aiobReaderActive).toBeUndefined();

    const failing = createLifecycle();
    failing.environment.start.mockRejectedValueOnce(new Error('boom'));
    await expect(failing.lifecycle.start()).rejects.toThrow('boom');
    expect(failing.selectionController.stop).toHaveBeenCalled();
  });
});
