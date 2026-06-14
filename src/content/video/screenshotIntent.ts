import type { VideoTimestampCapture } from './types';
import type { VideoScreenshotCacheRef } from './videoScreenshotCacheTypes';

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

export function setTimestampScreenshotRef(
  capture: VideoTimestampCapture,
  ref: VideoScreenshotCacheRef
): void {
  capture.screenshotRef = ref;
}

export function clearTimestampScreenshotRef(capture: VideoTimestampCapture): void {
  delete capture.screenshotRef;
}

export function clearTimestampScreenshot(
  capture: VideoTimestampCapture,
  options: { keepRef?: boolean } = {}
): void {
  delete capture.screenshot;
  if (!options.keepRef) {
    delete capture.screenshotRef;
  }
}
