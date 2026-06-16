import type {
  IReaderRepository,
  ReadingClipData,
  ReadingOptions
} from '../../shared/repositories/IReaderRepository';
import type { ClipResult } from '../../shared/repositories/IClipRepository';
import type { IOptionsRepository, IMessagingRepository } from '../../shared/repositories';

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Chrome 环境的 Reader Repository
 *
 * - 通过 IOptionsRepository 读取/订阅阅读配置
 * - 通过 IMessagingRepository 发送阅读剪藏
 */
export class ChromeReaderRepository implements IReaderRepository {
  constructor(
    private readonly optionsRepo: IOptionsRepository,
    private readonly messagingRepo: IMessagingRepository
  ) {}

  async getReadingConfig(): Promise<ReadingOptions> {
    const options = await this.optionsRepo.get();
    return clone(options.readingSession);
  }

  async sendReadingClip(clip: ReadingClipData): Promise<ClipResult> {
    try {
      return await this.messagingRepo.send<ClipResult>({
        type: 'readingClip',
        data: clip
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'READER_REPOSITORY_UNKNOWN_ERROR'
      };
    }
  }

  onConfigChange(callback: (config: ReadingOptions) => void): () => void {
    return this.optionsRepo.onChange((options) => {
      callback(clone(options.readingSession));
    });
  }
}
