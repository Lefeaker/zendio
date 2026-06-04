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

  it('restores playback when a previously playing video is released with restore enabled', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => Promise.resolve());
    const lease = new VideoPlaybackEditLease();

    lease.acquire('capture-1', video);
    lease.release({ restorePlayback: true });

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('does not restore playback when a previously playing video is released without restore', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => Promise.resolve());
    const lease = new VideoPlaybackEditLease();

    lease.acquire('capture-1', video);
    lease.release({ restorePlayback: false });

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('preserves the original playing state when the same capture reacquires after focus rerenders', () => {
    const video = document.createElement('video');
    let paused = false;
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => paused
    });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });
    const lease = new VideoPlaybackEditLease();

    lease.acquire('capture-1', video);
    lease.acquire('capture-1', video);
    lease.releaseForCapture('capture-1', { restorePlayback: true });

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('preserves the original playing state across transient window reset and reacquire', () => {
    const video = document.createElement('video');
    let paused = false;
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => paused
    });
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });
    const lease = new VideoPlaybackEditLease();

    lease.acquire('capture-1', video);
    lease.reset({ preserveTransactions: true });
    lease.acquire('capture-1', video);
    lease.releaseForCapture('capture-1', { restorePlayback: true });

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});
