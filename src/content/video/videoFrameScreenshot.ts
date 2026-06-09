import type { VideoCaptureScreenshot } from './types';

const SCREENSHOT_MIME_TYPE = 'image/jpeg';
const SCREENSHOT_QUALITY = 0.88;
const SCREENSHOT_DATA_URL_PREFIX = `data:${SCREENSHOT_MIME_TYPE};base64,`;

export function captureVideoFrameScreenshot(
  video: HTMLVideoElement,
  timeSec: number,
  now = Date.now()
): VideoCaptureScreenshot | null {
  void timeSec;
  try {
    const canvas = renderVideoFrameToCanvas(video);
    if (!canvas) {
      return null;
    }
    return createScreenshotRecord(encodeCanvasToDataUrl(canvas), now);
  } catch (error) {
    console.warn('[VideoSession] Failed to capture video frame screenshot:', error);
    return null;
  }
}

export async function captureVideoFrameScreenshotAsync(
  video: HTMLVideoElement,
  timeSec: number,
  now = Date.now()
): Promise<VideoCaptureScreenshot | null> {
  void timeSec;
  try {
    const canvas = renderVideoFrameToCanvas(video);
    if (!canvas) {
      return null;
    }
    return createScreenshotRecord(await encodeCanvasToDataUrlAsync(canvas), now);
  } catch (error) {
    console.warn('[VideoSession] Failed to capture video frame screenshot:', error);
    return null;
  }
}

function renderVideoFrameToCanvas(video: HTMLVideoElement): HTMLCanvasElement | null {
  const width = Math.floor(video.videoWidth || video.clientWidth || 0);
  const height = Math.floor(video.videoHeight || video.clientHeight || 0);
  if (width <= 0 || height <= 0) {
    return null;
  }

  const canvas = video.ownerDocument.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.drawImage(video, 0, 0, width, height);
  return canvas;
}

function encodeCanvasToDataUrl(canvas: HTMLCanvasElement): string | null {
  const dataUrl = canvas.toDataURL(SCREENSHOT_MIME_TYPE, SCREENSHOT_QUALITY);
  return isJpegDataUrl(dataUrl) ? dataUrl : null;
}

async function encodeCanvasToDataUrlAsync(canvas: HTMLCanvasElement): Promise<string | null> {
  if (typeof canvas.toBlob !== 'function') {
    return encodeCanvasToDataUrl(canvas);
  }
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, SCREENSHOT_MIME_TYPE, SCREENSHOT_QUALITY);
  });
  if (!blob) {
    return null;
  }
  return readBlobAsDataUrl(blob);
}

async function readBlobAsDataUrl(blob: Blob): Promise<string | null> {
  const dataUrl = await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(typeof reader.result === 'string' ? reader.result : null);
    });
    reader.addEventListener('error', () => resolve(null));
    reader.readAsDataURL(blob);
  });
  return isJpegDataUrl(dataUrl) ? dataUrl : null;
}

function createScreenshotRecord(
  dataUrl: string | null,
  now: number
): VideoCaptureScreenshot | null {
  if (!isJpegDataUrl(dataUrl)) {
    return null;
  }
  const id = `screenshot-${now}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    fileName: `file-${formatTimestampSlug(now)}.jpg`,
    mimeType: SCREENSHOT_MIME_TYPE,
    dataUrl,
    capturedAt: now
  };
}

function isJpegDataUrl(dataUrl: string | null): dataUrl is string {
  return typeof dataUrl === 'string' && dataUrl.startsWith(SCREENSHOT_DATA_URL_PREFIX);
}

function formatTimestampSlug(timestamp: number): string {
  const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${yyyy}${mm}${dd}${hh}${min}${ss}${ms}`;
}
