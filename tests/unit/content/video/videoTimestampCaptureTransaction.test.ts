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

  it('marks screenshot intent without synchronously capturing the frame', () => {
    const video = document.createElement('video');
    captureVideoFrameScreenshotMock.mockReturnValue({
      id: 'shot-1',
      fileName: 'file-20260314100000000.jpg',
      mimeType: 'image/jpeg' as const,
      dataUrl: 'data:image/jpeg;base64,frame',
      capturedAt: 1
    });

    const capture = createVideoTimestampCapture({
      video,
      currentTime: 42,
      shareUrl: 'https://video.example/watch?t=42',
      comment: '  captured frame  ',
      captureScreenshot: true
    });

    expect(captureVideoFrameScreenshotMock).not.toHaveBeenCalled();
    expect(capture).toMatchObject({
      kind: 'timestamp',
      timeSec: 42,
      comment: 'captured frame',
      url: 'https://video.example/watch?t=42',
      screenshotRequested: true
    });
    expect(capture).not.toHaveProperty('screenshot');
  });

  it('does not set screenshot intent when captureScreenshot is omitted', () => {
    const video = document.createElement('video');

    const capture = createVideoTimestampCapture({
      video,
      currentTime: 42,
      shareUrl: 'https://video.example/watch?t=42'
    });

    expect(capture).toMatchObject({
      kind: 'timestamp',
      timeSec: 42
    });
    expect(capture).not.toHaveProperty('screenshotRequested');
    expect(capture).not.toHaveProperty('screenshot');
  });
});
