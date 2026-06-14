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
});
