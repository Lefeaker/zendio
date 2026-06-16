/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVisibleTabVideoFrameScreenshotCapture } from '@content/video/videoVisibleTabScreenshot';
import { VIDEO_SCREENSHOT_CACHE_MAX_CONTENT_BYTES } from '@content/video/videoScreenshotCacheTypes';
import {
  createCaptureVisibleTabScreenshotMessage,
  type CaptureVisibleTabScreenshotResponse
} from '@shared/types/videoScreenshotMessages';
import type { MessagingService } from '@platform/interfaces/messaging';
import { asType } from '../../../utils/typeHelpers';

const originalImage = window.Image;
const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

function installImageMock(dimensions: { width: number; height: number }): void {
  class MockImage {
    naturalWidth = dimensions.width;
    naturalHeight = dimensions.height;
    width = dimensions.width;
    height = dimensions.height;
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    private srcValue = '';

    get src(): string {
      return this.srcValue;
    }

    set src(value: string) {
      this.srcValue = value;
    }

    decode(): Promise<void> {
      return Promise.resolve();
    }
  }

  Object.defineProperty(window, 'Image', {
    configurable: true,
    value: MockImage
  });
}

function createCanvasHarness(
  blobText:
    | string
    | ((attempt: {
        width: number;
        height: number;
        quality: number | undefined;
        type: string | undefined;
        callIndex: number;
      }) => Blob | null) = 'cropped'
) {
  const originalCreateElement = document.createElement.bind(document);
  const canvases: Array<{
    canvas: HTMLCanvasElement;
    drawImage: ReturnType<typeof vi.fn>;
    toBlob: ReturnType<typeof vi.fn>;
  }> = [];
  const blobAttempts: Array<{
    width: number;
    height: number;
    quality: number | undefined;
    type: string | undefined;
    callIndex: number;
  }> = [];
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
          typeof blobText === 'string'
            ? new Blob([blobText], { type: 'image/jpeg' })
            : blobText(attempt);
        callback(blob);
      });
      Object.defineProperty(canvas, 'getContext', {
        configurable: true,
        value: vi.fn(() => ({ drawImage }))
      });
      Object.defineProperty(canvas, 'toBlob', {
        configurable: true,
        value: toBlob
      });
      canvases.push({ canvas, drawImage, toBlob });
      return canvas;
    }
    return originalCreateElement(tagName);
  });
  return {
    canvases,
    blobAttempts,
    restore() {
      createElementSpy.mockRestore();
    }
  };
}

describe('createVisibleTabVideoFrameScreenshotCapture', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'Image', {
      configurable: true,
      value: originalImage
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalInnerHeight
    });
    document.body.innerHTML = '';
  });

  it('requests a visible-tab screenshot, crops it to the video bounds, and falls back to smaller max edges when needed', async () => {
    installImageMock({ width: 3840, height: 2160 });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1920
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 1080
    });
    const canvasHarness = createCanvasHarness(({ callIndex }) => {
      if (callIndex < 6) {
        return new Blob([new Uint8Array(VIDEO_SCREENSHOT_CACHE_MAX_CONTENT_BYTES + 1)], {
          type: 'image/jpeg'
        });
      }
      if (callIndex < 8) {
        return new Blob([new Uint8Array(950_000)], { type: 'image/jpeg' });
      }
      return new Blob([new Uint8Array(900_000)], { type: 'image/jpeg' });
    });
    const video = document.createElement('video');
    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1920, 1080));
    const response: CaptureVisibleTabScreenshotResponse = {
      success: true,
      dataUrl: 'data:image/jpeg;base64,frame'
    };
    const messaging = {
      send: vi.fn(() => Promise.resolve(response))
    };
    const capture = createVisibleTabVideoFrameScreenshotCapture({
      messaging: asType<Pick<MessagingService, 'send'>>(messaging)
    });

    const screenshot = await capture(video, 42, 123);

    expect(messaging.send).toHaveBeenCalledWith(createCaptureVisibleTabScreenshotMessage());
    expect(canvasHarness.canvases[0]?.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ naturalWidth: 3840, naturalHeight: 2160 }),
      0,
      0,
      3840,
      2160,
      0,
      0,
      3840,
      2160
    );
    expect(canvasHarness.canvases[1]?.drawImage).toHaveBeenCalledWith(
      canvasHarness.canvases[0]?.canvas,
      0,
      0,
      3840,
      2160,
      0,
      0,
      1280,
      720
    );
    expect(canvasHarness.canvases[2]?.drawImage).toHaveBeenCalledWith(
      canvasHarness.canvases[0]?.canvas,
      0,
      0,
      3840,
      2160,
      0,
      0,
      960,
      540
    );
    expect(canvasHarness.canvases[3]?.drawImage).toHaveBeenCalledWith(
      canvasHarness.canvases[0]?.canvas,
      0,
      0,
      3840,
      2160,
      0,
      0,
      720,
      405
    );
    expect(canvasHarness.blobAttempts).toEqual([
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
      },
      {
        width: 1280,
        height: 720,
        quality: 0.62,
        type: 'image/jpeg',
        callIndex: 2
      },
      {
        width: 960,
        height: 540,
        quality: 0.78,
        type: 'image/jpeg',
        callIndex: 3
      },
      {
        width: 960,
        height: 540,
        quality: 0.7,
        type: 'image/jpeg',
        callIndex: 4
      },
      {
        width: 960,
        height: 540,
        quality: 0.62,
        type: 'image/jpeg',
        callIndex: 5
      },
      {
        width: 720,
        height: 405,
        quality: 0.78,
        type: 'image/jpeg',
        callIndex: 6
      }
    ]);
    expect(screenshot).toMatchObject({
      mimeType: 'image/jpeg',
      capturedAt: 123,
      content: {
        kind: 'blob',
        byteLength: 950_000
      }
    });
    canvasHarness.restore();
  });

  it('returns null when the runtime response does not include a visible-tab image', async () => {
    const response: CaptureVisibleTabScreenshotResponse = {
      success: false,
      error: 'permission denied'
    };
    const messaging = {
      send: vi.fn(() => Promise.resolve(response))
    };
    const capture = createVisibleTabVideoFrameScreenshotCapture({
      messaging: asType<Pick<MessagingService, 'send'>>(messaging)
    });

    await expect(capture(document.createElement('video'), 42, 123)).resolves.toBeNull();
    expect(messaging.send).toHaveBeenCalledWith(createCaptureVisibleTabScreenshotMessage());
  });
});
