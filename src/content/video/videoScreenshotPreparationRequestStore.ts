import {
  collectVideoScreenshotPreparationRequestIds,
  createVideoScreenshotPreparationQueueStateSnapshot,
  type VideoScreenshotPreparationQueueStateSnapshot
} from './videoScreenshotPreparationRequestSnapshots';

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
  hiddenAttemptCount: number;
  hiddenRetryAvailableAt: number;
  hiddenTerminalFailed: boolean;
  explicitVisible: boolean;
  visibleAttempted: boolean;
  visibleInFlight: boolean;
  hiddenAttempt: TAttempt | null;
}

export interface VideoScreenshotHiddenAttemptFailureOptions {
  maxAttempts: number;
  retryAvailableAt: number;
}

export type VideoScreenshotHiddenAttemptFailureResult = 'ignored' | 'retry' | 'terminal';

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
    const request = this.ensureRequest(captureId);
    request.tracked = true;
    this.resetHiddenProgress(request);
    this.emit();
  }

  trackAll(captureIds: Iterable<string>): void {
    let didChange = false;
    for (const captureId of captureIds) {
      const request = this.ensureRequest(captureId);
      if (!request.tracked) {
        request.tracked = true;
        this.resetHiddenProgress(request);
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
    this.resetRequestState(request);
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
      this.resetRequestState(request);
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

  markExplicitVisible(captureId: string): void {
    const request = this.ensureRequest(captureId);
    if (request.explicitVisible) {
      return;
    }
    request.explicitVisible = true;
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
    if (request.hiddenAttempt || request.hiddenTerminalFailed) {
      return false;
    }
    request.hiddenAttemptCount += 1;
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

  recordHiddenAttemptFailure(
    captureId: string,
    options: VideoScreenshotHiddenAttemptFailureOptions
  ): VideoScreenshotHiddenAttemptFailureResult {
    const request = this.requests.get(captureId);
    if (!request || !request.tracked) {
      return 'ignored';
    }

    if (request.hiddenAttemptCount >= Math.max(1, options.maxAttempts)) {
      request.hiddenTerminalFailed = true;
      request.hiddenRetryAvailableAt = 0;
      this.emit();
      return 'terminal';
    }

    request.hiddenRetryAvailableAt = Math.max(0, options.retryAvailableAt);
    this.emit();
    return 'retry';
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
        request.hiddenAttemptCount > 0 ||
        request.hiddenRetryAvailableAt > 0 ||
        request.hiddenTerminalFailed ||
        request.explicitVisible ||
        request.visibleAttempted ||
        request.visibleInFlight ||
        Boolean(request.hiddenAttempt);
      this.resetRequestState(request);
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
  hasHiddenAttempted(captureId: string): boolean {
    return (this.requests.get(captureId)?.hiddenAttemptCount ?? 0) > 0;
  }
  hasExplicitVisible(captureId: string): boolean {
    return this.requests.get(captureId)?.explicitVisible === true;
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

  canStartHiddenAttempt(captureId: string, now: number): boolean {
    const request = this.requests.get(captureId);
    if (!request) {
      return false;
    }
    return (
      request.tracked &&
      request.hiddenAttempt === null &&
      !request.hiddenTerminalFailed &&
      !request.visibleInFlight &&
      request.hiddenRetryAvailableAt <= now
    );
  }

  getHiddenAttemptCount(): number {
    return collectVideoScreenshotPreparationRequestIds(
      this.requests,
      (request) => request.hiddenAttempt !== null
    ).length;
  }
  getTrackedIds(): string[] {
    return collectVideoScreenshotPreparationRequestIds(this.requests, (request) => request.tracked);
  }

  getNextHiddenRetryAt(now: number): number | null {
    let retryAt: number | null = null;
    for (const request of this.requests.values()) {
      if (
        !request.tracked ||
        request.hiddenAttempt !== null ||
        request.hiddenTerminalFailed ||
        request.hiddenRetryAvailableAt <= now
      ) {
        continue;
      }
      retryAt =
        retryAt === null
          ? request.hiddenRetryAvailableAt
          : Math.min(retryAt, request.hiddenRetryAvailableAt);
    }
    return retryAt;
  }

  private ensureRequest(captureId: string): VideoScreenshotPreparationRequestState<TAttempt> {
    const existing = this.requests.get(captureId);
    if (existing) {
      return existing;
    }
    const created: VideoScreenshotPreparationRequestState<TAttempt> = {
      tracked: false,
      hiddenAttemptCount: 0,
      hiddenRetryAvailableAt: 0,
      hiddenTerminalFailed: false,
      explicitVisible: false,
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

  private resetRequestState(request: VideoScreenshotPreparationRequestState<TAttempt>): void {
    request.tracked = false;
    this.resetHiddenProgress(request);
    request.explicitVisible = false;
    request.visibleAttempted = false;
    request.visibleInFlight = false;
  }

  private resetHiddenProgress(request: VideoScreenshotPreparationRequestState<TAttempt>): void {
    request.hiddenAttemptCount = 0;
    request.hiddenRetryAvailableAt = 0;
    request.hiddenTerminalFailed = false;
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
      request.hiddenAttemptCount > 0 ||
      request.hiddenRetryAvailableAt > 0 ||
      request.hiddenTerminalFailed ||
      request.explicitVisible ||
      request.visibleAttempted ||
      request.visibleInFlight ||
      request.hiddenAttempt
    ) {
      return;
    }
    this.requests.delete(captureId);
  }

  private emit(): void {
    this.onStateChange?.(createVideoScreenshotPreparationQueueStateSnapshot(this.requests));
  }
}
