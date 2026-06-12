import {
  hasRequestedTimestampScreenshot,
  setRequestedTimestampScreenshot
} from './screenshotIntent';
import type { VideoCaptureScreenshot, VideoTimestampCapture } from './types';
import type { VideoScreenshotPreparationQueue } from './videoScreenshotPreparationQueue';

interface VideoScreenshotPreparationCoordinatorArgs {
  doc: Document;
  getCaptures: () => VideoTimestampCapture[];
  getVisibleVideo: () => HTMLVideoElement | null;
  syncPanel: () => void;
}

export interface VideoScreenshotPreparationQueueStateSnapshot {
  trackedCaptureIds: string[];
  visibleAttemptedIds: string[];
  inFlightVisibleIds: string[];
  hiddenDuplicateAttemptIds: string[];
}

export interface VideoScreenshotPreparationAttemptLike {
  sourceVideo: HTMLVideoElement;
  scope: {
    dispose(): void;
  };
}

interface VideoScreenshotPreparationRequestState<
  TAttempt extends VideoScreenshotPreparationAttemptLike
> {
  tracked: boolean;
  visibleAttempted: boolean;
  visibleInFlight: boolean;
  hiddenAttempt: TAttempt | null;
}

export class VideoScreenshotPreparationRequestStore<
  TAttempt extends VideoScreenshotPreparationAttemptLike
> {
  private readonly requests = new Map<string, VideoScreenshotPreparationRequestState<TAttempt>>();

  constructor(
    private readonly onStateChange?: (
      snapshot: VideoScreenshotPreparationQueueStateSnapshot
    ) => void
  ) {}

  track(captureId: string): void {
    this.ensureRequest(captureId).tracked = true;
    this.emit();
  }

  trackAll(captureIds: Iterable<string>): void {
    let didChange = false;
    for (const captureId of captureIds) {
      const request = this.ensureRequest(captureId);
      if (!request.tracked) {
        request.tracked = true;
        didChange = true;
      }
    }
    if (didChange) {
      this.emit();
    }
  }

  clearTracked(captureId: string): void {
    const request = this.requests.get(captureId);
    if (!request) {
      return;
    }

    request.tracked = false;
    request.visibleAttempted = false;
    request.visibleInFlight = false;
    this.disposeHiddenAttempt(request);
    this.compact(captureId, request);
    this.emit();
  }

  pruneTracked(pendingIds: ReadonlySet<string>): void {
    let didChange = false;
    for (const [captureId, request] of Array.from(this.requests.entries())) {
      if (!request.tracked || pendingIds.has(captureId)) {
        continue;
      }
      request.tracked = false;
      request.visibleAttempted = false;
      request.visibleInFlight = false;
      this.disposeHiddenAttempt(request);
      this.compact(captureId, request);
      didChange = true;
    }
    if (didChange) {
      this.emit();
    }
  }

  markVisibleAttempted(captureId: string): void {
    const request = this.ensureRequest(captureId);
    if (request.visibleAttempted) {
      return;
    }
    request.visibleAttempted = true;
    this.emit();
  }

  clearVisibleAttempted(captureId: string): void {
    const request = this.requests.get(captureId);
    if (!request || !request.visibleAttempted) {
      return;
    }
    request.visibleAttempted = false;
    this.compact(captureId, request);
    this.emit();
  }

  resetVisibleAttempts(): void {
    let didChange = false;
    for (const [captureId, request] of this.requests) {
      if (!request.visibleAttempted) {
        continue;
      }
      request.visibleAttempted = false;
      this.compact(captureId, request);
      didChange = true;
    }
    if (didChange) {
      this.emit();
    }
  }

  markVisibleInFlight(captureId: string): void {
    const request = this.ensureRequest(captureId);
    if (request.visibleInFlight) {
      return;
    }
    request.visibleInFlight = true;
    this.emit();
  }

  finishVisible(captureId: string): void {
    const request = this.requests.get(captureId);
    if (!request || !request.visibleInFlight) {
      return;
    }
    request.visibleInFlight = false;
    this.compact(captureId, request);
    this.emit();
  }

  startHiddenAttempt(captureId: string, attempt: TAttempt): boolean {
    const request = this.ensureRequest(captureId);
    if (request.hiddenAttempt) {
      return false;
    }
    request.hiddenAttempt = attempt;
    this.emit();
    return true;
  }

  finishHiddenAttempt(captureId: string, attempt: TAttempt): void {
    const request = this.requests.get(captureId);
    if (!request || request.hiddenAttempt !== attempt) {
      return;
    }
    request.hiddenAttempt = null;
    this.compact(captureId, request);
    this.emit();
  }

  abortHiddenAttempt(captureId: string): void {
    const request = this.requests.get(captureId);
    if (!request || !request.hiddenAttempt) {
      return;
    }
    this.disposeHiddenAttempt(request);
    this.compact(captureId, request);
    this.emit();
  }

  abortAttemptsForVideo(sourceVideo: HTMLVideoElement | null): void {
    if (!sourceVideo) {
      return;
    }

    let didChange = false;
    for (const [captureId, request] of this.requests) {
      if (request.hiddenAttempt?.sourceVideo !== sourceVideo) {
        continue;
      }
      this.disposeHiddenAttempt(request);
      this.compact(captureId, request);
      didChange = true;
    }
    if (didChange) {
      this.emit();
    }
  }

  disposeAll(): void {
    let didChange = false;
    for (const [captureId, request] of Array.from(this.requests.entries())) {
      didChange =
        didChange ||
        request.tracked ||
        request.visibleAttempted ||
        request.visibleInFlight ||
        Boolean(request.hiddenAttempt);
      request.tracked = false;
      request.visibleAttempted = false;
      request.visibleInFlight = false;
      this.disposeHiddenAttempt(request);
      this.requests.delete(captureId);
    }
    if (didChange) {
      this.emit();
    }
  }

  hasTracked(captureId: string): boolean {
    return this.requests.get(captureId)?.tracked === true;
  }

  hasVisibleAttempted(captureId: string): boolean {
    return this.requests.get(captureId)?.visibleAttempted === true;
  }

  hasVisibleInFlight(captureId: string): boolean {
    return this.requests.get(captureId)?.visibleInFlight === true;
  }

  hasHiddenAttempt(captureId: string): boolean {
    return Boolean(this.requests.get(captureId)?.hiddenAttempt);
  }

  getTrackedIds(): string[] {
    return Array.from(this.requests.entries())
      .filter(([, request]) => request.tracked)
      .map(([captureId]) => captureId);
  }

  private ensureRequest(captureId: string): VideoScreenshotPreparationRequestState<TAttempt> {
    const existing = this.requests.get(captureId);
    if (existing) {
      return existing;
    }
    const created: VideoScreenshotPreparationRequestState<TAttempt> = {
      tracked: false,
      visibleAttempted: false,
      visibleInFlight: false,
      hiddenAttempt: null
    };
    this.requests.set(captureId, created);
    return created;
  }

  private disposeHiddenAttempt(request: VideoScreenshotPreparationRequestState<TAttempt>): void {
    request.hiddenAttempt?.scope.dispose();
    request.hiddenAttempt = null;
  }

  private compact(
    captureId: string,
    request: VideoScreenshotPreparationRequestState<TAttempt> | undefined = this.requests.get(
      captureId
    )
  ): void {
    if (!request) {
      return;
    }
    if (
      request.tracked ||
      request.visibleAttempted ||
      request.visibleInFlight ||
      request.hiddenAttempt
    ) {
      return;
    }
    this.requests.delete(captureId);
  }

  private emit(): void {
    this.onStateChange?.({
      trackedCaptureIds: this.collectIds((request) => request.tracked),
      visibleAttemptedIds: this.collectIds((request) => request.visibleAttempted),
      inFlightVisibleIds: this.collectIds((request) => request.visibleInFlight),
      hiddenDuplicateAttemptIds: this.collectIds((request) => request.hiddenAttempt !== null)
    });
  }

  private collectIds(
    predicate: (request: VideoScreenshotPreparationRequestState<TAttempt>) => boolean
  ): string[] {
    return Array.from(this.requests.entries())
      .filter(([, request]) => predicate(request))
      .map(([captureId]) => captureId);
  }
}

export class VideoScreenshotPreparationCoordinator {
  private queue: VideoScreenshotPreparationQueue | null = null;
  private queuePromise: Promise<VideoScreenshotPreparationQueue | null> | null = null;
  private generation = 0;
  private disposed = false;
  private readonly cache = new Map<string, VideoCaptureScreenshot>();

  constructor(private readonly args: VideoScreenshotPreparationCoordinatorArgs) {}

  handleVideoElementChange(element: HTMLVideoElement | null): void {
    if (this.queue) {
      this.queue.handleVideoElementChange(element);
      return;
    }
    this.requestPendingScreenshots();
  }

  cacheRequestedScreenshot(id: string): void {
    const capture = this.findCapture(id);
    if (capture?.screenshot) {
      this.cache.set(id, capture.screenshot);
    }
  }

  async prepareRequestedScreenshot(id: string): Promise<void> {
    const capture = this.findPendingCapture(id);
    if (!capture) {
      return;
    }

    const cachedScreenshot = this.cache.get(id);
    if (cachedScreenshot) {
      setRequestedTimestampScreenshot(capture, cachedScreenshot);
      this.args.syncPanel();
      return;
    }

    const queue = await this.ensureQueue();
    if (queue && this.findPendingCapture(id)) {
      queue.request(id);
    }
  }

  requestPendingScreenshots(): void {
    if (!this.hasPendingCaptures()) {
      return;
    }
    void this.requestAllPendingScreenshots().catch((error) => {
      console.warn('[VideoSession] Failed to request pending screenshots:', error);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.queue?.dispose();
    this.queue = null;
    this.queuePromise = null;
    this.cache.clear();
  }

  private async requestAllPendingScreenshots(): Promise<void> {
    if (!this.hasPendingCaptures()) {
      return;
    }
    const queue = await this.ensureQueue();
    queue?.requestAll();
  }

  private async ensureQueue(): Promise<VideoScreenshotPreparationQueue | null> {
    if (this.disposed) {
      return null;
    }
    if (this.queue) {
      return this.queue;
    }
    if (this.queuePromise) {
      return this.queuePromise;
    }

    const generation = this.generation;
    this.queuePromise = import('./videoScreenshotPreparationQueue')
      .then(({ createVideoScreenshotPreparationQueue }) => {
        if (this.disposed || generation !== this.generation) {
          return null;
        }

        const queue = createVideoScreenshotPreparationQueue({
          doc: this.args.doc,
          getCaptures: this.args.getCaptures,
          getVisibleVideo: this.args.getVisibleVideo,
          syncPanel: this.args.syncPanel
        });

        if (this.disposed || generation !== this.generation) {
          queue.dispose();
          return null;
        }

        this.queue = queue;
        queue.handleVideoElementChange(this.args.getVisibleVideo());
        return queue;
      })
      .finally(() => {
        this.queuePromise = null;
      });

    return this.queuePromise;
  }

  private hasPendingCaptures(): boolean {
    return this.args.getCaptures().some((capture) => this.isPendingCapture(capture));
  }

  private findPendingCapture(id: string): VideoTimestampCapture | null {
    const capture = this.findCapture(id);
    return capture && this.isPendingCapture(capture) ? capture : null;
  }

  private findCapture(id: string): VideoTimestampCapture | null {
    return this.args.getCaptures().find((capture) => capture.id === id) ?? null;
  }

  private isPendingCapture(capture: VideoTimestampCapture): boolean {
    return hasRequestedTimestampScreenshot(capture) && !capture.screenshot;
  }
}
