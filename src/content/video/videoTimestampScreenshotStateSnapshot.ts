import type { VideoTimestampCapture } from './types';

interface TimestampScreenshotStateSnapshot {
  hasScreenshotRequested: boolean;
  screenshotRequested: VideoTimestampCapture['screenshotRequested'];
  hasScreenshot: boolean;
  screenshot: VideoTimestampCapture['screenshot'];
  hasScreenshotPreparationFailed: boolean;
  screenshotPreparationFailed: VideoTimestampCapture['screenshotPreparationFailed'];
}

function restoreTimestampScreenshotRequestedProperty(
  capture: VideoTimestampCapture,
  snapshot: TimestampScreenshotStateSnapshot
): void {
  if (!snapshot.hasScreenshotRequested) {
    delete capture.screenshotRequested;
    return;
  }
  if (snapshot.screenshotRequested !== undefined) {
    capture.screenshotRequested = snapshot.screenshotRequested;
    return;
  }
  Object.defineProperty(capture, 'screenshotRequested', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: undefined
  });
}

function restoreTimestampScreenshotProperty(
  capture: VideoTimestampCapture,
  snapshot: TimestampScreenshotStateSnapshot
): void {
  if (!snapshot.hasScreenshot) {
    delete capture.screenshot;
    return;
  }
  if (snapshot.screenshot !== undefined) {
    capture.screenshot = snapshot.screenshot;
    return;
  }
  Object.defineProperty(capture, 'screenshot', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: undefined
  });
}

function restoreTimestampScreenshotPreparationFailureProperty(
  capture: VideoTimestampCapture,
  snapshot: TimestampScreenshotStateSnapshot
): void {
  if (!snapshot.hasScreenshotPreparationFailed) {
    delete capture.screenshotPreparationFailed;
    return;
  }
  if (snapshot.screenshotPreparationFailed !== undefined) {
    capture.screenshotPreparationFailed = snapshot.screenshotPreparationFailed;
    return;
  }
  Object.defineProperty(capture, 'screenshotPreparationFailed', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: undefined
  });
}

export function snapshotTimestampScreenshotState(
  capture: VideoTimestampCapture
): TimestampScreenshotStateSnapshot {
  return {
    hasScreenshotRequested: Object.prototype.hasOwnProperty.call(capture, 'screenshotRequested'),
    screenshotRequested: capture.screenshotRequested,
    hasScreenshot: Object.prototype.hasOwnProperty.call(capture, 'screenshot'),
    screenshot: capture.screenshot,
    hasScreenshotPreparationFailed: Object.prototype.hasOwnProperty.call(
      capture,
      'screenshotPreparationFailed'
    ),
    screenshotPreparationFailed: capture.screenshotPreparationFailed
  };
}

export function restoreTimestampScreenshotState(
  capture: VideoTimestampCapture,
  snapshot: ReturnType<typeof snapshotTimestampScreenshotState>
): void {
  restoreTimestampScreenshotRequestedProperty(capture, snapshot);
  restoreTimestampScreenshotProperty(capture, snapshot);
  restoreTimestampScreenshotPreparationFailureProperty(capture, snapshot);
}
