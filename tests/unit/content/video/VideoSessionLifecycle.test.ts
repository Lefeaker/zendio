/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoSessionLifecycle } from '@content/video/sessionLifecycle';
import { watchVideoNavigation } from '@content/video/videoNavigationWatcher';

describe('VideoSessionLifecycle', () => {
  let video: HTMLVideoElement;
  const handlers = {
    onUrlChange: vi.fn(),
    onVideoElementChange: vi.fn()
  };

  beforeEach(() => {
    document.body.innerHTML = '<video></video>';
    video = document.querySelector('video') as HTMLVideoElement;
    vi.clearAllMocks();
  });

  it('does not start interval polling', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const lifecycle = new VideoSessionLifecycle(
      { doc: document, locateVideoElement: () => video },
      handlers
    );

    lifecycle.start();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    lifecycle.stop();
  });

  it('notifies when media events change the current video element', () => {
    const lifecycle = new VideoSessionLifecycle(
      { doc: document, locateVideoElement: () => video },
      handlers
    );
    lifecycle.start();
    handlers.onVideoElementChange.mockClear();

    video.dispatchEvent(new Event('durationchange'));

    expect(handlers.onVideoElementChange).toHaveBeenCalledWith(video);
    lifecycle.stop();
  });

  it('refreshes on supported navigation events', () => {
    const lifecycle = new VideoSessionLifecycle(
      { doc: document, locateVideoElement: () => video, watchNavigation: watchVideoNavigation },
      handlers
    );
    lifecycle.start();

    document.dispatchEvent(new Event('yt-navigate-finish'));

    expect(handlers.onUrlChange).toHaveBeenCalled();
    lifecycle.stop();
  });
});
