/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { createRootActionDispatcher } from '../../../src/ui/stitch-runtime/render/rootActionDispatcher';

describe('root action dispatcher', () => {
  it('installs one listener per used type and routes to the nearest descriptor', () => {
    const root = document.createElement('div');
    const parent = document.createElement('section');
    const button = document.createElement('button');
    parent.append(button);
    root.append(parent);
    const add = vi.spyOn(root, 'addEventListener');
    const parentHandler = vi.fn();
    const buttonHandler = vi.fn();
    const dispatcher = createRootActionDispatcher(root);

    dispatcher.register(parent, 'click', parentHandler);
    dispatcher.register(button, 'click', buttonHandler);
    dispatcher.register(button, 'click', buttonHandler);
    button.click();

    expect(add.mock.calls.filter(([type]) => type === 'click')).toHaveLength(1);
    expect(buttonHandler).toHaveBeenCalledTimes(1);
    expect(buttonHandler).toHaveBeenCalledWith(expect.any(Event), button);
    expect(parentHandler).not.toHaveBeenCalled();
    expect(dispatcher.listenerCount).toBe(1);
  });

  it('supports the root descriptor and removes listeners once on idempotent disposal', () => {
    const root = document.createElement('div');
    const remove = vi.spyOn(root, 'removeEventListener');
    const handler = vi.fn();
    const dispatcher = createRootActionDispatcher(root);
    dispatcher.register(root, 'click', handler);
    root.click();

    dispatcher.dispose();
    dispatcher.dispose();
    root.click();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls.filter(([type]) => type === 'click')).toHaveLength(1);
    expect(dispatcher.listenerCount).toBe(0);
  });
});
