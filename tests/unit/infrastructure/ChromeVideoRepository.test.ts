import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeVideoRepository } from '../../../src/infrastructure/repositories/ChromeVideoRepository';
import type { IMessagingRepository, Message, MessageHandler } from '@shared/repositories';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { VideoClipData } from '@shared/repositories/IVideoRepository';
import { DEFAULT_OPTIONS } from '@shared/config';

const patch = vi.fn(() => Promise.resolve(DEFAULT_OPTIONS));
const optionsRepo = {
  get: () => Promise.resolve(DEFAULT_OPTIONS),
  patch,
  onChange: () => () => undefined
} satisfies Pick<IOptionsRepository, 'get' | 'patch' | 'onChange'>;

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
    patch.mockClear();
    repo = new ChromeVideoRepository(
      optionsRepo as unknown as IOptionsRepository,
      new ThrowingMessagingRepository('string failure')
    );
  });

  it('patches prompt position without a whole-record read/write cycle', async () => {
    await repo.savePromptPosition({ x: 12, y: 24 });
    expect(patch).toHaveBeenCalledWith({
      path: ['video', 'promptPosition'],
      value: { x: 12, y: 24 }
    });
  });

  it('patches control-bar preferences atomically', async () => {
    await repo.saveControlBarPreferences({
      autoPauseEnabled: false,
      captureScreenshotEnabled: true
    });
    expect(patch).toHaveBeenCalledWith([
      { path: ['video', 'controlBarAutoPause'], value: false },
      { path: ['video', 'controlBarScreenshot'], value: true }
    ]);
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
