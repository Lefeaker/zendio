import type {
  VideoControlBarNotePayload,
  VideoControlBarPreferences
} from './videoControlBarButton';
import type { VideoPromptSessionLike } from './videoPromptDependencies';

export interface VideoControlBarPlaybackLease {
  release(options: { restorePlayback: boolean }): void;
}

const NOOP_PLAYBACK_LEASE: VideoControlBarPlaybackLease = {
  release: () => undefined
};

export function acquireControlBarPlaybackLease(doc: Document): VideoControlBarPlaybackLease {
  const video = doc.querySelector('video');
  if (!video) {
    return NOOP_PLAYBACK_LEASE;
  }

  const wasPlaying = !video.paused;
  let released = false;
  const handlePlay = (): void => {
    try {
      video.pause();
    } catch {
      // Host players may wrap media methods; keep the lease alive until release.
    }
  };

  video.addEventListener('play', handlePlay, true);
  if (wasPlaying) {
    try {
      video.pause();
    } catch {
      // Some host players wrap native controls; saving still works on submit.
    }
  }

  return {
    release({ restorePlayback }) {
      if (released) {
        return;
      }
      released = true;
      video.removeEventListener('play', handlePlay, true);
      if (!restorePlayback || !wasPlaying) {
        return;
      }
      try {
        void video.play().catch(() => undefined);
      } catch {
        // Host players may block scripted playback; capture should still complete.
      }
    }
  };
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
    resumePlayback: false,
    collapseAfterCapture: true
  };
}
