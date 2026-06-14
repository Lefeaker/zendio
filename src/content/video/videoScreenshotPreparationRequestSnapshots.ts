export interface VideoScreenshotPreparationQueueStateSnapshot {
  trackedCaptureIds: string[];
  visibleAttemptedIds: string[];
  inFlightVisibleIds: string[];
  hiddenDuplicateAttemptIds: string[];
}

interface VideoScreenshotPreparationRequestSnapshotState {
  tracked: boolean;
  visibleAttempted: boolean;
  visibleInFlight: boolean;
  hiddenAttempt: unknown | null;
}

export function collectVideoScreenshotPreparationRequestIds<
  TRequest extends VideoScreenshotPreparationRequestSnapshotState
>(requests: Iterable<[string, TRequest]>, predicate: (request: TRequest) => boolean): string[] {
  return Array.from(requests)
    .filter(([, request]) => predicate(request))
    .map(([captureId]) => captureId);
}

export function createVideoScreenshotPreparationQueueStateSnapshot<
  TRequest extends VideoScreenshotPreparationRequestSnapshotState
>(requests: Iterable<[string, TRequest]>): VideoScreenshotPreparationQueueStateSnapshot {
  const entries = Array.from(requests);
  return {
    trackedCaptureIds: collectVideoScreenshotPreparationRequestIds(
      entries,
      (request) => request.tracked
    ),
    visibleAttemptedIds: collectVideoScreenshotPreparationRequestIds(
      entries,
      (request) => request.visibleAttempted
    ),
    inFlightVisibleIds: collectVideoScreenshotPreparationRequestIds(
      entries,
      (request) => request.visibleInFlight
    ),
    hiddenDuplicateAttemptIds: collectVideoScreenshotPreparationRequestIds(
      entries,
      (request) => request.hiddenAttempt !== null
    )
  };
}
