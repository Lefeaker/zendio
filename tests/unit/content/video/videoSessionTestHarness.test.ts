/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForMockCalls } from './videoSessionTestHarness';

describe('video session asynchronous checkpoints', () => {
  afterEach(() => vi.useRealTimers());

  it('waits for the requested call count across delayed work', async () => {
    vi.useFakeTimers();
    const checkpoint = vi.fn();
    setTimeout(checkpoint, 25);
    setTimeout(checkpoint, 75);

    await waitForMockCalls(checkpoint, 2);

    expect(checkpoint).toHaveBeenCalledTimes(2);
  });

  it('rejects when a checkpoint never occurs', async () => {
    vi.useFakeTimers();

    await expect(waitForMockCalls(vi.fn())).rejects.toThrow();
  });
});
