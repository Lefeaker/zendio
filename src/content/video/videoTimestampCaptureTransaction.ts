import { setRequestedTimestampScreenshot } from './screenshotIntent';
import type { VideoTimestampCapture } from './types';
import type { VideoSessionPlaybackEditLeasePort } from './videoSessionRuntimePorts';

interface VideoTimestampCaptureInput {
  video: HTMLVideoElement;
  currentTime: number;
  shareUrl: string;
  comment?: string | undefined;
  captureScreenshot?: boolean | undefined;
}

interface VideoTimestampCaptureTransactionContext {
  state: {
    captures: Array<{ id: string }>;
  };
  dom: {
    stopEditing(captureId?: string): void;
  };
  playbackEditLease?: Pick<VideoSessionPlaybackEditLeasePort, 'release'>;
  syncPanel(): void;
  applyHint(state: 'failure'): void;
}

export function createVideoTimestampCapture(
  input: VideoTimestampCaptureInput
): VideoTimestampCapture {
  const now = Date.now();
  const capture: VideoTimestampCapture = {
    kind: 'timestamp',
    id: `aiob-video-${now}-${Math.random().toString(16).slice(2)}`,
    timeSec: input.currentTime,
    comment: input.comment?.trim() ?? '',
    url: input.shareUrl,
    createdAt: now
  };
  if (input.captureScreenshot) {
    setRequestedTimestampScreenshot(capture, null);
  }
  return capture;
}

export function rollbackVideoTimestampCaptureMutation(
  context: VideoTimestampCaptureTransactionContext,
  capture: VideoTimestampCapture,
  releasePlaybackLease: boolean
): void {
  const captureIndex = context.state.captures.findIndex((item) => item.id === capture.id);
  if (captureIndex !== -1) {
    context.state.captures.splice(captureIndex, 1);
  }
  if (releasePlaybackLease) {
    context.playbackEditLease?.release(capture.id, true);
  }
  context.dom.stopEditing(capture.id);
  context.syncPanel();
  context.applyHint('failure');
}
