/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  clearRequestedTimestampScreenshot,
  hasRequestedTimestampScreenshot,
  setRequestedTimestampScreenshot
} from '@content/video/screenshotIntent';
import { VIDEO_SCREENSHOT_CACHE_MAX_CONTENT_BYTES } from '@content/video/videoScreenshotCacheTypes';
import {
  captureVideoFrameScreenshot,
  captureVideoFrameScreenshotAsync,
  captureVideoFrameScreenshotDataUrl
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

function createBlobContent(text: string) {
  const blob = new Blob([text], { type: 'image/jpeg' });
  return {
    kind: 'blob' as const,
    blob,
    byteLength: blob.size
  };
}

interface CaptureCanvasHarness {
  video: HTMLVideoElement;
  canvases: Array<{
    canvas: HTMLCanvasElement;
    drawImage: ReturnType<typeof vi.fn>;
    toBlob: ReturnType<typeof vi.fn>;
    toDataURL: ReturnType<typeof vi.fn>;
  }>;
  blobAttempts: Array<{
    width: number;
    height: number;
    quality: number | undefined;
    type: string | undefined;
    callIndex: number;
  }>;
  dataUrlAttempts: Array<{
    width: number;
    height: number;
    quality: number | undefined;
    type: string | undefined;
    callIndex: number;
  }>;
  restore(): void;
}

function createSizedJpegBlob(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
}

function createCaptureCanvasHarness(options?: {
  videoWidth?: number;
  videoHeight?: number;
  toBlob?:
    | ((attempt: {
        width: number;
        height: number;
        quality: number | undefined;
        type: string | undefined;
        callIndex: number;
      }) => Blob | null)
    | undefined;
  toDataURL?:
    | ((attempt: {
        width: number;
        height: number;
        quality: number | undefined;
        type: string | undefined;
        callIndex: number;
      }) => string)
    | undefined;
}): CaptureCanvasHarness {
  const video = document.createElement('video');
  const originalCreateElement = Document.prototype.createElement.bind(document);
  const canvases: CaptureCanvasHarness['canvases'] = [];
  const blobAttempts: CaptureCanvasHarness['blobAttempts'] = [];
  const dataUrlAttempts: CaptureCanvasHarness['dataUrlAttempts'] = [];
  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    if (tagName.toLowerCase() === 'canvas') {
      const canvas = originalCreateElement('canvas') as HTMLCanvasElement;
      const drawImage = vi.fn();
      const toBlob = vi.fn((callback: BlobCallback, type?: string, quality?: number) => {
        const attempt = {
          width: canvas.width,
          height: canvas.height,
          quality,
          type,
          callIndex: blobAttempts.length
        };
        blobAttempts.push(attempt);
        const blob =
          options && 'toBlob' in options
            ? (options.toBlob?.(attempt) ?? null)
            : new Blob(['frame'], { type: 'image/jpeg' });
        callback(blob);
      });
      const toDataURL = vi.fn((type?: string, quality?: number) => {
        const attempt = {
          width: canvas.width,
          height: canvas.height,
          quality,
          type,
          callIndex: dataUrlAttempts.length
        };
        dataUrlAttempts.push(attempt);
        return options?.toDataURL?.(attempt) ?? 'data:image/jpeg;base64,ZnJhbWU=';
      });
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
      canvases.push({ canvas, drawImage, toBlob, toDataURL });
      return canvas;
    }
    return originalCreateElement(tagName);
  });
  Object.defineProperty(video, 'videoWidth', {
    value: options?.videoWidth ?? 640,
    configurable: true
  });
  Object.defineProperty(video, 'videoHeight', {
    value: options?.videoHeight ?? 360,
    configurable: true
  });
  return {
    video,
    canvases,
    blobAttempts,
    dataUrlAttempts,
    restore() {
      createElementSpy.mockRestore();
    }
  };
}

describe('captureVideoFrameScreenshot', () => {
  it('uses the legacy test-only data URL fallback for synchronous capture', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));
    const harness = createCaptureCanvasHarness();

    const screenshot = captureVideoFrameScreenshot(harness.video, 42, Date.now());

    expect(harness.canvases[0]?.drawImage).toHaveBeenCalledWith(harness.video, 0, 0, 640, 360);
    expect(screenshot).toMatchObject({
      mimeType: 'image/jpeg',
      content: {
        kind: 'blob',
        byteLength: 5
      }
    });
    expect(harness.dataUrlAttempts).toEqual([
      {
        width: 640,
        height: 360,
        quality: 0.78,
        type: 'image/jpeg',
        callIndex: 0
      }
    ]);
    const syncContent = screenshot?.content;
    if (!syncContent) {
      throw new Error('expected legacy fallback screenshot content');
    }
    expect(syncContent.blob).toBeInstanceOf(Blob);
    expect(syncContent.blob.size).toBe(5);
    expect(screenshot?.fileName).toMatch(/^file-\d{17}\.jpg$/);

    harness.restore();
    vi.useRealTimers();
  });

  it('captures a jpeg screenshot asynchronously with toBlob when available', async () => {
    const harness = createCaptureCanvasHarness({
      toBlob: () => new Blob(['frame'], { type: 'image/jpeg' })
    });

    const screenshot = await captureVideoFrameScreenshotAsync(harness.video, 42, 1);

    expect(harness.canvases[0]?.drawImage).toHaveBeenCalledWith(harness.video, 0, 0, 640, 360);
    expect(harness.blobAttempts).toEqual([
      {
        width: 640,
        height: 360,
        quality: 0.78,
        type: 'image/jpeg',
        callIndex: 0
      }
    ]);
    expect(harness.dataUrlAttempts).toEqual([]);
    expect(screenshot).toMatchObject({
      mimeType: 'image/jpeg',
      capturedAt: 1,
      content: {
        kind: 'blob',
        byteLength: 5
      }
    });
    const asyncContent = screenshot?.content;
    if (!asyncContent) {
      throw new Error('expected async blob screenshot content');
    }
    expect(asyncContent.blob).toBeInstanceOf(Blob);
    expect(asyncContent.blob.size).toBe(5);

    harness.restore();
  });

  it('downscales 4k captures to the initial 1280px max edge before encoding', async () => {
    const harness = createCaptureCanvasHarness({
      videoWidth: 3840,
      videoHeight: 2160,
      toBlob: () => createSizedJpegBlob(640_000)
    });

    const screenshot = await captureVideoFrameScreenshotAsync(harness.video, 42, 1);

    expect(harness.canvases).toHaveLength(2);
    expect(harness.canvases[0]?.drawImage).toHaveBeenCalledWith(harness.video, 0, 0, 3840, 2160);
    expect(harness.canvases[1]?.drawImage).toHaveBeenCalledWith(
      harness.canvases[0]?.canvas,
      0,
      0,
      3840,
      2160,
      0,
      0,
      1280,
      720
    );
    expect(harness.blobAttempts).toEqual([
      {
        width: 1280,
        height: 720,
        quality: 0.78,
        type: 'image/jpeg',
        callIndex: 0
      }
    ]);
    expect(screenshot?.content).toMatchObject({
      kind: 'blob',
      byteLength: 640_000
    });

    harness.restore();
  });

  it('does not upscale 720p captures before encoding', async () => {
    const harness = createCaptureCanvasHarness({
      videoWidth: 1280,
      videoHeight: 720,
      toBlob: () => createSizedJpegBlob(320_000)
    });

    const screenshot = await captureVideoFrameScreenshotAsync(harness.video, 42, 1);

    expect(harness.canvases).toHaveLength(1);
    expect(harness.blobAttempts).toEqual([
      {
        width: 1280,
        height: 720,
        quality: 0.78,
        type: 'image/jpeg',
        callIndex: 0
      }
    ]);
    expect(screenshot?.content).toMatchObject({
      kind: 'blob',
      byteLength: 320_000
    });

    harness.restore();
  });

  it('retries lower jpeg qualities when the first encoded blob exceeds the byte budget', async () => {
    const harness = createCaptureCanvasHarness({
      videoWidth: 1280,
      videoHeight: 720,
      toBlob: ({ callIndex }) =>
        createSizedJpegBlob(
          callIndex === 0 ? VIDEO_SCREENSHOT_CACHE_MAX_CONTENT_BYTES + 1 : 900_000
        )
    });

    const screenshot = await captureVideoFrameScreenshotAsync(harness.video, 42, 1);

    expect(harness.blobAttempts).toEqual([
      {
        width: 1280,
        height: 720,
        quality: 0.78,
        type: 'image/jpeg',
        callIndex: 0
      },
      {
        width: 1280,
        height: 720,
        quality: 0.7,
        type: 'image/jpeg',
        callIndex: 1
      }
    ]);
    expect(screenshot?.content).toMatchObject({
      kind: 'blob',
      byteLength: 900_000
    });

    harness.restore();
  });

  it('returns null when toBlob returns a null blob', async () => {
    const harness = createCaptureCanvasHarness({
      toBlob: () => null
    });

    await expect(captureVideoFrameScreenshotAsync(harness.video, 42, 1)).resolves.toBeNull();
    expect(harness.blobAttempts).toHaveLength(1);
    expect(harness.dataUrlAttempts).toEqual([]);

    harness.restore();
  });

  it('returns null when toBlob is unavailable on the async path', async () => {
    const harness = createCaptureCanvasHarness({
      toBlob: undefined
    });

    await expect(captureVideoFrameScreenshotAsync(harness.video, 42, 1)).resolves.toBeNull();
    expect(harness.blobAttempts).toEqual([]);
    expect(harness.dataUrlAttempts).toEqual([]);

    harness.restore();
  });

  it('captures a Firefox-safe dataUrl screenshot without blob content', () => {
    const harness = createCaptureCanvasHarness({
      toDataURL: () => 'data:image/jpeg;base64,ZmlyZWZveC1mcmFtZQ=='
    });

    const screenshot = captureVideoFrameScreenshotDataUrl(harness.video, 42, 1);

    expect(harness.canvases[0]?.drawImage).toHaveBeenCalledWith(harness.video, 0, 0, 640, 360);
    expect(harness.blobAttempts).toEqual([]);
    expect(harness.dataUrlAttempts).toEqual([
      {
        width: 640,
        height: 360,
        quality: 0.78,
        type: 'image/jpeg',
        callIndex: 0
      }
    ]);
    expect(screenshot?.id).toMatch(/^screenshot-/u);
    expect(screenshot?.fileName).toMatch(/^file-\d{17}\.jpg$/u);
    expect(screenshot?.mimeType).toBe('image/jpeg');
    expect(screenshot?.capturedAt).toBe(1);
    expect(screenshot?.dataUrl).toBe('data:image/jpeg;base64,ZmlyZWZveC1mcmFtZQ==');
    expect(screenshot).not.toHaveProperty('content');

    harness.restore();
  });

  it('returns null when the video does not expose a usable frame', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'videoWidth', { value: 0, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 0, configurable: true });

    expect(captureVideoFrameScreenshot(video, 42)).toBeNull();
  });

  it('tracks screenshot export intent separately from transient screenshot bytes', () => {
    const capture = createTimestampCapture();

    expect(hasRequestedTimestampScreenshot(capture)).toBe(false);

    setRequestedTimestampScreenshot(capture, {
      id: 'shot-1',
      fileName: 'file-42.jpg',
      mimeType: 'image/jpeg',
      capturedAt: 1,
      content: createBlobContent('frame')
    } as unknown as NonNullable<VideoTimestampCapture['screenshot']>);

    expect(hasRequestedTimestampScreenshot(capture)).toBe(true);
    expect(capture.screenshot).toMatchObject({ id: 'shot-1' });

    clearRequestedTimestampScreenshot(capture);

    expect(hasRequestedTimestampScreenshot(capture)).toBe(false);
    expect(capture).not.toHaveProperty('screenshotRequested');
    expect(capture.screenshot).toMatchObject({ id: 'shot-1' });
  });
});
