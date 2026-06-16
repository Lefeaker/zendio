import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeVideoRepository } from '../../../src/infrastructure/repositories/ChromeVideoRepository';
import type { IMessagingRepository } from '@shared/repositories';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { CompleteOptions } from '@shared/types/options';
import type { VideoClipData } from '@shared/repositories/IVideoRepository';

type MockableFunction = (...args: never[]) => void;

const createMockFn = <T extends MockableFunction>() =>
  vi.fn<(...args: Parameters<T>) => ReturnType<T>>();

type OptionsRepoMock = IOptionsRepository & {
  get: ReturnType<typeof createMockFn<IOptionsRepository['get']>>;
  set: ReturnType<typeof createMockFn<IOptionsRepository['set']>>;
  onChange: ReturnType<typeof createMockFn<IOptionsRepository['onChange']>>;
};

type MessagingRepoMock = IMessagingRepository & {
  send: ReturnType<typeof createMockFn<IMessagingRepository['send']>>;
  onMessage: ReturnType<typeof createMockFn<IMessagingRepository['onMessage']>>;
};

describe('ChromeVideoRepository', () => {
  let repo: ChromeVideoRepository;

  const mockOptionsRepo: OptionsRepoMock = {
    get: createMockFn<IOptionsRepository['get']>(),
    set: createMockFn<IOptionsRepository['set']>(),
    onChange: createMockFn<IOptionsRepository['onChange']>()
  };

  const mockMessagingRepo: MessagingRepoMock = {
    send: createMockFn<IMessagingRepository['send']>() as MessagingRepoMock['send'],
    onMessage: createMockFn<IMessagingRepository['onMessage']>()
  };

  beforeEach(() => {
    mockOptionsRepo.get.mockResolvedValue({ video: {} } as CompleteOptions);
    repo = new ChromeVideoRepository(mockOptionsRepo, mockMessagingRepo);
  });

  it('returns a stable code for non-Error messaging failures', async () => {
    mockMessagingRepo.send.mockRejectedValue('string failure');
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
