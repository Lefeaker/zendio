import { beforeEach, describe, expect, it } from 'vitest';
import { ChromeVideoRepository } from '../../../src/infrastructure/repositories/ChromeVideoRepository';
import type { IMessagingRepository, Message, MessageHandler } from '@shared/repositories';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { VideoClipData } from '@shared/repositories/IVideoRepository';
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

describe('ChromeVideoRepository', () => {
  let repo: ChromeVideoRepository;

  beforeEach(() => {
    repo = new ChromeVideoRepository(
      optionsRepo,
      new ThrowingMessagingRepository('string failure')
    );
  });

  it('returns a stable code for non-Error messaging failures', async () => {
    const clip: VideoClipData = {
      title: 'Video clip',
      url: 'https://example.com/watch',
      videoUrl: 'https://example.com/watch',
      content: 'body',
      timestamp: 12,
      platform: 'other'
    };

    const result = await repo.sendVideoClip(clip);

    expect(result).toEqual({
      success: false,
      error: 'VIDEO_REPOSITORY_UNKNOWN_ERROR',
      failureCategory: 'connection'
    });
  });
});
