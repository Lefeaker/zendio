import { setTimestampScreenshot } from './screenshotIntent';
import { VideoScreenshotPreparationRequestStore } from './videoScreenshotPreparationRequestStore';
import type { VideoScreenshotPreparationQueueStateSnapshot } from './videoScreenshotPreparationRequestSnapshots';
import {
  notifyVideoScreenshotPrepared,
  type VideoScreenshotPreparedCallback
} from './videoScreenshotPreparationCallbacks';
import { VideoScreenshotPreparationCaptureIndex } from './videoScreenshotPreparationCaptureIndex';
import { scheduleHiddenDuplicateCaptures } from './videoScreenshotPreparationHiddenSlots';
import { approximatelyEqualVideoTime } from './videoTimeMath';
import {
  configureHiddenDuplicateVideo,
  createAbortableVideoScope,
  resolveDuplicableVideoSource,
  seekHiddenVideo,
  waitForUsableVideoFrame,
  type AbortableVideoScope
} from './videoAbortableWait';
import { captureVideoFrameScreenshotAsync } from './videoFrameScreenshot';
import type { VideoCaptureScreenshot, VideoTimestampCapture } from './types';

const DEFAULT_TOLERANCE_SEC = 0.25;
const DEFAULT_EXPLICIT_VISIBLE_TOLERANCE_SEC = 2;
const DEFAULT_PROVIDER_TIMEOUT_MS = 1_000;
const VISIBLE_TIME_EVENTS = ['timeupdate', 'seeked'] as const;
const VISIBLE_READY_EVENTS = ['loadedmetadata', 'loadeddata', 'canplay'] as const;

export interface VideoScreenshotPreparationQueue {
  request(captureId: string): void;
  requestAll(): void;
  handleVideoElementChange(video: HTMLVideoElement | null): void;
  dispose(): void;
}

type VideoScreenshotFrameCapture = (
  video: HTMLVideoElement,
  timeSec: number,
  now?: number
) => VideoCaptureScreenshot | null | Promise<VideoCaptureScreenshot | null>;

interface CreateVideoScreenshotPreparationQueueArgs {
  doc: Document;
  getCaptures: () => VideoTimestampCapture[];
  getVisibleVideo: () => HTMLVideoElement | null;
  captureFrame?: VideoScreenshotFrameCapture;
  captureVisibleFrame?: VideoScreenshotFrameCapture | undefined;
  syncPanel: () => void;
  maxHiddenDuplicateConcurrency?: number;
  onScreenshotPrepared?: VideoScreenshotPreparedCallback;
  toleranceSec?: number;
  timeoutMs?: number;
  __testHooks?: {
    onStateChange?: (snapshot: VideoScreenshotPreparationQueueStateSnapshot) => void;
  };
}

interface HiddenDuplicateCaptureAttempt {
  scope: AbortableVideoScope;
  sourceVideo: HTMLVideoElement;
}

class BackgroundVideoScreenshotPreparationQueue implements VideoScreenshotPreparationQueue {
  private visibleVideo: HTMLVideoElement | null = null;
  private disposed = false;
  private readonly requestStore =
    new VideoScreenshotPreparationRequestStore<HiddenDuplicateCaptureAttempt>(
      this.args.__testHooks?.onStateChange
    );
  private readonly captureIndex = new VideoScreenshotPreparationCaptureIndex(
    () => this.args.getCaptures(),
    this.requestStore
  );
  private readonly handleVisibleTimeProgress = () => void this.captureFromVisibleVideo('time');
  private readonly handleVisibleFrameReady = () => void this.captureFromVisibleVideo('ready');
  constructor(private readonly args: CreateVideoScreenshotPreparationQueueArgs) {}
  request(captureId: string): void {
    if (this.disposed) {
      return;
    }
    const capture = this.captureIndex.findPending(captureId);
    if (!capture) {
      this.requestStore.clearTracked(captureId);
      return;
    }
    this.requestStore.track(capture.id);
    this.requestStore.markExplicitVisible(capture.id);
    this.processRequests();
  }
  requestAll(): void {
    if (this.disposed) {
      return;
    }
    this.requestStore.trackAll(this.captureIndex.listPending().map((capture) => capture.id));
    this.captureIndex.pruneTracked();
    this.processRequests();
  }
  handleVideoElementChange(video: HTMLVideoElement | null): void {
    if (this.disposed) {
      return;
    }
    if (this.visibleVideo !== video) {
      const previousVisibleVideo = this.visibleVideo;
      this.detachVisibleVideoListeners();
      this.requestStore.abortAttemptsForVideo(previousVisibleVideo);
      this.visibleVideo = video;
      this.requestStore.resetVisibleAttempts();
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
    this.requestStore.disposeAll();
    this.visibleVideo = null;
  }
  private processRequests(): void {
    if (this.disposed) {
      return;
    }
    this.captureIndex.pruneTracked();
    if (this.requestStore.getTrackedIds().length === 0) {
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
    scheduleHiddenDuplicateCaptures({
      captures: this.captureIndex.listTrackedPending(),
      sourceVideo: visibleVideo,
      sourceUrl,
      maxConcurrency: this.args.maxHiddenDuplicateConcurrency,
      requestStore: this.requestStore,
      enqueue: (sourceVideo, duplicateSourceUrl, captureId) =>
        this.enqueueHiddenDuplicateCapture(sourceVideo, duplicateSourceUrl, captureId)
    });
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
    for (const capture of this.captureIndex.listTrackedPending()) {
      if (
        !approximatelyEqualVideoTime(
          visibleVideo.currentTime,
          capture.timeSec,
          this.getToleranceSec()
        )
      ) {
        const explicitTolerance = this.getExplicitVisibleTolerance(
          capture.id,
          reason,
          visibleVideo
        );
        if (
          explicitTolerance === null ||
          !approximatelyEqualVideoTime(visibleVideo.currentTime, capture.timeSec, explicitTolerance)
        ) {
          this.requestStore.clearVisibleAttempted(capture.id);
          continue;
        }
      }
      if (reason === 'time' && this.requestStore.hasVisibleAttempted(capture.id)) {
        continue;
      }
      if (this.requestStore.hasVisibleInFlight(capture.id)) {
        continue;
      }
      if (reason === 'time') {
        this.requestStore.markVisibleAttempted(capture.id);
      }
      this.requestStore.markVisibleInFlight(capture.id);
      let shouldReprocess = false;
      try {
        const screenshot =
          (await this.getCaptureFrame()(visibleVideo, capture.timeSec)) ??
          (await this.getVisibleFrameCapture()(visibleVideo, capture.timeSec));
        if (
          this.disposed ||
          this.resolveVisibleVideo() !== visibleVideo ||
          !this.captureIndex.hasTrackedPending(capture.id)
        ) {
          shouldReprocess = this.shouldReprocessAfterVisibleCaptureDrop(capture.id, visibleVideo);
          continue;
        }
        if (!screenshot) {
          this.enqueueHiddenDuplicateFallback(visibleVideo, capture.id);
          continue;
        }
        setTimestampScreenshot(capture, screenshot);
        notifyVideoScreenshotPrepared(
          this.args.onScreenshotPrepared,
          capture,
          screenshot,
          'visible'
        );
        this.requestStore.clearTracked(capture.id);
        didUpdate = true;
      } finally {
        this.requestStore.finishVisible(capture.id);
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
    if (this.disposed || this.requestStore.hasHiddenAttempt(captureId)) {
      return;
    }
    const attempt: HiddenDuplicateCaptureAttempt = {
      sourceVideo,
      scope: createAbortableVideoScope()
    };
    if (!this.requestStore.startHiddenAttempt(captureId, attempt)) {
      return;
    }
    void this.attemptHiddenDuplicateCapture(attempt, sourceUrl, captureId).finally(() => {
      this.requestStore.finishHiddenAttempt(captureId, attempt);
      if (this.disposed || this.requestStore.getTrackedIds().length === 0) {
        return;
      }
      this.processRequests();
    });
  }
  private async attemptHiddenDuplicateCapture(
    attempt: HiddenDuplicateCaptureAttempt,
    sourceUrl: string,
    captureId: string
  ): Promise<void> {
    if (
      attempt.scope.signal.aborted ||
      this.disposed ||
      this.resolveVisibleVideo() !== attempt.sourceVideo
    ) {
      return;
    }
    const capture = this.captureIndex.findPending(captureId);
    if (!capture) {
      this.requestStore.clearTracked(captureId);
      return;
    }

    const duplicateVideo = this.args.doc.createElement('video');
    configureHiddenDuplicateVideo(duplicateVideo, attempt.sourceVideo, sourceUrl);
    const parent = this.args.doc.body ?? this.args.doc.documentElement;
    parent?.append(duplicateVideo);
    attempt.scope.addCleanup(() => duplicateVideo.remove());

    try {
      if (
        !(await waitForUsableVideoFrame(duplicateVideo, this.getTimeoutMs(), attempt.scope.signal))
      ) {
        return;
      }
      if (
        !(await seekHiddenVideo(
          duplicateVideo,
          capture.timeSec,
          this.getTimeoutMs(),
          attempt.scope.signal
        ))
      ) {
        return;
      }
      if (
        !(await waitForUsableVideoFrame(duplicateVideo, this.getTimeoutMs(), attempt.scope.signal))
      ) {
        return;
      }
      if (!this.shouldKeepHiddenDuplicateCapture(capture.id, attempt)) {
        return;
      }
      const screenshot = await this.getCaptureFrame()(duplicateVideo, capture.timeSec);
      if (!this.shouldKeepHiddenDuplicateCapture(capture.id, attempt)) {
        return;
      }
      if (!screenshot) {
        return;
      }
      setTimestampScreenshot(capture, screenshot);
      notifyVideoScreenshotPrepared(
        this.args.onScreenshotPrepared,
        capture,
        screenshot,
        'hidden-duplicate'
      );
      this.requestStore.clearTracked(capture.id);
      this.args.syncPanel();
    } catch (error) {
      console.warn('[VideoSession] Failed to prepare requested screenshot in background:', error);
    } finally {
      attempt.scope.dispose();
    }
  }
  private resolveVisibleVideo(): HTMLVideoElement | null {
    return this.args.getVisibleVideo() ?? this.visibleVideo;
  }
  private shouldKeepHiddenDuplicateCapture(
    captureId: string,
    attempt: HiddenDuplicateCaptureAttempt
  ): boolean {
    return (
      !attempt.scope.signal.aborted &&
      !this.disposed &&
      this.resolveVisibleVideo() === attempt.sourceVideo &&
      this.captureIndex.hasTrackedPending(captureId)
    );
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
  private getVisibleFrameCapture(): VideoScreenshotFrameCapture {
    return this.args.captureVisibleFrame ?? (() => null);
  }
  private getToleranceSec(): number {
    return this.args.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  }
  private getTimeoutMs(): number {
    return this.args.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  private getExplicitVisibleTolerance(
    captureId: string,
    reason: 'manual' | 'ready' | 'time',
    visibleVideo: HTMLVideoElement
  ): number | null {
    if (
      reason === 'time' ||
      !this.requestStore.hasExplicitVisible(captureId) ||
      resolveDuplicableVideoSource(visibleVideo, this.args.doc.location.href)
    ) {
      return null;
    }
    return Math.max(this.getToleranceSec(), DEFAULT_EXPLICIT_VISIBLE_TOLERANCE_SEC);
  }
  private shouldReprocessAfterVisibleCaptureDrop(
    captureId: string,
    attemptedVideo: HTMLVideoElement
  ): boolean {
    return (
      !this.disposed &&
      this.captureIndex.hasTrackedPending(captureId) &&
      this.resolveVisibleVideo() !== attemptedVideo
    );
  }
  private enqueueHiddenDuplicateFallback(sourceVideo: HTMLVideoElement, captureId: string): void {
    if (this.disposed || !this.captureIndex.hasTrackedPending(captureId)) {
      return;
    }
    const sourceUrl = resolveDuplicableVideoSource(sourceVideo, this.args.doc.location.href);
    if (sourceUrl) {
      this.enqueueHiddenDuplicateCapture(sourceVideo, sourceUrl, captureId);
    }
  }
}

export function createVideoScreenshotPreparationQueue(
  args: CreateVideoScreenshotPreparationQueueArgs
): VideoScreenshotPreparationQueue {
  return new BackgroundVideoScreenshotPreparationQueue(args);
}
