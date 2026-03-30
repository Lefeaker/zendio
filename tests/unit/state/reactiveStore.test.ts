import { describe, it, expect, vi } from 'vitest';
import { ReactiveStore } from '@shared/state/ReactiveStore';

describe('ReactiveStore', () => {
  it('publishes updates to subscribers', () => {
    const store = new ReactiveStore<number>('test');
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set(1);
    store.set(2);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, 1);
    expect(listener).toHaveBeenNthCalledWith(2, 2);

    unsubscribe();
    store.set(3);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('clears value and listeners', () => {
    const store = new ReactiveStore<number>('test');
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(10);
    expect(store.get()).toBe(10);

    store.clear();

    expect(store.get()).toBeUndefined();
    store.set(20);
    expect(listener).not.toHaveBeenCalledWith(20);
  });
});
