import {
  hasRequestedTimestampScreenshot,
  setRequestedTimestampScreenshot
} from './screenshotIntent';
import { captureVideoFrameScreenshot } from './videoFrameScreenshot';
import type { VideoTimestampCapture } from './types';

const DEFAULT_TOLERANCE_SEC = 0.25;
const DEFAULT_PROVIDER_TIMEOUT_MS = 1_000;
const VISIBLE_TIME_EVENTS = ['timeupdate', 'seeked'] as const;
const VISIBLE_READY_EVENTS = ['loadedmetadata', 'loadeddata', 'canplay'] as const;
const HIDDEN_VIDEO_READY_EVENTS = ['loadedmetadata', 'loadeddata', 'canplay'] as const;

export interface VideoScreenshotPreparationQueue {
  request(captureId: string): void;
  requestAll(): void;
  handleVideoElementChange(video: HTMLVideoElement | null): void;
  dispose(): void;
}

interface CreateVideoScreenshotPreparationQueueArgs {
  doc: Document;
  getCaptures: () => VideoTimestampCapture[];
  getVisibleVideo: () => HTMLVideoElement | null;
  captureFrame?: typeof captureVideoFrameScreenshot;
  syncPanel: () => void;
  toleranceSec?: number;
  timeoutMs?: number;
}

class BackgroundVideoScreenshotPreparationQueue implements VideoScreenshotPreparationQueue {
  private visibleVideo: HTMLVideoElement | null = null;
  private disposed = false;
  private readonly trackedCaptureIds = new Set<string>();
  private readonly visibleAttemptedIds = new Set<string>();
  private readonly inFlightDuplicateIds = new Set<string>();

  private readonly handleVisibleTimeProgress = () => {
    this.captureFromVisibleVideo('time');
  };

  private readonly handleVisibleFrameReady = () => {
    this.captureFromVisibleVideo('ready');
  };

  constructor(private readonly args: CreateVideoScreenshotPreparationQueueArgs) {}

  request(captureId: string): void {
    if (this.disposed) {
      return;
    }
    const capture = this.findPendingCapture(captureId);
    if (!capture) {
      this.clearTrackedCapture(captureId);
      return;
    }
    this.trackedCaptureIds.add(capture.id);
    this.processRequests();
  }

  requestAll(): void {
    if (this.disposed) {
      return;
    }
    for (const capture of this.listPendingCaptures()) {
      this.trackedCaptureIds.add(capture.id);
    }
    this.pruneTrackedCaptures();
    this.processRequests();
  }

  handleVideoElementChange(video: HTMLVideoElement | null): void {
    if (this.disposed) {
      return;
    }
    if (this.visibleVideo !== video) {
      this.detachVisibleVideoListeners();
      this.visibleVideo = video;
      this.visibleAttemptedIds.clear();
      this.attachVisibleVideoListeners();
    }
    this.processRequests();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.detachVisibleVideoListeners();
    this.visibleVideo = null;
    this.trackedCaptureIds.clear();
    this.visibleAttemptedIds.clear();
    this.inFlightDuplicateIds.clear();
  }

  private processRequests(): void {
    if (this.disposed) {
      return;
    }
    this.pruneTrackedCaptures();
    if (this.trackedCaptureIds.size === 0) {
      return;
    }
    this.captureFromVisibleVideo('manual');
    const visibleVideo = this.resolveVisibleVideo();
    if (!visibleVideo) {
      return;
    }
    const sourceUrl = resolveDuplicableVideoSource(visibleVideo, this.args.doc.location.href);
    if (!sourceUrl) {
      return;
    }
    for (const capture of this.listTrackedPendingCaptures()) {
      this.enqueueHiddenDuplicateCapture(visibleVideo, sourceUrl, capture.id);
    }
  }

  private captureFromVisibleVideo(reason: 'manual' | 'ready' | 'time'): void {
    if (this.disposed) {
      return;
    }
    const visibleVideo = this.resolveVisibleVideo();
    if (!visibleVideo) {
      return;
    }

    let didUpdate = false;
    for (const capture of this.listTrackedPendingCaptures()) {
      if (!approximatelyEqual(visibleVideo.currentTime, capture.timeSec, this.getToleranceSec())) {
        this.visibleAttemptedIds.delete(capture.id);
        continue;
      }
      if (reason === 'time' && this.visibleAttemptedIds.has(capture.id)) {
        continue;
      }
      if (reason === 'time') {
        this.visibleAttemptedIds.add(capture.id);
      }
      const screenshot = this.getCaptureFrame()(visibleVideo, capture.timeSec);
      if (!screenshot) {
        continue;
      }
      setRequestedTimestampScreenshot(capture, screenshot);
      this.clearTrackedCapture(capture.id);
      didUpdate = true;
    }

    if (didUpdate) {
      this.args.syncPanel();
    }
  }

  private enqueueHiddenDuplicateCapture(
    sourceVideo: HTMLVideoElement,
    sourceUrl: string,
    captureId: string
  ): void {
    if (this.disposed || this.inFlightDuplicateIds.has(captureId)) {
      return;
    }
    this.inFlightDuplicateIds.add(captureId);
    void this.attemptHiddenDuplicateCapture(sourceVideo, sourceUrl, captureId).finally(() => {
      this.inFlightDuplicateIds.delete(captureId);
    });
  }

  private async attemptHiddenDuplicateCapture(
    sourceVideo: HTMLVideoElement,
    sourceUrl: string,
    captureId: string
  ): Promise<void> {
    if (this.disposed || this.resolveVisibleVideo() !== sourceVideo) {
      return;
    }
    const capture = this.findPendingCapture(captureId);
    if (!capture) {
      this.clearTrackedCapture(captureId);
      return;
    }

    const duplicateVideo = this.args.doc.createElement('video');
    configureHiddenDuplicateVideo(duplicateVideo, sourceVideo, sourceUrl);
    const parent = this.args.doc.body ?? this.args.doc.documentElement;
    parent?.append(duplicateVideo);

    try {
      if (!(await waitForUsableVideoFrame(duplicateVideo, this.getTimeoutMs()))) {
        return;
      }
      if (!(await seekHiddenVideo(duplicateVideo, capture.timeSec, this.getTimeoutMs()))) {
        return;
      }
      if (!(await waitForUsableVideoFrame(duplicateVideo, this.getTimeoutMs()))) {
        return;
      }
      const screenshot = this.getCaptureFrame()(duplicateVideo, capture.timeSec);
      if (!screenshot) {
        return;
      }
      setRequestedTimestampScreenshot(capture, screenshot);
      this.clearTrackedCapture(capture.id);
      this.args.syncPanel();
    } catch (error) {
      console.warn('[VideoSession] Failed to prepare requested screenshot in background:', error);
    } finally {
      duplicateVideo.remove();
    }
  }

  private resolveVisibleVideo(): HTMLVideoElement | null {
    return this.args.getVisibleVideo() ?? this.visibleVideo;
  }

  private findPendingCapture(id: string): VideoTimestampCapture | null {
    return this.listPendingCaptures().find((capture) => capture.id === id) ?? null;
  }

  private listPendingCaptures(): VideoTimestampCapture[] {
    return this.args
      .getCaptures()
      .filter((capture) => hasRequestedTimestampScreenshot(capture) && !capture.screenshot);
  }

  private listTrackedPendingCaptures(): VideoTimestampCapture[] {
    const pendingById = new Map(this.listPendingCaptures().map((capture) => [capture.id, capture]));
    return Array.from(this.trackedCaptureIds)
      .map((id) => pendingById.get(id) ?? null)
      .filter((capture): capture is VideoTimestampCapture => capture !== null);
  }

  private pruneTrackedCaptures(): void {
    const pendingIds = new Set(this.listPendingCaptures().map((capture) => capture.id));
    for (const captureId of Array.from(this.trackedCaptureIds)) {
      if (!pendingIds.has(captureId)) {
        this.clearTrackedCapture(captureId);
      }
    }
  }

  private clearTrackedCapture(captureId: string): void {
    this.trackedCaptureIds.delete(captureId);
    this.visibleAttemptedIds.delete(captureId);
  }

  private isTrackedPendingCaptureId(captureId: string): boolean {
    return this.trackedCaptureIds.has(captureId) && Boolean(this.findPendingCapture(captureId));
  }

  private attachVisibleVideoListeners(): void {
    if (!this.visibleVideo) {
      return;
    }
    for (const eventName of VISIBLE_TIME_EVENTS) {
      this.visibleVideo.addEventListener(eventName, this.handleVisibleTimeProgress, true);
    }
    for (const eventName of VISIBLE_READY_EVENTS) {
      this.visibleVideo.addEventListener(eventName, this.handleVisibleFrameReady, true);
    }
  }

  private detachVisibleVideoListeners(): void {
    if (!this.visibleVideo) {
      return;
    }
    for (const eventName of VISIBLE_TIME_EVENTS) {
      this.visibleVideo.removeEventListener(eventName, this.handleVisibleTimeProgress, true);
    }
    for (const eventName of VISIBLE_READY_EVENTS) {
      this.visibleVideo.removeEventListener(eventName, this.handleVisibleFrameReady, true);
    }
  }

  private getCaptureFrame() {
    return this.args.captureFrame ?? captureVideoFrameScreenshot;
  }

  private getToleranceSec(): number {
    return this.args.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  }

  private getTimeoutMs(): number {
    return this.args.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }
}

export function createVideoScreenshotPreparationQueue(
  args: CreateVideoScreenshotPreparationQueueArgs
): VideoScreenshotPreparationQueue {
  return new BackgroundVideoScreenshotPreparationQueue(args);
}

function configureHiddenDuplicateVideo(
  duplicateVideo: HTMLVideoElement,
  sourceVideo: HTMLVideoElement,
  sourceUrl: string
): void {
  duplicateVideo.preload = 'auto';
  duplicateVideo.muted = true;
  duplicateVideo.defaultMuted = true;
  duplicateVideo.playsInline = true;
  duplicateVideo.setAttribute('playsinline', 'true');
  duplicateVideo.setAttribute('aria-hidden', 'true');
  duplicateVideo.tabIndex = -1;
  duplicateVideo.style.position = 'fixed';
  duplicateVideo.style.left = '-99999px';
  duplicateVideo.style.top = '0';
  duplicateVideo.style.width = '1px';
  duplicateVideo.style.height = '1px';
  duplicateVideo.style.opacity = '0';
  duplicateVideo.style.pointerEvents = 'none';
  if (sourceVideo.crossOrigin) {
    duplicateVideo.crossOrigin = sourceVideo.crossOrigin;
  }
  duplicateVideo.src = sourceUrl;
}

function resolveDuplicableVideoSource(video: HTMLVideoElement, baseUrl: string): string | null {
  const candidate = (video.currentSrc || video.getAttribute('src') || video.src || '').trim();
  if (!candidate) {
    return null;
  }
  try {
    const url = new URL(candidate, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function hasUsableVideoFrame(video: HTMLVideoElement): boolean {
  const width = Math.floor(video.videoWidth || video.clientWidth || 0);
  const height = Math.floor(video.videoHeight || video.clientHeight || 0);
  return width > 0 && height > 0;
}

async function waitForUsableVideoFrame(
  video: HTMLVideoElement,
  timeoutMs: number
): Promise<boolean> {
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
      for (const eventName of HIDDEN_VIDEO_READY_EVENTS) {
        video.removeEventListener(eventName, handleReady, true);
      }
    };
    const handleReady = () => {
      if (hasUsableVideoFrame(video)) {
        done(true);
      }
    };
    const timerId = view.setTimeout(() => done(false), timeoutMs);

    for (const eventName of HIDDEN_VIDEO_READY_EVENTS) {
      video.addEventListener(eventName, handleReady, true);
    }
    handleReady();
  });
}

async function seekHiddenVideo(
  video: HTMLVideoElement,
  timeSec: number,
  timeoutMs: number
): Promise<boolean> {
  const targetTime = normalizeVideoTime(timeSec);
  if (!Number.isFinite(targetTime) || targetTime < 0) {
    return false;
  }
  if (approximatelyEqual(video.currentTime, targetTime, 0.001)) {
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

function approximatelyEqual(left: number, right: number, tolerance: number): boolean {
  return Math.abs(normalizeVideoTime(left) - normalizeVideoTime(right)) <= tolerance;
}
