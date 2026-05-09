import type { VideoCaptureScreenshot } from './types';

export function captureVideoFrameScreenshot(
  video: HTMLVideoElement,
  timeSec: number,
  now = Date.now()
): VideoCaptureScreenshot | null {
  void timeSec;
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    if (!dataUrl.startsWith('data:image/jpeg;base64,')) {
      return null;
    }
    const id = `screenshot-${now}-${Math.random().toString(16).slice(2)}`;
    return {
      id,
      fileName: `file-${formatTimestampSlug(now)}.jpg`,
      mimeType: 'image/jpeg',
      dataUrl,
      capturedAt: now
    };
  } catch (error) {
    console.warn('[VideoSession] Failed to capture video frame screenshot:', error);
    return null;
  }
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
