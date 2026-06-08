import {
  hasRequestedTimestampScreenshot,
  setRequestedTimestampScreenshot
} from './screenshotIntent';
import { captureVideoFrameScreenshotAsync } from './videoFrameScreenshot';
import type { VideoCaptureScreenshot, VideoTimestampCapture } from './types';

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
  captureFrame?: (
    video: HTMLVideoElement,
    timeSec: number,
    now?: number
  ) => VideoCaptureScreenshot | null | Promise<VideoCaptureScreenshot | null>;
  syncPanel: () => void;
  toleranceSec?: number;
  timeoutMs?: number;
}

class BackgroundVideoScreenshotPreparationQueue implements VideoScreenshotPreparationQueue {
  private visibleVideo: HTMLVideoElement | null = null;
  private disposed = false;
  private readonly trackedCaptureIds = new Set<string>();
  private readonly visibleAttemptedIds = new Set<string>();
  private readonly inFlightVisibleIds = new Set<string>();
  private readonly inFlightDuplicateIds = new Set<string>();
  private readonly handleVisibleTimeProgress = () => void this.captureFromVisibleVideo('time');
  private readonly handleVisibleFrameReady = () => void this.captureFromVisibleVideo('ready');
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
    this.inFlightVisibleIds.clear();
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
    void this.captureFromVisibleVideo('manual');
    const visibleVideo = this.resolveVisibleVideo();
    if (!visibleVideo) {
      return;
    }
    const sourceUrl = resolveDuplicableVideoSource(visibleVideo, this.args.doc.location.href);
    if (!sourceUrl) {
      return;
    }
    for (const capture of this.listTrackedPendingCaptures()) {
      if (this.inFlightVisibleIds.has(capture.id)) {
        continue;
      }
      this.enqueueHiddenDuplicateCapture(visibleVideo, sourceUrl, capture.id);
    }
  }
  private async captureFromVisibleVideo(reason: 'manual' | 'ready' | 'time'): Promise<void> {
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
      if (this.inFlightVisibleIds.has(capture.id)) {
        continue;
      }
      if (reason === 'time') {
        this.visibleAttemptedIds.add(capture.id);
      }
      this.inFlightVisibleIds.add(capture.id);
      let shouldReprocess = false;
      try {
        const screenshot = await this.getCaptureFrame()(visibleVideo, capture.timeSec);
        if (
          this.disposed ||
          this.resolveVisibleVideo() !== visibleVideo ||
          !this.isTrackedPendingCaptureId(capture.id)
        ) {
          shouldReprocess = this.shouldReprocessAfterVisibleCaptureDrop(capture.id, visibleVideo);
          continue;
        }
        if (!screenshot) {
          this.enqueueHiddenDuplicateFallback(visibleVideo, capture.id);
          continue;
        }
        setRequestedTimestampScreenshot(capture, screenshot);
        this.clearTrackedCapture(capture.id);
        didUpdate = true;
      } finally {
        this.inFlightVisibleIds.delete(capture.id);
        if (shouldReprocess) {
          this.processRequests();
        }
      }
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
      if (this.disposed || !this.isTrackedPendingCaptureId(capture.id)) {
        return;
      }
      const screenshot = await this.getCaptureFrame()(duplicateVideo, capture.timeSec);
      if (this.disposed || !this.isTrackedPendingCaptureId(capture.id)) {
        return;
      }
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
    this.inFlightVisibleIds.delete(captureId);
  }
  private isTrackedPendingCaptureId(captureId: string): boolean {
    return this.trackedCaptureIds.has(captureId) && Boolean(this.findPendingCapture(captureId));
  }
  private attachVisibleVideoListeners(): void {
    this.syncVisibleVideoListeners('addEventListener');
  }
  private detachVisibleVideoListeners(): void {
    this.syncVisibleVideoListeners('removeEventListener');
  }
  private syncVisibleVideoListeners(method: 'addEventListener' | 'removeEventListener'): void {
    if (!this.visibleVideo) {
      return;
    }
    for (const eventName of VISIBLE_TIME_EVENTS) {
      this.visibleVideo[method](eventName, this.handleVisibleTimeProgress, true);
    }
    for (const eventName of VISIBLE_READY_EVENTS) {
      this.visibleVideo[method](eventName, this.handleVisibleFrameReady, true);
    }
  }
  private getCaptureFrame() {
    return this.args.captureFrame ?? captureVideoFrameScreenshotAsync;
  }
  private getToleranceSec(): number {
    return this.args.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  }
  private getTimeoutMs(): number {
    return this.args.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }
  // prettier-ignore
  private shouldReprocessAfterVisibleCaptureDrop(captureId: string, attemptedVideo: HTMLVideoElement): boolean { return !this.disposed && this.isTrackedPendingCaptureId(captureId) && this.resolveVisibleVideo() !== attemptedVideo; }
  // prettier-ignore
  private enqueueHiddenDuplicateFallback(sourceVideo: HTMLVideoElement, captureId: string): void { if (this.disposed || !this.isTrackedPendingCaptureId(captureId)) return; const sourceUrl = resolveDuplicableVideoSource(sourceVideo, this.args.doc.location.href); if (sourceUrl) this.enqueueHiddenDuplicateCapture(sourceVideo, sourceUrl, captureId); }
}

// prettier-ignore
export function createVideoScreenshotPreparationQueue(args: CreateVideoScreenshotPreparationQueueArgs): VideoScreenshotPreparationQueue { return new BackgroundVideoScreenshotPreparationQueue(args); }

function configureHiddenDuplicateVideo(
  duplicateVideo: HTMLVideoElement,
  sourceVideo: HTMLVideoElement,
  sourceUrl: string
): void {
  Object.assign(duplicateVideo, {
    preload: 'auto',
    muted: true,
    defaultMuted: true,
    playsInline: true,
    tabIndex: -1
  });
  duplicateVideo.setAttribute('playsinline', 'true');
  duplicateVideo.setAttribute('aria-hidden', 'true');
  Object.assign(duplicateVideo.style, {
    position: 'fixed',
    left: '-99999px',
    top: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none'
  });
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
// prettier-ignore
function hasUsableVideoFrame(video: HTMLVideoElement): boolean { return Math.floor(video.videoWidth || video.clientWidth || 0) > 0 && Math.floor(video.videoHeight || video.clientHeight || 0) > 0; }
// prettier-ignore
async function waitForUsableVideoFrame(video: HTMLVideoElement, timeoutMs: number): Promise<boolean> { return waitForVideoCondition(video, timeoutMs, HIDDEN_VIDEO_READY_EVENTS, () => hasUsableVideoFrame(video)); }

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
  return waitForVideoCondition(
    video,
    timeoutMs,
    ['seeked'],
    () => approximatelyEqual(video.currentTime, targetTime, 0.001),
    () => {
      try {
        video.currentTime = targetTime;
        return true;
      } catch {
        return false;
      }
    }
  );
}

function waitForVideoCondition(
  video: HTMLVideoElement,
  timeoutMs: number,
  eventNames: readonly string[],
  isReady: () => boolean,
  start?: () => boolean
): Promise<boolean> {
  if (isReady()) {
    return Promise.resolve(true);
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
      for (const eventName of eventNames) {
        video.removeEventListener(eventName, handleEvent, true);
      }
    };
    const handleEvent = () => {
      if (isReady()) {
        done(true);
      }
    };
    const timerId = view.setTimeout(() => done(false), timeoutMs);
    for (const eventName of eventNames) {
      video.addEventListener(eventName, handleEvent, true);
    }
    if (start?.() === false) {
      done(false);
      return;
    }
    handleEvent();
  });
}
function normalizeVideoTime(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
function approximatelyEqual(left: number, right: number, tolerance: number): boolean {
  return Math.abs(normalizeVideoTime(left) - normalizeVideoTime(right)) <= tolerance;
}
