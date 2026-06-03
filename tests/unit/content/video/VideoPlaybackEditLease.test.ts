/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { VideoPlaybackEditLease } from '@content/video/videoPlaybackEditLease';

describe('VideoPlaybackEditLease', () => {
  it('does not restore playback for a video that was already paused before editing', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => Promise.resolve());
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const lease = new VideoPlaybackEditLease();

    lease.acquire('capture-1', video);
    lease.release({ restorePlayback: true });

    expect(pauseSpy).not.toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();
  });
});
