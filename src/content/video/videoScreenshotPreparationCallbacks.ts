import type { VideoCaptureScreenshot, VideoTimestampCapture } from './types';

export type VideoScreenshotPreparationSource = 'visible' | 'hidden-duplicate';

export type VideoScreenshotPreparedCallback = (
  capture: VideoTimestampCapture,
  screenshot: VideoCaptureScreenshot,
  source: VideoScreenshotPreparationSource
) => void | Promise<void>;

export function notifyVideoScreenshotPrepared(
  callback: VideoScreenshotPreparedCallback | undefined,
  capture: VideoTimestampCapture,
  screenshot: VideoCaptureScreenshot,
  source: VideoScreenshotPreparationSource
): void {
  if (!callback) {
    return;
  }
  void Promise.resolve(callback(capture, screenshot, source)).catch((error) => {
    console.warn('[VideoSession] Failed to handle prepared screenshot callback:', error);
  });
}
