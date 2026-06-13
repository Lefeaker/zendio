import type { VideoTimestampCapture } from './types';

export function hasRequestedTimestampScreenshot(
  capture: Pick<VideoTimestampCapture, 'screenshotRequested'>
): boolean {
  return capture.screenshotRequested === true;
}

export function setRequestedTimestampScreenshot(
  capture: VideoTimestampCapture,
  screenshot: VideoTimestampCapture['screenshot'] | null
): void {
  capture.screenshotRequested = true;
  if (screenshot) {
    capture.screenshot = screenshot;
  }
}

export function clearRequestedTimestampScreenshot(capture: VideoTimestampCapture): void {
  delete capture.screenshotRequested;
}

export function setTimestampScreenshot(
  capture: VideoTimestampCapture,
  screenshot: NonNullable<VideoTimestampCapture['screenshot']>
): void {
  capture.screenshot = screenshot;
}
