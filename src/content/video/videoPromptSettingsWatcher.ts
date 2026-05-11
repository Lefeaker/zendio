import type { VideoOptions } from '../../shared/types/options';
import type { VideoPromptDependencies } from './videoPromptDependencies';
import type { VideoControlBarPreferences } from './videoControlBarButton';
import {
  VIDEO_CONTROL_BAR_DEFAULT_PREFERENCES,
  VIDEO_PROMPT_DEFAULT_LABEL,
  VIDEO_PROMPT_DEFAULT_SHORTCUT
} from './videoPromptState';

export function resolvePromptLabel(value?: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : VIDEO_PROMPT_DEFAULT_LABEL;
}

export function resolvePromptShortcut(value?: string): string {
  const trimmed = value?.trim();
  const normalized = trimmed ? trimmed.toUpperCase() : '';
  return normalized.length > 0 ? normalized : VIDEO_PROMPT_DEFAULT_SHORTCUT;
}

export function resolveControlBarPreferences(video?: VideoOptions): VideoControlBarPreferences {
  return {
    autoPauseEnabled:
      video?.controlBarAutoPause ?? VIDEO_CONTROL_BAR_DEFAULT_PREFERENCES.autoPauseEnabled,
    captureScreenshotEnabled:
      video?.controlBarScreenshot ?? VIDEO_CONTROL_BAR_DEFAULT_PREFERENCES.captureScreenshotEnabled
  };
}

export function startVideoConfigWatcher(
  videoRepo: Pick<VideoPromptDependencies['videoRepo'], 'getVideoConfig' | 'onConfigChange'>,
  applyConfig: (config?: VideoOptions) => void
): () => void {
  void videoRepo
    .getVideoConfig()
    .then((config) => applyConfig(config))
    .catch(() => applyConfig(undefined));

  return videoRepo.onConfigChange((config) => {
    applyConfig(config);
  });
}

export function startLanguageWatcher(
  storage: VideoPromptDependencies['storage'],
  onLanguageChanged: () => void
): () => void {
  return storage.sync.watchKey<string>('language', () => {
    onLanguageChanged();
  });
}
