import type {
  IClipRepository,
  ClipData,
  ClipResult,
  FragmentConfig
} from '@shared/repositories/IClipRepository';
import { configProvider } from '@shared/config';
import type { TemplateOptions } from '@shared/types/options';

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 纯内存实现的 Clip Repository，供测试使用。
 */
export class MockClipRepository implements IClipRepository {
  private fragmentConfig: FragmentConfig = clone(configProvider.getFragmentClipperDefaults());
  private templateConfig: TemplateOptions = clone(configProvider.getTemplates());
  private listeners = new Set<(config: FragmentConfig) => void>();

  public sentClips: ClipData[] = [];
  public mockClipResult: ClipResult = { success: true, filePath: '/mock/path.md' };

  getFragmentConfig(): Promise<FragmentConfig> {
    return Promise.resolve(clone(this.fragmentConfig));
  }

  setFragmentConfig(config: Partial<FragmentConfig>): Promise<void> {
    this.fragmentConfig = {
      ...this.fragmentConfig,
      ...config
    };
    this.emitConfigChange();
    return Promise.resolve();
  }

  getTemplateConfig(): Promise<TemplateOptions> {
    return Promise.resolve(clone(this.templateConfig));
  }

  sendClip(clip: ClipData): Promise<ClipResult> {
    this.sentClips.push(clone(clip));
    return Promise.resolve(clone(this.mockClipResult));
  }

  onConfigChange(callback: (config: FragmentConfig) => void): () => void {
    this.listeners.add(callback);
    callback(clone(this.fragmentConfig));
    return () => {
      this.listeners.delete(callback);
    };
  }

  reset(): void {
    this.fragmentConfig = clone(configProvider.getFragmentClipperDefaults());
    this.templateConfig = clone(configProvider.getTemplates());
    this.sentClips = [];
    this.mockClipResult = { success: true, filePath: '/mock/path.md' };
    this.listeners.clear();
  }

  setMockResult(result: ClipResult): void {
    this.mockClipResult = clone(result);
  }

  private emitConfigChange(): void {
    const snapshot = clone(this.fragmentConfig);
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('[MockClipRepository] listener error', error);
      }
    });
  }
}
