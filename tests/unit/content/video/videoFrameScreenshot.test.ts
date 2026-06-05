/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  restoreRequestedTimestampScreenshots,
  type RestoreRequestedTimestampScreenshotsArgs
} from '@content/video/screenshotIntent';
import type { VideoTimestampCapture } from '@content/video/types';

function createTimestampCapture(
  id: string,
  timeSec: number
): VideoTimestampCapture & { screenshotRequested: boolean } {
  return {
    kind: 'timestamp',
    id,
    timeSec,
    url: `https://video.example/watch?t=${timeSec}`,
    comment: '',
    createdAt: timeSec,
    screenshotRequested: true
  };
}

function createVideoHarness(options: {
  currentTime?: number;
  paused?: boolean;
  readyState?: number;
  videoWidth?: number;
  videoHeight?: number;
} = {}) {
  const video = document.createElement('video');
  let currentTime = options.currentTime ?? 0;
  let paused = options.paused ?? false;
  let readyState = options.readyState ?? 4;
  let videoWidth = options.videoWidth ?? 640;
  let videoHeight = options.videoHeight ?? 360;
  const currentTimeSetSpy = vi.fn((value: number) => {
    currentTime = value;
    video.dispatchEvent(new Event('seeked'));
  });

  Object.defineProperty(video, 'currentTime', {
    get: () => currentTime,
    set: currentTimeSetSpy,
    configurable: true
  });
  Object.defineProperty(video, 'paused', {
    get: () => paused,
    configurable: true
  });
  Object.defineProperty(video, 'readyState', {
    get: () => readyState,
    configurable: true
  });
  Object.defineProperty(video, 'videoWidth', {
    get: () => videoWidth,
    configurable: true
  });
  Object.defineProperty(video, 'videoHeight', {
    get: () => videoHeight,
    configurable: true
  });

  const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {
    paused = true;
  });
  const playSpy = vi.spyOn(video, 'play').mockImplementation(() => {
    paused = false;
    return Promise.resolve();
  });

  return {
    video,
    pauseSpy,
    playSpy,
    currentTimeSetSpy,
    getCurrentTime: () => currentTime,
    setReadyState: (value: number) => {
      readyState = value;
    },
    setDimensions: (width: number, height: number) => {
      videoWidth = width;
      videoHeight = height;
    }
  };
}

describe('screenshotIntent', () => {
  it('recaptures requested screenshots sequentially and restores playback position/state', async () => {
    const harness = createVideoHarness({ currentTime: 8, paused: false });
    const captureFrame = vi
      .fn<NonNullable<RestoreRequestedTimestampScreenshotsArgs['captureFrame']>>()
      .mockImplementation((_video, timeSec) => ({
        id: `shot-${timeSec}`,
        fileName: `file-${timeSec}.jpg`,
        mimeType: 'image/jpeg',
        dataUrl: `data:image/jpeg;base64,frame-${timeSec}`,
        capturedAt: timeSec
      }));
    const captures = [createTimestampCapture('ts-1', 42), createTimestampCapture('ts-2', 50)];

    await restoreRequestedTimestampScreenshots({
      captures,
      video: harness.video,
      captureFrame,
      timeoutMs: 25
    });

    expect(captureFrame.mock.calls.map(([, timeSec]) => timeSec)).toEqual([42, 50]);
    expect(harness.currentTimeSetSpy.mock.calls.map(([value]) => value)).toEqual([42, 50, 8]);
    expect(harness.pauseSpy).toHaveBeenCalledTimes(1);
    expect(harness.playSpy).toHaveBeenCalledTimes(1);
    expect(harness.getCurrentTime()).toBe(8);
    expect(captures).toEqual([
      expect.objectContaining({
        id: 'ts-1',
        screenshotRequested: true,
        screenshot: expect.objectContaining({ id: 'shot-42' })
      }),
      expect.objectContaining({
        id: 'ts-2',
        screenshotRequested: true,
        screenshot: expect.objectContaining({ id: 'shot-50' })
      })
    ]);
  });

  it('keeps screenshot intent when recapture fails and preserves paused playback state', async () => {
    const harness = createVideoHarness({ currentTime: 12, paused: true });
    const captureFrame = vi
      .fn<NonNullable<RestoreRequestedTimestampScreenshotsArgs['captureFrame']>>()
      .mockReturnValue(null);
    const capture = createTimestampCapture('ts-1', 42);

    await restoreRequestedTimestampScreenshots({
      captures: [capture],
      video: harness.video,
      captureFrame,
      timeoutMs: 25
    });

    expect(captureFrame).toHaveBeenCalledWith(harness.video, 42);
    expect(capture).toMatchObject({
      id: 'ts-1',
      screenshotRequested: true
    });
    expect(capture).not.toHaveProperty('screenshot');
    expect(harness.pauseSpy).not.toHaveBeenCalled();
    expect(harness.playSpy).not.toHaveBeenCalled();
    expect(harness.getCurrentTime()).toBe(12);
  });
});
