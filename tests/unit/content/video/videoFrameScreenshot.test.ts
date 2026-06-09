/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  clearRequestedTimestampScreenshot,
  hasRequestedTimestampScreenshot,
  setRequestedTimestampScreenshot
} from '@content/video/screenshotIntent';
import {
  captureVideoFrameScreenshot,
  captureVideoFrameScreenshotAsync
} from '@content/video/videoFrameScreenshot';
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

interface CaptureCanvasHarness {
  video: HTMLVideoElement;
  drawImage: ReturnType<typeof vi.fn>;
  toBlob: ReturnType<typeof vi.fn>;
  toDataURL: ReturnType<typeof vi.fn>;
  restore(): void;
}

function createCaptureCanvasHarness(options?: {
  toBlob?: ((callback: BlobCallback, type?: string, quality?: number) => void) | undefined;
  toDataURL?: (() => string) | undefined;
}): CaptureCanvasHarness {
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  const drawImage = vi.fn();
  const toBlob = vi.fn(
    options?.toBlob ??
      ((callback: BlobCallback) => callback(new Blob(['frame'], { type: 'image/jpeg' })))
  );
  const toDataURL = vi.fn(options?.toDataURL ?? (() => 'data:image/jpeg;base64,frame'));
  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    if (tagName.toLowerCase() === 'canvas') {
      Object.defineProperty(canvas, 'getContext', {
        value: vi.fn(() => ({ drawImage })),
        configurable: true
      });
      Object.defineProperty(canvas, 'toBlob', {
        value: options && 'toBlob' in options && options.toBlob === undefined ? undefined : toBlob,
        configurable: true
      });
      Object.defineProperty(canvas, 'toDataURL', {
        value: toDataURL,
        configurable: true
      });
      return canvas;
    }
    return Document.prototype.createElement.call(document, tagName);
  });
  Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });
  return {
    video,
    drawImage,
    toBlob,
    toDataURL,
    restore() {
      createElementSpy.mockRestore();
    }
  };
}

describe('captureVideoFrameScreenshot', () => {
  it('captures a jpeg screenshot from the current video frame', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const harness = createCaptureCanvasHarness();

    const screenshot = captureVideoFrameScreenshot(harness.video, 42, Date.now());

    expect(harness.drawImage).toHaveBeenCalledWith(harness.video, 0, 0, 640, 360);
    expect(screenshot).toMatchObject({
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,frame'
    });
    expect(screenshot?.fileName).toMatch(/^file-\d{17}\.jpg$/);

    harness.restore();
    vi.useRealTimers();
  });

  it('captures a jpeg screenshot asynchronously with toBlob when available', async () => {
    const harness = createCaptureCanvasHarness({
      toBlob: (callback, type, quality) => {
        expect(type).toBe('image/jpeg');
        expect(quality).toBe(0.88);
        callback(new Blob(['frame'], { type: 'image/jpeg' }));
      }
    });

    const screenshot = await captureVideoFrameScreenshotAsync(harness.video, 42, 1);

    expect(harness.drawImage).toHaveBeenCalledWith(harness.video, 0, 0, 640, 360);
    expect(harness.toBlob).toHaveBeenCalledOnce();
    expect(harness.toDataURL).not.toHaveBeenCalled();
    expect(screenshot).toMatchObject({
      mimeType: 'image/jpeg',
      capturedAt: 1,
      dataUrl: 'data:image/jpeg;base64,ZnJhbWU='
    });

    harness.restore();
  });

  it('returns null when toBlob returns a null blob', async () => {
    const harness = createCaptureCanvasHarness({
      toBlob: (callback) => callback(null)
    });

    await expect(captureVideoFrameScreenshotAsync(harness.video, 42, 1)).resolves.toBeNull();
    expect(harness.toBlob).toHaveBeenCalledOnce();
    expect(harness.toDataURL).not.toHaveBeenCalled();

    harness.restore();
  });

  it('falls back to toDataURL when toBlob is unavailable', async () => {
    const harness = createCaptureCanvasHarness({
      toBlob: undefined
    });

    const screenshot = await captureVideoFrameScreenshotAsync(harness.video, 42, 1);

    expect(harness.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.88);
    expect(screenshot).toMatchObject({
      mimeType: 'image/jpeg',
      capturedAt: 1,
      dataUrl: 'data:image/jpeg;base64,frame'
    });

    harness.restore();
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
