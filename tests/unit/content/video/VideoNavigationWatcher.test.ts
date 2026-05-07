/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchVideoNavigation } from '@content/video/videoNavigationWatcher';

describe('watchVideoNavigation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes on YouTube navigation events without interval polling', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const onChange = vi.fn();
    const watcher = watchVideoNavigation(document, onChange);

    document.dispatchEvent(new Event('yt-navigate-finish'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).not.toHaveBeenCalled();
    watcher.stop();
  });

  it('stops navigation listeners', () => {
    const onChange = vi.fn();
    const watcher = watchVideoNavigation(document, onChange);

    watcher.stop();
    document.dispatchEvent(new Event('yt-navigate-finish'));

    expect(onChange).not.toHaveBeenCalled();
  });
});
