import type { VideoTimestampCapture } from './types';
import type { VideoScreenshotCacheRef } from './videoScreenshotCacheTypes';

export function hasRequestedTimestampScreenshot(
  capture: Pick<VideoTimestampCapture, 'screenshotPreparationFailed' | 'screenshotRequested'>
): boolean {
  return capture.screenshotRequested === true && capture.screenshotPreparationFailed !== true;
}

export function setRequestedTimestampScreenshot(
  capture: VideoTimestampCapture,
  screenshot: VideoTimestampCapture['screenshot'] | null
): void {
  capture.screenshotRequested = true;
  clearTimestampScreenshotPreparationFailure(capture);
  if (screenshot) {
    capture.screenshot = screenshot;
  }
}

export function clearRequestedTimestampScreenshot(capture: VideoTimestampCapture): void {
  delete capture.screenshotRequested;
  clearTimestampScreenshotPreparationFailure(capture);
}

export function setTimestampScreenshot(
  capture: VideoTimestampCapture,
  screenshot: NonNullable<VideoTimestampCapture['screenshot']>
): void {
  capture.screenshot = screenshot;
  clearTimestampScreenshotPreparationFailure(capture);
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
  clearTimestampScreenshotPreparationFailure(capture);
  if (!options.keepRef) {
    delete capture.screenshotRef;
  }
}

export function markTimestampScreenshotPreparationFailed(capture: VideoTimestampCapture): void {
  capture.screenshotPreparationFailed = true;
}

export function clearTimestampScreenshotPreparationFailure(capture: VideoTimestampCapture): void {
  delete capture.screenshotPreparationFailed;
}
