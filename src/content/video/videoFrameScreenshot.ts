import type { VideoCaptureScreenshot, VideoCaptureScreenshotContent } from './types';
import {
  encodeCanvasToBudgetedBlob,
  resizeCanvasToMaxEdge,
  SCREENSHOT_MIME_TYPE,
  VIDEO_SCREENSHOT_ENCODING_MAX_EDGE_LADDER,
  VIDEO_SCREENSHOT_ENCODING_QUALITY_LADDER
} from './videoScreenshotEncoding';

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
    // Legacy/test-only fallback. Production screenshot preparation uses the async
    // Blob path below and must not route through data URL conversion.
    return createScreenshotRecord(encodeCanvasToLegacyBlobContent(canvas), now);
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
    return createScreenshotRecord(createBlobContent(await encodeCanvasToBudgetedBlob(canvas)), now);
  } catch (error) {
    console.warn('[VideoSession] Failed to capture video frame screenshot:', error);
    return null;
  }
}

export function createVideoFrameScreenshotFromBlob(
  blob: Blob | null,
  now = Date.now()
): VideoCaptureScreenshot | null {
  return createScreenshotRecord(createBlobContent(blob), now);
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
  const resizedCanvas = resizeCanvasToMaxEdge(canvas, VIDEO_SCREENSHOT_ENCODING_MAX_EDGE_LADDER[0]);
  if (!resizedCanvas) {
    return null;
  }
  const dataUrl = resizedCanvas.toDataURL(
    SCREENSHOT_MIME_TYPE,
    VIDEO_SCREENSHOT_ENCODING_QUALITY_LADDER[0]
  );
  return isJpegDataUrl(dataUrl) ? dataUrl : null;
}

function encodeCanvasToLegacyBlobContent(
  canvas: HTMLCanvasElement
): VideoCaptureScreenshotContent | null {
  return createBlobContentFromDataUrl(encodeCanvasToDataUrl(canvas));
}

function createBlobContent(blob: Blob | null): VideoCaptureScreenshotContent | null {
  if (!blob) {
    return null;
  }

  const normalizedBlob =
    blob.type === SCREENSHOT_MIME_TYPE ? blob : new Blob([blob], { type: SCREENSHOT_MIME_TYPE });
  return {
    kind: 'blob',
    blob: normalizedBlob,
    byteLength: normalizedBlob.size
  };
}

function createBlobContentFromDataUrl(
  dataUrl: string | null
): VideoCaptureScreenshotContent | null {
  if (!isJpegDataUrl(dataUrl) || typeof globalThis.atob !== 'function') {
    return null;
  }

  try {
    const buffer = decodeBase64(dataUrl.slice(SCREENSHOT_DATA_URL_PREFIX.length));
    return createBlobContent(new Blob([buffer], { type: SCREENSHOT_MIME_TYPE }));
  } catch {
    return null;
  }
}

function decodeBase64(base64: string): ArrayBuffer {
  const binary = globalThis.atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

function createScreenshotRecord(
  content: VideoCaptureScreenshotContent | null,
  now: number
): VideoCaptureScreenshot | null {
  if (!content) {
    return null;
  }
  const id = `screenshot-${now}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    fileName: `file-${formatTimestampSlug(now)}.jpg`,
    mimeType: SCREENSHOT_MIME_TYPE,
    content,
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
