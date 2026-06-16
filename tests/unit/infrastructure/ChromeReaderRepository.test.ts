import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeReaderRepository } from '../../../src/infrastructure/repositories/ChromeReaderRepository';
import type { IMessagingRepository } from '@shared/repositories';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { CompleteOptions } from '@shared/types/options';
import type { ReadingClipData } from '@shared/repositories/IReaderRepository';

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

describe('ChromeReaderRepository', () => {
  let repo: ChromeReaderRepository;

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
    mockOptionsRepo.get.mockResolvedValue({ readingSession: {} } as CompleteOptions);
    repo = new ChromeReaderRepository(mockOptionsRepo, mockMessagingRepo);
  });

  it('returns a stable code for non-Error messaging failures', async () => {
    mockMessagingRepo.send.mockRejectedValue('string failure');
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
