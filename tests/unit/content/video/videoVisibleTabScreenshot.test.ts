/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVisibleTabVideoFrameScreenshotCapture } from '@content/video/videoVisibleTabScreenshot';
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

function createCanvasHarness(blobText = 'cropped') {
  const blob = new Blob([blobText], { type: 'image/jpeg' });
  const canvas = document.createElement('canvas');
  const drawImage = vi.fn();
  const toBlob = vi.fn((callback: BlobCallback, _type?: string, _quality?: number) => {
    callback(blob);
  });
  const originalCreateElement = document.createElement.bind(document);
  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    if (tagName.toLowerCase() === 'canvas') {
      Object.defineProperty(canvas, 'getContext', {
        configurable: true,
        value: vi.fn(() => ({ drawImage }))
      });
      Object.defineProperty(canvas, 'toBlob', {
        configurable: true,
        value: toBlob
      });
      return canvas;
    }
    return originalCreateElement(tagName);
  });
  return {
    drawImage,
    toBlob,
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

  it('requests a visible-tab screenshot and crops it to the current video bounds', async () => {
    installImageMock({ width: 400, height: 200 });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 200
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 100
    });
    const canvasHarness = createCanvasHarness();
    const video = document.createElement('video');
    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 100, 50));
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
    expect(canvasHarness.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ naturalWidth: 400, naturalHeight: 200 }),
      20,
      40,
      200,
      100,
      0,
      0,
      200,
      100
    );
    expect(canvasHarness.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.88);
    expect(screenshot).toMatchObject({
      mimeType: 'image/jpeg',
      capturedAt: 123,
      content: {
        kind: 'blob',
        byteLength: 7
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
