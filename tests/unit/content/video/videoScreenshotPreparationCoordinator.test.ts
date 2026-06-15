/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { VideoScreenshotPreparationCoordinator } from '@content/video/videoScreenshotPreparationCoordinator';
import type { VideoCaptureScreenshot, VideoTimestampCapture } from '@content/video/types';

function createTimestampCapture(
  id: string,
  timeSec: number,
  screenshot: VideoCaptureScreenshot
): VideoTimestampCapture {
  return {
    kind: 'timestamp',
    id,
    timeSec,
    url: `https://video.example/watch?t=${timeSec}`,
    comment: '',
    createdAt: timeSec,
    screenshotRequested: true,
    screenshot
  };
}

function createScreenshot(timeSec: number): VideoCaptureScreenshot {
  const blob = new Blob([`frame-${timeSec}`], { type: 'image/jpeg' });
  return {
    id: `shot-${timeSec}`,
    fileName: `file-${timeSec}.jpg`,
    mimeType: 'image/jpeg',
    capturedAt: timeSec,
    content: {
      kind: 'blob',
      blob,
      byteLength: blob.size
    }
  } as unknown as VideoCaptureScreenshot;
}

function createPendingTimestampCapture(id: string, timeSec: number): VideoTimestampCapture {
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

function createVisibleVideo(currentTime = 42): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperty(video, 'currentTime', {
    get: () => currentTime,
    set: () => undefined,
    configurable: true
  });
  Object.defineProperty(video, 'readyState', {
    value: 4,
    configurable: true
  });
  Object.defineProperty(video, 'videoWidth', {
    value: 640,
    configurable: true
  });
  Object.defineProperty(video, 'videoHeight', {
    value: 360,
    configurable: true
  });
  Object.defineProperty(video, 'currentSrc', {
    value: 'https://cdn.example/video.mp4',
    configurable: true
  });
  Object.defineProperty(video, 'src', {
    value: 'https://cdn.example/video.mp4',
    configurable: true
  });
  return video;
}

async function flushAsyncWork(turns = 8): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

describe('VideoScreenshotPreparationCoordinator', () => {
  it('restores same-session cached screenshots without repeating durable write-through', async () => {
    const screenshot = createScreenshot(42);
    const capture = createTimestampCapture('ts-1', 42, screenshot);
    const onScreenshotPrepared = vi.fn();
    const syncPanel = vi.fn();
    const coordinator = new VideoScreenshotPreparationCoordinator({
      doc: document,
      getCaptures: () => [capture],
      getVisibleVideo: () => null,
      onScreenshotPrepared,
      syncPanel
    });

    coordinator.cacheRequestedScreenshot(capture.id);
    delete capture.screenshot;
    await coordinator.prepareRequestedScreenshot(capture.id);

    expect(capture.screenshot).toBe(screenshot);
    expect(syncPanel).toHaveBeenCalledTimes(1);
    expect(onScreenshotPrepared).not.toHaveBeenCalled();
  });

  it('requires matching resume calls before suspended pending screenshots can prepare', async () => {
    const capture = createPendingTimestampCapture('ts-1', 42);
    const visibleVideo = createVisibleVideo(42);
    document.body.append(visibleVideo);
    const captureVisibleFrame = vi.fn(async () => createScreenshot(42));
    const syncPanel = vi.fn();
    const coordinator = new VideoScreenshotPreparationCoordinator({
      doc: document,
      getCaptures: () => [capture],
      getVisibleVideo: () => visibleVideo,
      captureVisibleFrame,
      syncPanel
    });

    coordinator.suspendPendingRequests();
    coordinator.suspendPendingRequests();
    coordinator.handleVideoElementChange(visibleVideo);
    coordinator.requestPendingScreenshots();
    await flushAsyncWork();

    expect(captureVisibleFrame).not.toHaveBeenCalled();
    expect(capture.screenshot).toBeUndefined();

    coordinator.resumePendingRequests();
    coordinator.requestPendingScreenshots();
    await flushAsyncWork();

    expect(captureVisibleFrame).not.toHaveBeenCalled();
    expect(capture.screenshot).toBeUndefined();

    coordinator.resumePendingRequests();
    coordinator.requestPendingScreenshots();
    await vi.waitFor(() => {
      expect(captureVisibleFrame).toHaveBeenCalledTimes(1);
    });

    expect(capture.screenshot).toMatchObject({ id: 'shot-42' });
    expect(syncPanel).toHaveBeenCalledTimes(1);
  });
});
