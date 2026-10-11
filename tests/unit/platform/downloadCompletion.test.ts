import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForDownloadCompletion } from '../../../src/platform/downloadCompletion';
import type { DownloadStatus, DownloadsService } from '../../../src/platform/interfaces/downloads';

function rig() {
  let notify = () => {};
  const stop = vi.fn();
  const inspect = vi
    .fn<NonNullable<DownloadsService['inspect']>>()
    .mockResolvedValue({ state: 'in_progress', filename: 'note.md' });
  const cancel = vi.fn<NonNullable<DownloadsService['cancel']>>().mockResolvedValue(undefined);
  const downloads: DownloadsService = {
    download: vi.fn(),
    inspect,
    cancel,
    onChanged: (listener) => {
      notify = listener;
      return stop;
    }
  };
  return { downloads, inspect, cancel, stop, notify: () => notify() };
}

afterEach(() => vi.useRealTimers());

describe('download completion boundary', () => {
  it('observes a change arriving during the initial inspection', async () => {
    const r = rig();
    let release!: (value: DownloadStatus) => void;
    r.inspect
      .mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        })
      )
      .mockResolvedValue({ state: 'complete', filename: '/downloads/note (1).md' });
    const pending = waitForDownloadCompletion(r.downloads, 1);
    r.notify();
    release({ state: 'in_progress', filename: 'note.md' });
    await expect(pending).resolves.toEqual({
      state: 'complete',
      filename: '/downloads/note (1).md'
    });
    expect(r.stop).toHaveBeenCalledTimes(1);
  });

  it('reads completed downloads even if their terminal event preceded the subscription', async () => {
    const r = rig();
    r.inspect.mockResolvedValue({ state: 'complete', filename: 'note.md' });
    await expect(waitForDownloadCompletion(r.downloads, 2)).resolves.toMatchObject({
      state: 'complete'
    });
    expect(r.stop).toHaveBeenCalledTimes(1);
  });

  it('cancels its own unfinished ID at the deadline and keeps the result unknown if cancellation fails', async () => {
    vi.useFakeTimers();
    const r = rig();
    r.cancel.mockRejectedValue(new Error('channel closed'));
    const pending = waitForDownloadCompletion(r.downloads, 7);
    const rejected = expect(pending).rejects.toThrow('result is unknown');
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
    expect(r.cancel).toHaveBeenCalledExactlyOnceWith(7);
    expect(r.stop).toHaveBeenCalledTimes(1);
  });

  it('still ends at the deadline when the browser inspection never responds', async () => {
    vi.useFakeTimers();
    const r = rig();
    r.inspect.mockReturnValue(new Promise(() => {}));
    const pending = waitForDownloadCompletion(r.downloads, 9);
    const rejected = expect(pending).rejects.toThrow('result is unknown');
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
    expect(r.stop).toHaveBeenCalledTimes(1);
  });

  it('accepts completion immediately before the deadline without cancelling it', async () => {
    vi.useFakeTimers();
    const r = rig();
    const pending = waitForDownloadCompletion(r.downloads, 8);
    await vi.advanceTimersByTimeAsync(0);
    r.inspect.mockResolvedValue({ state: 'complete', filename: 'note.md' });
    r.notify();
    await vi.advanceTimersByTimeAsync(120_000);
    await expect(pending).resolves.toMatchObject({ state: 'complete' });
    expect(r.cancel).not.toHaveBeenCalled();
  });

  it.each([undefined, 'interrupted'] as const)(
    'rejects a missing or interrupted download: %s',
    async (state) => {
      const r = rig();
      r.inspect.mockResolvedValue(state ? { state, filename: 'note.md' } : undefined);
      await expect(waitForDownloadCompletion(r.downloads, 3)).rejects.toThrow('interrupted');
      expect(r.stop).toHaveBeenCalledTimes(1);
    }
  );
});
