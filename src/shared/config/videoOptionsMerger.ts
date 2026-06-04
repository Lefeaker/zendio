import type { StoredOptions, VideoOptions } from '../types';
import { DEFAULT_OPTIONS } from './defaultOptions';

export function mergeVideoOptions(source?: StoredOptions['video']): VideoOptions | undefined {
  const defaults = DEFAULT_OPTIONS.video;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  const legacy = base as typeof base & {
    controlBarAutoPauseEnabled?: boolean;
    controlBarCaptureScreenshotEnabled?: boolean;
  };
  const merged: VideoOptions = {
    floatingPromptEnabled: base.floatingPromptEnabled ?? defaults?.floatingPromptEnabled ?? true,
    promptButtonLabel:
      (base.promptButtonLabel ?? defaults?.promptButtonLabel ?? '').trim() ||
      defaults?.promptButtonLabel ||
      '开启视频笔记',
    promptShortcut:
      (base.promptShortcut ?? defaults?.promptShortcut ?? '').trim() ||
      defaults?.promptShortcut ||
      'Alt+V',
    controlBarAutoPause:
      base.controlBarAutoPause ??
      legacy.controlBarAutoPauseEnabled ??
      defaults?.controlBarAutoPause ??
      true,
    controlBarScreenshot:
      base.controlBarScreenshot ??
      legacy.controlBarCaptureScreenshotEnabled ??
      defaults?.controlBarScreenshot ??
      true,
    commentEditorAutoPause: base.commentEditorAutoPause ?? defaults?.commentEditorAutoPause ?? false
  };
  const promptPosition = base.promptPosition ?? defaults?.promptPosition;
  if (promptPosition) {
    merged.promptPosition = {
      x: Number(promptPosition.x) || 0,
      y: Number(promptPosition.y) || 0
    };
  }
  return merged;
}
