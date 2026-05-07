import type { VideoCaptureScreenshot } from './types';

function formatTimeSlug(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds >= 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return `${minutes}m${seconds.toString().padStart(2, '0')}s`;
}

export function captureVideoFrameScreenshot(
  video: HTMLVideoElement,
  timeSec: number,
  now = Date.now()
): VideoCaptureScreenshot | null {
  const width = Math.floor(video.videoWidth || video.clientWidth || 0);
  const height = Math.floor(video.videoHeight || video.clientHeight || 0);
  if (width <= 0 || height <= 0) {
    return null;
  }

  try {
    const canvas = video.ownerDocument.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl.startsWith('data:image/png;base64,')) {
      return null;
    }
    const id = `screenshot-${now}-${Math.random().toString(16).slice(2)}`;
    return {
      id,
      fileName: `video-${formatTimeSlug(timeSec)}-screenshot.png`,
      mimeType: 'image/png',
      dataUrl,
      capturedAt: now
    };
  } catch (error) {
    console.warn('[VideoSession] Failed to capture video frame screenshot:', error);
    return null;
  }
}
