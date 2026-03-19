import type {
  IReaderRepository,
  ReadingClipData,
  ReadingOptions,
  Highlight
} from '@shared/repositories/IReaderRepository';
import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';
import type { ClipResult } from '@shared/repositories/IClipRepository';

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

const DEFAULT_READING_OPTIONS: ReadingOptions = clone(DEFAULT_OPTIONS.readingSession);

export class MockReaderRepository implements IReaderRepository {
  private readingConfig: ReadingOptions = clone(DEFAULT_READING_OPTIONS);
  private listeners = new Set<(config: ReadingOptions) => void>();

  public sentClips: ReadingClipData[] = [];
  public mockClipResult: ClipResult = { success: true };

  getReadingConfig(): Promise<ReadingOptions> {
    return Promise.resolve(clone(this.readingConfig));
  }

  sendReadingClip(clip: ReadingClipData): Promise<ClipResult> {
    this.sentClips.push(clone(clip));
    return Promise.resolve(clone(this.mockClipResult));
  }

  onConfigChange(callback: (config: ReadingOptions) => void): () => void {
    this.listeners.add(callback);
    callback(clone(this.readingConfig));
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * ===== 测试辅助方法 =====
   */
  reset(): void {
    this.readingConfig = clone(DEFAULT_READING_OPTIONS);
    this.sentClips = [];
    this.mockClipResult = { success: true };
    this.listeners.clear();
  }

  setMockConfig(config: Partial<ReadingOptions>): void {
    this.readingConfig = {
      ...this.readingConfig,
      ...clone(config)
    };
    this.emitConfigChange();
  }

  setMockResult(result: ClipResult): void {
    this.mockClipResult = clone(result);
  }

  setMockHighlights(highlights: Highlight[]): void {
    this.sentClips = [
      {
        content: '',
        title: '',
        url: '',
        exportMode: this.readingConfig.exportMode,
        highlights: clone(highlights)
      }
    ];
  }

  private emitConfigChange(): void {
    const snapshot = clone(this.readingConfig);
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('[MockReaderRepository] listener error', error);
      }
    });
  }
}
