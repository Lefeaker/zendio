import { VIDEO_SCREENSHOT_CACHE_MAX_CONTENT_BYTES } from './videoScreenshotCacheTypes';

export const SCREENSHOT_MIME_TYPE = 'image/jpeg';
export const SCREENSHOT_DATA_URL_PREFIX = `data:${SCREENSHOT_MIME_TYPE};base64,`;
export const VIDEO_SCREENSHOT_ENCODING_MAX_BYTES = VIDEO_SCREENSHOT_CACHE_MAX_CONTENT_BYTES;
export const VIDEO_SCREENSHOT_ENCODING_QUALITY_LADDER = [0.78, 0.7, 0.62] as const;
export const VIDEO_SCREENSHOT_ENCODING_MAX_EDGE_LADDER = [1280, 960, 720] as const;
export const VIDEO_SCREENSHOT_ENCODING_MIN_MAX_EDGE = 480;

export async function encodeCanvasToBudgetedBlob(
  canvas: HTMLCanvasElement,
  options?: {
    maxBytes?: number;
    qualityLadder?: readonly number[];
    maxEdgeLadder?: readonly number[];
  }
): Promise<Blob | null> {
  const maxBytes =
    normalizePositiveInteger(options?.maxBytes) ?? VIDEO_SCREENSHOT_ENCODING_MAX_BYTES;
  const qualityLadder =
    normalizeNumberSequence(options?.qualityLadder) ?? VIDEO_SCREENSHOT_ENCODING_QUALITY_LADDER;
  const maxEdgeLadder =
    normalizeNumberSequence(options?.maxEdgeLadder) ?? VIDEO_SCREENSHOT_ENCODING_MAX_EDGE_LADDER;

  if (qualityLadder.length === 0 || maxEdgeLadder.length === 0) {
    return null;
  }

  for (const maxEdge of maxEdgeLadder) {
    const resizedCanvas = resizeCanvasToMaxEdge(canvas, maxEdge);
    if (!resizedCanvas) {
      return null;
    }
    for (const quality of qualityLadder) {
      const blob = await encodeCanvasToBlob(resizedCanvas, quality);
      if (!blob) {
        return null;
      }
      const normalizedBlob = normalizeBlobMimeType(blob);
      if (normalizedBlob.size <= maxBytes) {
        return normalizedBlob;
      }
    }
  }

  return null;
}

export function encodeCanvasToBudgetedDataUrl(
  canvas: HTMLCanvasElement,
  options?: {
    maxBytes?: number;
    qualityLadder?: readonly number[];
    maxEdgeLadder?: readonly number[];
  }
): string | null {
  const maxBytes =
    normalizePositiveInteger(options?.maxBytes) ?? VIDEO_SCREENSHOT_ENCODING_MAX_BYTES;
  const qualityLadder =
    normalizeNumberSequence(options?.qualityLadder) ?? VIDEO_SCREENSHOT_ENCODING_QUALITY_LADDER;
  const maxEdgeLadder =
    normalizeNumberSequence(options?.maxEdgeLadder) ?? VIDEO_SCREENSHOT_ENCODING_MAX_EDGE_LADDER;

  if (qualityLadder.length === 0 || maxEdgeLadder.length === 0) {
    return null;
  }

  for (const maxEdge of maxEdgeLadder) {
    const resizedCanvas = resizeCanvasToMaxEdge(canvas, maxEdge);
    if (!resizedCanvas) {
      return null;
    }
    for (const quality of qualityLadder) {
      const dataUrl = encodeCanvasToDataUrl(resizedCanvas, quality);
      if (isJpegDataUrl(dataUrl) && getJpegDataUrlByteLength(dataUrl) <= maxBytes) {
        return dataUrl;
      }
    }
  }

  return null;
}

export function resizeCanvasToMaxEdge(
  canvas: HTMLCanvasElement,
  maxEdge: number
): HTMLCanvasElement | null {
  const targetDimensions = resolveResizedCanvasDimensions(canvas, maxEdge);
  if (!targetDimensions) {
    return null;
  }
  if (targetDimensions.width === canvas.width && targetDimensions.height === canvas.height) {
    return canvas;
  }

  const resizedCanvas = canvas.ownerDocument.createElement('canvas');
  resizedCanvas.width = targetDimensions.width;
  resizedCanvas.height = targetDimensions.height;
  const context = resizedCanvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.drawImage(
    canvas,
    0,
    0,
    canvas.width,
    canvas.height,
    0,
    0,
    targetDimensions.width,
    targetDimensions.height
  );
  return resizedCanvas;
}

async function encodeCanvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  if (typeof canvas.toBlob !== 'function') {
    return null;
  }
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, SCREENSHOT_MIME_TYPE, quality);
  });
}

function encodeCanvasToDataUrl(canvas: HTMLCanvasElement, quality: number): string | null {
  if (typeof canvas.toDataURL !== 'function') {
    return null;
  }
  return canvas.toDataURL(SCREENSHOT_MIME_TYPE, quality);
}

function normalizeBlobMimeType(blob: Blob): Blob {
  return blob.type === SCREENSHOT_MIME_TYPE
    ? blob
    : new Blob([blob], { type: SCREENSHOT_MIME_TYPE });
}

export function isJpegDataUrl(dataUrl: string | null): dataUrl is string {
  return typeof dataUrl === 'string' && dataUrl.startsWith(SCREENSHOT_DATA_URL_PREFIX);
}

export function getJpegDataUrlByteLength(dataUrl: string): number {
  const base64 = dataUrl.slice(SCREENSHOT_DATA_URL_PREFIX.length);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function resolveResizedCanvasDimensions(
  canvas: Pick<HTMLCanvasElement, 'width' | 'height'>,
  requestedMaxEdge: number
): { width: number; height: number } | null {
  const width = normalizePositiveInteger(canvas.width);
  const height = normalizePositiveInteger(canvas.height);
  if (width === null || height === null) {
    return null;
  }

  const sourceMaxEdge = Math.max(width, height);
  const normalizedMaxEdge = normalizeTargetMaxEdge(requestedMaxEdge, sourceMaxEdge);
  if (normalizedMaxEdge === null) {
    return null;
  }

  const targetMaxEdge = Math.min(sourceMaxEdge, normalizedMaxEdge);
  if (targetMaxEdge === sourceMaxEdge) {
    return { width, height };
  }

  const scale = targetMaxEdge / sourceMaxEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function normalizeTargetMaxEdge(value: number, sourceMaxEdge: number): number | null {
  const normalizedValue = normalizePositiveInteger(value);
  if (normalizedValue === null) {
    return null;
  }
  if (sourceMaxEdge <= VIDEO_SCREENSHOT_ENCODING_MIN_MAX_EDGE) {
    return normalizedValue;
  }
  return Math.max(VIDEO_SCREENSHOT_ENCODING_MIN_MAX_EDGE, normalizedValue);
}

function normalizePositiveInteger(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function normalizeNumberSequence(values: readonly number[] | undefined): number[] | null {
  if (!Array.isArray(values)) {
    return null;
  }
  const normalizedValues = values
    .map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : null))
    .filter((value): value is number => value !== null);
  return normalizedValues.length > 0 ? normalizedValues : null;
}
