import type {
  IClipRepository,
  ClipData,
  ClipResult,
  FragmentConfig
} from '../../shared/repositories/IClipRepository';
import type { IOptionsRepository, IMessagingRepository } from '../../shared/repositories';
import type { TemplateOptions } from '../../shared/types/options';

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 基于 Chrome 环境的 Clip Repository 实现。
 *
 * - 通过 IOptionsRepository 读取/更新配置
 * - 通过 IMessagingRepository 向背景页发送剪藏
 */
export class ChromeClipRepository implements IClipRepository {
  constructor(
    private readonly optionsRepo: IOptionsRepository,
    private readonly messagingRepo: IMessagingRepository
  ) {}

  async getFragmentConfig(): Promise<FragmentConfig> {
    const options = await this.optionsRepo.get();
    return clone(options.fragmentClipper);
  }

  async setFragmentConfig(config: Partial<FragmentConfig>): Promise<void> {
    const current = await this.getFragmentConfig();
    await this.optionsRepo.set({
      fragmentClipper: {
        ...current,
        ...config
      }
    });
  }

  async getTemplateConfig(): Promise<TemplateOptions> {
    const options = await this.optionsRepo.get();
    return clone(options.templates);
  }

  async sendClip(clip: ClipData): Promise<ClipResult> {
    try {
      return await this.messagingRepo.send<ClipResult>({
        type: 'clip',
        data: clip
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  onConfigChange(callback: (config: FragmentConfig) => void): () => void {
    return this.optionsRepo.onChange((options) => {
      callback(clone(options.fragmentClipper));
    });
  }
}
