import type { MessagingService } from '../../platform/interfaces/messaging';
import {
  createCaptureVisibleTabScreenshotMessage,
  type CaptureVisibleTabScreenshotResponse
} from '../../shared/types/videoScreenshotMessages';
import {
  createVideoFrameScreenshotFromBlob,
  createVideoFrameScreenshotFromDataUrl
} from './videoFrameScreenshot';
import type { VideoCaptureScreenshot } from './types';
import {
  encodeCanvasToBudgetedBlob,
  encodeCanvasToBudgetedDataUrl
} from './videoScreenshotEncoding';

export type VideoVisibleFrameScreenshotCapture = (
  video: HTMLVideoElement,
  timeSec: number,
  now?: number
) => Promise<VideoCaptureScreenshot | null>;

export function createVisibleTabVideoFrameScreenshotCapture(args: {
  messaging: Pick<MessagingService, 'send'>;
}): VideoVisibleFrameScreenshotCapture {
  return async (video, _timeSec, now = Date.now()) => {
    const dataUrl = await requestVisibleTabScreenshot(args.messaging);
    if (!dataUrl) {
      return null;
    }
    const blob = await cropVisibleTabScreenshotToVideoBlob(dataUrl, video);
    return createVideoFrameScreenshotFromBlob(blob, now);
  };
}

export function createVisibleTabVideoFrameScreenshotDataUrlCapture(args: {
  messaging: Pick<MessagingService, 'send'>;
}): VideoVisibleFrameScreenshotCapture {
  return async (video, _timeSec, now = Date.now()) => {
    const dataUrl = await requestVisibleTabScreenshot(args.messaging);
    if (!dataUrl) {
      return null;
    }
    const croppedDataUrl = await cropVisibleTabScreenshotToVideoDataUrl(dataUrl, video);
    return createVideoFrameScreenshotFromDataUrl(croppedDataUrl, now);
  };
}

async function requestVisibleTabScreenshot(
  messaging: Pick<MessagingService, 'send'>
): Promise<string | null> {
  try {
    const response = await messaging.send<CaptureVisibleTabScreenshotResponse>(
      createCaptureVisibleTabScreenshotMessage()
    );
    return response?.success ? response.dataUrl : null;
  } catch (error) {
    console.warn('[VideoSession] Failed to request visible tab screenshot:', error);
    return null;
  }
}

async function cropVisibleTabScreenshotToVideoBlob(
  dataUrl: string,
  video: HTMLVideoElement
): Promise<Blob | null> {
  const canvas = await cropVisibleTabScreenshotToVideoCanvas(dataUrl, video);
  return canvas ? await encodeCanvasToBudgetedBlob(canvas) : null;
}

async function cropVisibleTabScreenshotToVideoDataUrl(
  dataUrl: string,
  video: HTMLVideoElement
): Promise<string | null> {
  const canvas = await cropVisibleTabScreenshotToVideoCanvas(dataUrl, video);
  return canvas ? encodeCanvasToBudgetedDataUrl(canvas) : null;
}

async function cropVisibleTabScreenshotToVideoCanvas(
  dataUrl: string,
  video: HTMLVideoElement
): Promise<HTMLCanvasElement | null> {
  const doc = video.ownerDocument;
  if (!doc.defaultView || !dataUrl.startsWith('data:image/')) {
    return null;
  }

  const image = await loadImage(doc, dataUrl);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (imageWidth <= 0 || imageHeight <= 0) {
    return null;
  }

  const crop = resolveVideoCropRect(video, imageWidth, imageHeight);
  if (!crop) {
    return null;
  }

  const canvas = doc.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.drawImage(
    image,
    crop.sourceX,
    crop.sourceY,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );
  return canvas;
}

function loadImage(doc: Document, dataUrl: string): Promise<HTMLImageElement> {
  const ImageCtor = doc.defaultView?.Image;
  const image = ImageCtor ? new ImageCtor() : doc.createElement('img');
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };
    image.onload = () => done(() => resolve(image));
    image.onerror = () => done(() => reject(new Error('Visible tab screenshot image failed.')));
    image.src = dataUrl;
    if (typeof image.decode === 'function') {
      void image
        .decode()
        .then(() => done(() => resolve(image)))
        .catch(() => undefined);
    }
  });
}

function resolveVideoCropRect(
  video: HTMLVideoElement,
  imageWidth: number,
  imageHeight: number
): { sourceX: number; sourceY: number; width: number; height: number } | null {
  const view = video.ownerDocument.defaultView;
  if (!view) {
    return null;
  }
  const viewportWidth = Math.max(
    1,
    view.innerWidth || video.ownerDocument.documentElement.clientWidth
  );
  const viewportHeight = Math.max(
    1,
    view.innerHeight || video.ownerDocument.documentElement.clientHeight
  );
  const rect = video.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(viewportWidth, rect.right);
  const bottom = Math.min(viewportHeight, rect.bottom);
  if (right - left < 2 || bottom - top < 2) {
    return null;
  }

  const scaleX = imageWidth / viewportWidth;
  const scaleY = imageHeight / viewportHeight;
  const sourceX = clamp(Math.floor(left * scaleX), 0, Math.max(0, imageWidth - 1));
  const sourceY = clamp(Math.floor(top * scaleY), 0, Math.max(0, imageHeight - 1));
  const width = clamp(Math.ceil((right - left) * scaleX), 1, imageWidth - sourceX);
  const height = clamp(Math.ceil((bottom - top) * scaleY), 1, imageHeight - sourceY);
  return { sourceX, sourceY, width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
