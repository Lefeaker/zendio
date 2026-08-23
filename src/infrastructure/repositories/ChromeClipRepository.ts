import type {
  IClipRepository,
  ClipData,
  ClipResult,
  FragmentConfig
} from '../../shared/repositories/IClipRepository';
import type { IOptionsRepository, IMessagingRepository } from '../../shared/repositories';
import type { TemplateOptions } from '../../shared/types/options';
import type { OptionsPatch } from '../../shared/types/optionsMutationMessages';

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
    const patches: OptionsPatch[] = [];
    if (config.useFootnoteFormat !== undefined) {
      patches.push({
        path: ['fragmentClipper', 'useFootnoteFormat'],
        value: config.useFootnoteFormat
      });
    }
    if (config.captureContext !== undefined) {
      patches.push({
        path: ['fragmentClipper', 'captureContext'],
        value: config.captureContext
      });
    }
    if (config.contextLength !== undefined) {
      patches.push({ path: ['fragmentClipper', 'contextLength'], value: config.contextLength });
    }
    if (config.contextMode !== undefined) {
      patches.push({ path: ['fragmentClipper', 'contextMode'], value: config.contextMode });
    }
    if (config.selectionTriggerMode !== undefined) {
      patches.push({
        path: ['fragmentClipper', 'selectionTriggerMode'],
        value: config.selectionTriggerMode
      });
    }
    if (config.selectionModifierKeys !== undefined) {
      patches.push({
        path: ['fragmentClipper', 'selectionModifierKeys'],
        value: [...config.selectionModifierKeys]
      });
    }
    if (config.keyboardShortcutsEnabled !== undefined) {
      patches.push({
        path: ['fragmentClipper', 'keyboardShortcutsEnabled'],
        value: config.keyboardShortcutsEnabled
      });
    }
    if (patches.length > 0) await this.optionsRepo.patch(patches);
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
        error: error instanceof Error ? error.message : 'CLIP_REPOSITORY_UNKNOWN_ERROR'
      };
    }
  }

  onConfigChange(callback: (config: FragmentConfig) => void): () => void {
    return this.optionsRepo.onChange((options) => {
      callback(clone(options.fragmentClipper));
    });
  }
}
