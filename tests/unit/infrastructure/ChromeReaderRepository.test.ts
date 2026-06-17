import { beforeEach, describe, expect, it } from 'vitest';
import { ChromeReaderRepository } from '../../../src/infrastructure/repositories/ChromeReaderRepository';
import type { IMessagingRepository, Message, MessageHandler } from '@shared/repositories';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { ReadingClipData } from '@shared/repositories/IReaderRepository';
import { DEFAULT_OPTIONS } from '@shared/config';

const optionsRepo: IOptionsRepository = {
  get: () => Promise.resolve(DEFAULT_OPTIONS),
  set: () => Promise.resolve(),
  onChange: () => () => undefined
};

class ThrowingMessagingRepository implements IMessagingRepository {
  constructor(private readonly failure: string | Error) {}

  send<T>(_message: Message): Promise<T> {
    return Promise.reject(this.failure);
  }

  onMessage(_handler: MessageHandler): () => void {
    return () => undefined;
  }
}

describe('ChromeReaderRepository', () => {
  let repo: ChromeReaderRepository;

  beforeEach(() => {
    repo = new ChromeReaderRepository(
      optionsRepo,
      new ThrowingMessagingRepository('string failure')
    );
  });

  it('returns a stable code for non-Error messaging failures', async () => {
    const clip: ReadingClipData = {
      title: 'Reader clip',
      url: 'https://example.com',
      content: 'body',
      highlights: [],
      exportMode: 'highlights'
    };

    const result = await repo.sendReadingClip(clip);

    expect(result).toEqual({
      success: false,
      error: 'READER_REPOSITORY_UNKNOWN_ERROR'
    });
  });
});
