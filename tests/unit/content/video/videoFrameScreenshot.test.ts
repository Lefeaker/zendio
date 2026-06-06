/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  clearRequestedTimestampScreenshot,
  hasRequestedTimestampScreenshot,
  setRequestedTimestampScreenshot
} from '@content/video/screenshotIntent';
import { captureVideoFrameScreenshot } from '@content/video/videoFrameScreenshot';
import type { VideoTimestampCapture } from '@content/video/types';

function createTimestampCapture(): VideoTimestampCapture {
  return {
    kind: 'timestamp',
    id: 'ts-1',
    timeSec: 42,
    url: 'https://video.example/watch?t=42',
    comment: '',
    createdAt: 1
  };
}

describe('captureVideoFrameScreenshot', () => {
  it('captures a jpeg screenshot from the current video frame', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName.toLowerCase() === 'canvas') {
        Object.defineProperty(canvas, 'getContext', {
          value: vi.fn(() => ({ drawImage })),
          configurable: true
        });
        Object.defineProperty(canvas, 'toDataURL', {
          value: vi.fn(() => 'data:image/jpeg;base64,frame'),
          configurable: true
        });
        return canvas;
      }
      return Document.prototype.createElement.call(document, tagName);
    });
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });

    const screenshot = captureVideoFrameScreenshot(video, 42, Date.now());

    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360);
    expect(screenshot).toMatchObject({
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,frame'
    });
    expect(screenshot?.fileName).toMatch(/^file-\d{17}\.jpg$/);

    createElementSpy.mockRestore();
    vi.useRealTimers();
  });

  it('returns null when the video does not expose a usable frame', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'videoWidth', { value: 0, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 0, configurable: true });

    expect(captureVideoFrameScreenshot(video, 42)).toBeNull();
  });

  it('tracks screenshot intent separately from transient screenshot bytes', () => {
    const capture = createTimestampCapture();

    expect(hasRequestedTimestampScreenshot(capture)).toBe(false);

    setRequestedTimestampScreenshot(capture, {
      id: 'shot-1',
      fileName: 'file-42.jpg',
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,frame',
      capturedAt: 1
    });

    expect(hasRequestedTimestampScreenshot(capture)).toBe(true);
    expect(capture.screenshot).toMatchObject({ id: 'shot-1' });

    clearRequestedTimestampScreenshot(capture);

    expect(hasRequestedTimestampScreenshot(capture)).toBe(false);
    expect(capture).not.toHaveProperty('screenshotRequested');
    expect(capture).not.toHaveProperty('screenshot');
  });
});
