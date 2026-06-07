import { captureVideoFrameScreenshot } from './videoFrameScreenshot';
import type { VideoTimestampCapture } from './types';

const DEFAULT_SCREENSHOT_RECAPTURE_TIMEOUT_MS = 1_000;
const VIDEO_READY_EVENTS = ['loadedmetadata', 'loadeddata', 'canplay'] as const;

export interface RestoreRequestedTimestampScreenshotsArgs {
  captures: VideoTimestampCapture[];
  video: HTMLVideoElement;
  timeoutMs?: number;
  captureFrame?: typeof captureVideoFrameScreenshot;
}

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

export async function restoreRequestedTimestampScreenshots(
  args: RestoreRequestedTimestampScreenshotsArgs
): Promise<void> {
  const pendingCaptures = args.captures.filter(
    (capture) => hasRequestedTimestampScreenshot(capture) && !capture.screenshot
  );
  if (pendingCaptures.length === 0) {
    return;
  }

  const video = args.video;
  const timeoutMs = args.timeoutMs ?? DEFAULT_SCREENSHOT_RECAPTURE_TIMEOUT_MS;
  const captureFrame = args.captureFrame ?? captureVideoFrameScreenshot;
  const startingTime = normalizeVideoTime(video.currentTime);
  const shouldResumePlayback = !video.paused;

  if (shouldResumePlayback) {
    try {
      video.pause();
    } catch {
      // Ignore pause failures and continue with best-effort capture.
    }
  }

  try {
    const ready = await waitForVideoFrame(video, timeoutMs);
    if (!ready) {
      return;
    }

    for (const capture of pendingCaptures) {
      const didSeek = await seekVideo(video, capture.timeSec, timeoutMs);
      if (!didSeek) {
        continue;
      }
      const screenshot = captureFrame(video, capture.timeSec);
      if (screenshot) {
        setRequestedTimestampScreenshot(capture, screenshot);
      }
    }
  } finally {
    await restorePlayback(video, startingTime, shouldResumePlayback, timeoutMs);
  }
}

function hasUsableVideoFrame(video: HTMLVideoElement): boolean {
  const width = Math.floor(video.videoWidth || video.clientWidth || 0);
  const height = Math.floor(video.videoHeight || video.clientHeight || 0);
  return width > 0 && height > 0;
}

async function waitForVideoFrame(video: HTMLVideoElement, timeoutMs: number): Promise<boolean> {
  if (hasUsableVideoFrame(video)) {
    return true;
  }

  const view = video.ownerDocument.defaultView ?? window;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };
    const cleanup = () => {
      if (timerId !== null) {
        view.clearTimeout(timerId);
      }
      for (const eventName of VIDEO_READY_EVENTS) {
        video.removeEventListener(eventName, handleReady, true);
      }
    };
    const handleReady = () => {
      if (hasUsableVideoFrame(video)) {
        done(true);
      }
    };
    const timerId = view.setTimeout(() => done(false), timeoutMs);

    for (const eventName of VIDEO_READY_EVENTS) {
      video.addEventListener(eventName, handleReady, true);
    }
    handleReady();
  });
}

async function restorePlayback(
  video: HTMLVideoElement,
  startingTime: number,
  shouldResumePlayback: boolean,
  timeoutMs: number
): Promise<void> {
  const currentTime = normalizeVideoTime(video.currentTime);
  if (!approximatelyEqual(currentTime, startingTime)) {
    await seekVideo(video, startingTime, timeoutMs);
  }
  if (!shouldResumePlayback || typeof video.play !== 'function') {
    return;
  }
  try {
    await Promise.resolve(video.play());
  } catch {
    // Best effort only. Do not fail session restore on playback resume problems.
  }
}

async function seekVideo(
  video: HTMLVideoElement,
  timeSec: number,
  timeoutMs: number
): Promise<boolean> {
  const targetTime = normalizeVideoTime(timeSec);
  if (!Number.isFinite(targetTime) || targetTime < 0) {
    return false;
  }

  if (approximatelyEqual(normalizeVideoTime(video.currentTime), targetTime)) {
    return true;
  }

  const view = video.ownerDocument.defaultView ?? window;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };
    const cleanup = () => {
      if (timerId !== null) {
        view.clearTimeout(timerId);
      }
      video.removeEventListener('seeked', handleSeeked, true);
    };
    const handleSeeked = () => done(true);
    const timerId = view.setTimeout(() => done(false), timeoutMs);

    video.addEventListener('seeked', handleSeeked, true);
    try {
      video.currentTime = targetTime;
    } catch {
      done(false);
    }
  });
}

function normalizeVideoTime(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function approximatelyEqual(left: number, right: number, tolerance = 0.001): boolean {
  return Math.abs(left - right) <= tolerance;
}
