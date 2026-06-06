import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';
import type { ClipResult } from '@shared/repositories/IClipRepository';
import type { IVideoRepository, VideoClipData } from '@shared/repositories/IVideoRepository';
import type { VideoOptions } from '@shared/types/options';

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

const DEFAULT_VIDEO_OPTIONS: VideoOptions = clone(
  DEFAULT_OPTIONS.video ?? {
    floatingPromptEnabled: true,
    promptButtonLabel: '开启视频笔记',
    promptShortcut: 'Alt+V',
    controlBarAutoPause: true,
    controlBarScreenshot: true,
    commentEditorAutoPause: false,
    screenshotAttachment: {
      locationTemplate: './assets/${noteFileName}',
      fileNameTemplate: "file-${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}.jpg",
      markdownUrlFormat: ''
    }
  }
);

export class MockVideoRepository implements IVideoRepository {
  private videoConfig: VideoOptions = clone(DEFAULT_VIDEO_OPTIONS);
  private listeners = new Set<(config: VideoOptions) => void>();

  public sentClips: VideoClipData[] = [];
  public mockClipResult: ClipResult = { success: true };

  getVideoConfig(): Promise<VideoOptions> {
    return Promise.resolve(clone(this.videoConfig));
  }

  savePromptPosition(position: { x: number; y: number }): Promise<void> {
    this.videoConfig = {
      ...this.videoConfig,
      promptPosition: { ...position }
    };
    this.emitConfigChange();
    return Promise.resolve();
  }

  saveControlBarPreferences(preferences: {
    autoPauseEnabled: boolean;
    captureScreenshotEnabled: boolean;
  }): Promise<void> {
    this.videoConfig = {
      ...this.videoConfig,
      controlBarAutoPause: preferences.autoPauseEnabled,
      controlBarScreenshot: preferences.captureScreenshotEnabled
    };
    this.emitConfigChange();
    return Promise.resolve();
  }

  getPromptPosition(): Promise<{ x: number; y: number } | null> {
    if (!this.videoConfig.promptPosition) {
      return Promise.resolve<{ x: number; y: number } | null>(null);
    }
    return Promise.resolve<{ x: number; y: number } | null>({ ...this.videoConfig.promptPosition });
  }

  sendVideoClip(clip: VideoClipData): Promise<ClipResult> {
    this.sentClips.push(clone(clip));
    return Promise.resolve(clone(this.mockClipResult));
  }

  onConfigChange(callback: (config: VideoOptions) => void): () => void {
    this.listeners.add(callback);
    callback(clone(this.videoConfig));
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * ===== 测试辅助方法 =====
   */
  reset(): void {
    this.videoConfig = clone(DEFAULT_VIDEO_OPTIONS);
    this.sentClips = [];
    this.mockClipResult = { success: true };
    this.listeners.clear();
  }

  setMockVideoConfig(config: Partial<VideoOptions>): void {
    this.videoConfig = {
      ...this.videoConfig,
      ...clone(config)
    };
    this.emitConfigChange();
  }

  setMockResult(result: ClipResult): void {
    this.mockClipResult = clone(result);
  }

  private emitConfigChange(): void {
    const snapshot = clone(this.videoConfig);
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('[MockVideoRepository] listener error', error);
      }
    });
  }
}
