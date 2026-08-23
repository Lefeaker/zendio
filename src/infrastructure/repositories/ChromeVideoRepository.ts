import type { IVideoRepository, VideoClipData } from '../../shared/repositories/IVideoRepository';
import type { IOptionsRepository, IMessagingRepository } from '../../shared/repositories';
import type { VideoOptions } from '../../shared/types/options';
import type { ClipResult } from '../../shared/repositories/IClipRepository';

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Chrome 环境下的视频仓库实现
 *
 * - 通过 IOptionsRepository 维护视频配置及浮层位置
 * - 通过 IMessagingRepository 发送视频剪藏消息
 */
export class ChromeVideoRepository implements IVideoRepository {
  constructor(
    private readonly optionsRepo: IOptionsRepository,
    private readonly messagingRepo: IMessagingRepository
  ) {}

  async getVideoConfig(): Promise<VideoOptions> {
    const options = await this.optionsRepo.get();
    return clone(options.video);
  }

  async savePromptPosition(position: { x: number; y: number }): Promise<void> {
    await this.optionsRepo.patch({
      path: ['video', 'promptPosition'],
      value: position
    });
  }

  async saveControlBarPreferences(preferences: {
    autoPauseEnabled: boolean;
    captureScreenshotEnabled: boolean;
  }): Promise<void> {
    await this.optionsRepo.patch([
      {
        path: ['video', 'controlBarAutoPause'],
        value: preferences.autoPauseEnabled
      },
      {
        path: ['video', 'controlBarScreenshot'],
        value: preferences.captureScreenshotEnabled
      }
    ]);
  }

  async getPromptPosition(): Promise<{ x: number; y: number } | null> {
    const config = await this.getVideoConfig();
    return config.promptPosition ? { ...config.promptPosition } : null;
  }

  async sendVideoClip(clip: VideoClipData): Promise<ClipResult> {
    try {
      return await this.messagingRepo.send<ClipResult>({
        type: 'videoClip',
        data: clip
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'VIDEO_REPOSITORY_UNKNOWN_ERROR',
        failureCategory: 'connection'
      };
    }
  }

  onConfigChange(callback: (config: VideoOptions) => void): () => void {
    return this.optionsRepo.onChange((options) => {
      callback(clone(options.video));
    });
  }
}
