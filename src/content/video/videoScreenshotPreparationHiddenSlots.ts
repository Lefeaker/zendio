import type { VideoTimestampCapture } from './types';

interface HiddenDuplicateRequestStorePort {
  getHiddenAttemptCount(): number;
  canStartHiddenAttempt(captureId: string, now: number): boolean;
}

interface ScheduleHiddenDuplicateCapturesArgs {
  captures: VideoTimestampCapture[];
  sourceVideo: HTMLVideoElement;
  sourceUrl: string;
  maxConcurrency: number | undefined;
  now: number;
  requestStore: HiddenDuplicateRequestStorePort;
  enqueue: (sourceVideo: HTMLVideoElement, sourceUrl: string, captureId: string) => void;
}

export function scheduleHiddenDuplicateCaptures({
  captures,
  sourceVideo,
  sourceUrl,
  maxConcurrency,
  now,
  requestStore,
  enqueue
}: ScheduleHiddenDuplicateCapturesArgs): void {
  let availableSlots = Math.max(1, maxConcurrency ?? 2) - requestStore.getHiddenAttemptCount();
  for (const capture of captures) {
    if (!requestStore.canStartHiddenAttempt(capture.id, now)) {
      continue;
    }
    if (availableSlots <= 0) {
      break;
    }
    enqueue(sourceVideo, sourceUrl, capture.id);
    availableSlots -= 1;
  }
}
