export interface VideoScreenshotPreparationAttemptLike {
  sourceVideo: HTMLVideoElement;
  scope: {
    dispose(): void;
  };
}

export interface VideoScreenshotPreparationRequestState<
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

export function createVideoScreenshotPreparationRequestState<
  TAttempt extends VideoScreenshotPreparationAttemptLike
>(): VideoScreenshotPreparationRequestState<TAttempt> {
  return {
    tracked: false,
    hiddenAttemptCount: 0,
    hiddenRetryAvailableAt: 0,
    hiddenTerminalFailed: false,
    explicitVisible: false,
    visibleAttempted: false,
    visibleInFlight: false,
    hiddenAttempt: null
  };
}

export function resetVideoScreenshotHiddenProgress<
  TAttempt extends VideoScreenshotPreparationAttemptLike
>(request: VideoScreenshotPreparationRequestState<TAttempt>): void {
  request.hiddenAttemptCount = 0;
  request.hiddenRetryAvailableAt = 0;
  request.hiddenTerminalFailed = false;
}

export function resetVideoScreenshotPreparationRequestState<
  TAttempt extends VideoScreenshotPreparationAttemptLike
>(request: VideoScreenshotPreparationRequestState<TAttempt>): void {
  request.tracked = false;
  resetVideoScreenshotHiddenProgress(request);
  request.explicitVisible = false;
  request.visibleAttempted = false;
  request.visibleInFlight = false;
}

export function disposeVideoScreenshotHiddenAttempt<
  TAttempt extends VideoScreenshotPreparationAttemptLike
>(request: VideoScreenshotPreparationRequestState<TAttempt>): void {
  request.hiddenAttempt?.scope.dispose();
  request.hiddenAttempt = null;
}

export function recordVideoScreenshotHiddenAttemptFailure<
  TAttempt extends VideoScreenshotPreparationAttemptLike
>(
  request: VideoScreenshotPreparationRequestState<TAttempt> | undefined,
  options: VideoScreenshotHiddenAttemptFailureOptions
): VideoScreenshotHiddenAttemptFailureResult {
  if (!request?.tracked) {
    return 'ignored';
  }

  if (request.hiddenAttemptCount >= Math.max(1, options.maxAttempts)) {
    request.hiddenTerminalFailed = true;
    request.hiddenRetryAvailableAt = 0;
    return 'terminal';
  }

  request.hiddenRetryAvailableAt = Math.max(0, options.retryAvailableAt);
  return 'retry';
}

export function canStartVideoScreenshotHiddenAttempt<
  TAttempt extends VideoScreenshotPreparationAttemptLike
>(request: VideoScreenshotPreparationRequestState<TAttempt> | undefined, now: number): boolean {
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

export function getNextVideoScreenshotHiddenRetryAt<
  TAttempt extends VideoScreenshotPreparationAttemptLike
>(
  requests: Iterable<VideoScreenshotPreparationRequestState<TAttempt>>,
  now: number
): number | null {
  let retryAt: number | null = null;
  for (const request of requests) {
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

export function shouldRetainVideoScreenshotPreparationRequest<
  TAttempt extends VideoScreenshotPreparationAttemptLike
>(request: VideoScreenshotPreparationRequestState<TAttempt>): boolean {
  return (
    request.tracked ||
    request.hiddenAttemptCount > 0 ||
    request.hiddenRetryAvailableAt > 0 ||
    request.hiddenTerminalFailed ||
    request.explicitVisible ||
    request.visibleAttempted ||
    request.visibleInFlight ||
    request.hiddenAttempt !== null
  );
}
