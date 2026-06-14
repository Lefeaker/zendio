import type { VideoTimestampCapture } from './types';

interface HiddenDuplicateRequestStorePort {
  getHiddenAttemptCount(): number;
  hasHiddenAttempt(captureId: string): boolean;
  hasHiddenAttempted(captureId: string): boolean;
  hasVisibleInFlight(captureId: string): boolean;
}

interface ScheduleHiddenDuplicateCapturesArgs {
  captures: VideoTimestampCapture[];
  sourceVideo: HTMLVideoElement;
  sourceUrl: string;
  maxConcurrency: number | undefined;
  requestStore: HiddenDuplicateRequestStorePort;
  enqueue: (sourceVideo: HTMLVideoElement, sourceUrl: string, captureId: string) => void;
}

export function scheduleHiddenDuplicateCaptures({
  captures,
  sourceVideo,
  sourceUrl,
  maxConcurrency,
  requestStore,
  enqueue
}: ScheduleHiddenDuplicateCapturesArgs): void {
  let availableSlots = Math.max(1, maxConcurrency ?? 2) - requestStore.getHiddenAttemptCount();
  for (const capture of captures) {
    if (
      requestStore.hasHiddenAttempt(capture.id) ||
      requestStore.hasHiddenAttempted(capture.id) ||
      requestStore.hasVisibleInFlight(capture.id)
    ) {
      continue;
    }
    if (availableSlots <= 0) {
      break;
    }
    enqueue(sourceVideo, sourceUrl, capture.id);
    availableSlots -= 1;
  }
}
