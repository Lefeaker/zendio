/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureVideoFrameScreenshotMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/content/video/videoFrameScreenshot', () => ({
  captureVideoFrameScreenshot: captureVideoFrameScreenshotMock
}));

import { createVideoTimestampCapture } from '@content/video/videoTimestampCaptureTransaction';

describe('videoTimestampCaptureTransaction', () => {
  beforeEach(() => {
    captureVideoFrameScreenshotMock.mockReset();
  });

  it('marks screenshot intent and keeps the live screenshot when capture succeeds', () => {
    const video = document.createElement('video');
    const screenshot = {
      id: 'shot-1',
      fileName: 'file-20260314100000000.jpg',
      mimeType: 'image/jpeg' as const,
      dataUrl: 'data:image/jpeg;base64,frame',
      capturedAt: 1
    };
    captureVideoFrameScreenshotMock.mockReturnValue(screenshot);

    const capture = createVideoTimestampCapture({
      video,
      currentTime: 42,
      shareUrl: 'https://video.example/watch?t=42',
      comment: '  captured frame  ',
      captureScreenshot: true
    });

    expect(captureVideoFrameScreenshotMock).toHaveBeenCalledWith(video, 42);
    expect(capture).toMatchObject({
      kind: 'timestamp',
      timeSec: 42,
      comment: 'captured frame',
      url: 'https://video.example/watch?t=42',
      screenshotRequested: true,
      screenshot
    });
  });

  it('keeps screenshot intent even when the live screenshot capture fails', () => {
    const video = document.createElement('video');
    captureVideoFrameScreenshotMock.mockReturnValue(null);

    const capture = createVideoTimestampCapture({
      video,
      currentTime: 42,
      shareUrl: 'https://video.example/watch?t=42',
      captureScreenshot: true
    });

    expect(capture).toMatchObject({
      kind: 'timestamp',
      timeSec: 42,
      screenshotRequested: true
    });
    expect(capture).not.toHaveProperty('screenshot');
  });
});
