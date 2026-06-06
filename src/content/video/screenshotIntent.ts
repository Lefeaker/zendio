import type { VideoTimestampCapture } from './types';

export function hasRequestedTimestampScreenshot(
  capture: Pick<VideoTimestampCapture, 'screenshotRequested' | 'screenshot'>
): boolean {
  return Boolean(capture.screenshotRequested || capture.screenshot);
}

export function setRequestedTimestampScreenshot(
  capture: VideoTimestampCapture,
  screenshot: VideoTimestampCapture['screenshot'] | null
): void {
  capture.screenshotRequested = true;
  if (screenshot) {
    capture.screenshot = screenshot;
    return;
  }
  delete capture.screenshot;
}

export function clearRequestedTimestampScreenshot(capture: VideoTimestampCapture): void {
  delete capture.screenshotRequested;
  delete capture.screenshot;
}
