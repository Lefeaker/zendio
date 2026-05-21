import { DEFAULT_OPTIONS } from '../../shared/config';
import type { VideoControlBarPreferences } from './videoControlBarButton';
import type { PromptSide } from './videoPromptPosition';

export const VIDEO_PROMPT_ID = 'aiob-video-floating-prompt';
export const VIDEO_PROMPT_DEFAULT_LABEL = DEFAULT_OPTIONS.video?.promptButtonLabel ?? 'Clip video';
export const VIDEO_PROMPT_DEFAULT_SHORTCUT = DEFAULT_OPTIONS.video?.promptShortcut ?? '';
export const VIDEO_CONTROL_BAR_DEFAULT_PREFERENCES: VideoControlBarPreferences = {
  autoPauseEnabled: DEFAULT_OPTIONS.video?.controlBarAutoPause ?? true,
  captureScreenshotEnabled: DEFAULT_OPTIONS.video?.controlBarScreenshot ?? true
};
export const CONTROL_TARGET_RETRY_DELAYS_MS = [100, 250, 500, 1000] as const;

export type VideoPromptDebugState = {
  shouldShow: boolean;
  promptEnabled: boolean;
  promptSuppressed: boolean;
  isTopWindow: boolean;
  identityPlatform: string;
  hostSupported: boolean;
  videoDetected: boolean;
  isValidVideoPage: boolean;
  hasPromptElement: boolean;
  url: string;
  side: PromptSide;
  hasCustomPosition: boolean;
  storedTop: number;
  storedLeft: number;
  elementTop: number | null;
  elementLeft: number | null;
};

export type VideoPromptDebugCounters = {
  evaluateCount: number;
  controlButtonSyncCount: number;
  floatingPromptMountCount: number;
};

export function createVideoPromptDebugCounters(): VideoPromptDebugCounters {
  return {
    evaluateCount: 0,
    controlButtonSyncCount: 0,
    floatingPromptMountCount: 0
  };
}

export function resetVideoPromptDebugCounters(counters: VideoPromptDebugCounters): void {
  counters.evaluateCount = 0;
  counters.controlButtonSyncCount = 0;
  counters.floatingPromptMountCount = 0;
}
