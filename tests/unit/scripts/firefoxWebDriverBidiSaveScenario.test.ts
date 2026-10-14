import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeadline } from '../../../scripts/utils/firefoxWebDriverBidiSmokeAdapter.mjs';
import { waitForFirefoxSaveScenario } from '../../../scripts/utils/firefoxWebDriverBidiSaveScenario.mjs';

afterEach(() => vi.useRealTimers());

describe('Firefox save scenario polling ownership', () => {
  it('terminates a short-circuiting file probe after the real smoke deadline fences it', async () => {
    vi.useFakeTimers();
    const deadline = createDeadline();
    const probe = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const pending = waitForFirefoxSaveScenario(probe, 'RETRY_COMPLETE', {
      run: deadline.run,
      sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    });
    const rejected = expect(pending).rejects.toThrow(
      'FIREFOX_SAVE_SCENARIO_TIMEOUT:RETRY_COMPLETE'
    );

    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(deadline.fenced).toBe(true);
    const callsAfterDeadline = probe.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(probe).toHaveBeenCalledTimes(callsAfterDeadline);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('finishes a successful probe without leaving poll or deadline timers', async () => {
    vi.useFakeTimers();
    const deadline = createDeadline();
    const probe = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const pending = waitForFirefoxSaveScenario(probe, 'RETRY_COMPLETE', {
      run: deadline.run,
      sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    });
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(probe).toHaveBeenCalledTimes(2);
    expect(deadline.fenced).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
