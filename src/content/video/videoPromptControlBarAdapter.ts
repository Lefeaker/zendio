import type {
  VideoControlBarNotePayload,
  VideoControlBarPreferences
} from './videoControlBarButton';
import type { VideoPromptSessionLike } from './videoPromptDependencies';

export function pauseActiveVideoForControlBar(doc: Document): void {
  const video = doc.querySelector('video');
  try {
    video?.pause();
  } catch {
    // Some host players wrap native controls; saving still works on submit.
  }
}

export function resumeActiveVideoForControlBar(doc: Document): void {
  const video = doc.querySelector('video');
  try {
    void video?.play().catch(() => undefined);
  } catch {
    // Host players may block scripted playback; dismissing the popover should not break capture.
  }
}

export function toControlBarCaptureOptions(
  preferences: VideoControlBarPreferences,
  payload?: VideoControlBarNotePayload
): Parameters<NonNullable<VideoPromptSessionLike['addCurrentTimestamp']>>[1] {
  if (!payload) {
    return {
      pauseVideo: preferences.autoPauseEnabled,
      captureScreenshot: preferences.captureScreenshotEnabled,
      beginEditing: true,
      collapseAfterCapture: true
    };
  }

  return {
    comment: payload.comment,
    pauseVideo: false,
    captureScreenshot: preferences.captureScreenshotEnabled,
    beginEditing: false,
    resumePlayback: preferences.autoPauseEnabled,
    collapseAfterCapture: true
  };
}
