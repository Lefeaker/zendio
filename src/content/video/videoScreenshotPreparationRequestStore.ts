import {
  collectVideoScreenshotPreparationRequestIds,
  createVideoScreenshotPreparationQueueStateSnapshot,
  type VideoScreenshotPreparationQueueStateSnapshot
} from './videoScreenshotPreparationRequestSnapshots';
import {
  canStartVideoScreenshotHiddenAttempt,
  createVideoScreenshotPreparationRequestState,
  disposeVideoScreenshotHiddenAttempt,
  getNextVideoScreenshotHiddenRetryAt,
  recordVideoScreenshotHiddenAttemptFailure,
  resetVideoScreenshotHiddenProgress,
  resetVideoScreenshotPreparationRequestState,
  shouldRetainVideoScreenshotPreparationRequest,
  type VideoScreenshotHiddenAttemptFailureOptions,
  type VideoScreenshotHiddenAttemptFailureResult,
  type VideoScreenshotPreparationAttemptLike,
  type VideoScreenshotPreparationRequestState
} from './videoScreenshotPreparationRequestState';

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
    resetVideoScreenshotHiddenProgress(request);
    this.emit();
  }

  trackAll(captureIds: Iterable<string>): void {
    let didChange = false;
    for (const captureId of captureIds) {
      const request = this.ensureRequest(captureId);
      if (!request.tracked) {
        request.tracked = true;
        resetVideoScreenshotHiddenProgress(request);
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
    resetVideoScreenshotPreparationRequestState(request);
    disposeVideoScreenshotHiddenAttempt(request);
    this.compact(captureId, request);
    this.emit();
  }

  pruneTracked(pendingIds: ReadonlySet<string>): void {
    let didChange = false;
    for (const [captureId, request] of Array.from(this.requests.entries())) {
      if (!request.tracked || pendingIds.has(captureId)) {
        continue;
      }
      resetVideoScreenshotPreparationRequestState(request);
      disposeVideoScreenshotHiddenAttempt(request);
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
    const result = recordVideoScreenshotHiddenAttemptFailure(this.requests.get(captureId), options);
    if (result !== 'ignored') {
      this.emit();
    }
    return result;
  }

  abortHiddenAttempt(captureId: string): void {
    const request = this.requests.get(captureId);
    if (!request || !request.hiddenAttempt) {
      return;
    }
    disposeVideoScreenshotHiddenAttempt(request);
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
      disposeVideoScreenshotHiddenAttempt(request);
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
      resetVideoScreenshotPreparationRequestState(request);
      disposeVideoScreenshotHiddenAttempt(request);
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
    return canStartVideoScreenshotHiddenAttempt(this.requests.get(captureId), now);
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
    return getNextVideoScreenshotHiddenRetryAt(this.requests.values(), now);
  }

  private ensureRequest(captureId: string): VideoScreenshotPreparationRequestState<TAttempt> {
    const existing = this.requests.get(captureId);
    if (existing) {
      return existing;
    }
    const created = createVideoScreenshotPreparationRequestState<TAttempt>();
    this.requests.set(captureId, created);
    return created;
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
    if (shouldRetainVideoScreenshotPreparationRequest(request)) {
      return;
    }
    this.requests.delete(captureId);
  }

  private emit(): void {
    this.onStateChange?.(createVideoScreenshotPreparationQueueStateSnapshot(this.requests));
  }
}
