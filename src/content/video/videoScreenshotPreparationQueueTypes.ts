import type { VideoCaptureScreenshot, VideoTimestampCapture } from './types';
import type { VideoScreenshotPreparationQueueStateSnapshot } from './videoScreenshotPreparationRequestSnapshots';
import type { VideoScreenshotPreparedCallback } from './videoScreenshotPreparationCallbacks';

export type VideoScreenshotFrameCapture = (
  video: HTMLVideoElement,
  timeSec: number,
  now?: number
) => VideoCaptureScreenshot | null | Promise<VideoCaptureScreenshot | null>;

export interface CreateVideoScreenshotPreparationQueueArgs {
  doc: Document;
  getCaptures: () => VideoTimestampCapture[];
  getVisibleVideo: () => HTMLVideoElement | null;
  captureFrame?: VideoScreenshotFrameCapture;
  captureVisibleFrame?: VideoScreenshotFrameCapture | undefined;
  syncPanel: () => void;
  maxHiddenDuplicateConcurrency?: number;
  maxHiddenDuplicateAttempts?: number;
  hiddenRetryBackoffMs?: number;
  onScreenshotPrepared?: VideoScreenshotPreparedCallback;
  toleranceSec?: number;
  timeoutMs?: number;
  __testHooks?: {
    onStateChange?: (snapshot: VideoScreenshotPreparationQueueStateSnapshot) => void;
  };
}
