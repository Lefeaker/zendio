import { describe, expect, it, vi } from 'vitest';
import {
  createVideoPromptOnDemandInitializer,
  isVideoPromptCandidateUrl
} from '../../../src/content/runtime/contentLazyRuntime';

function createDeps() {
  return {
    optionsRepository: {} as never,
    storage: {} as never,
    runtime: {} as never
  };
}

describe('contentLazyRuntime video prompt gating', () => {
  it.each([
    'https://en.wikipedia.org/wiki/Artificial_intelligence',
    'https://medium.com/tag/artificial-intelligence',
    'https://x.com/OpenAI',
    'https://www.reddit.com/r/programming/',
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    'https://mp.weixin.qq.com/s/U-5PG2mF3Y5oJGea1HsD-Q'
  ])('does not treat %s as a video prompt candidate', (url) => {
    expect(isVideoPromptCandidateUrl(url)).toBe(false);
  });

  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.bilibili.com/video/BV1abc123456/'
  ])('treats %s as a video prompt candidate', (url) => {
    expect(isVideoPromptCandidateUrl(url)).toBe(true);
  });

  it('does not import the video runtime for non-video pages', async () => {
    const loadRuntime = vi.fn();
    const initialize = createVideoPromptOnDemandInitializer(loadRuntime);

    await initialize(createDeps(), 'https://developer.mozilla.org/en-US/docs/Web/JavaScript');

    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it('imports and initializes the video runtime for video pages', async () => {
    const initializeVideoPromptRuntime = vi.fn().mockResolvedValue(undefined);
    const loadRuntime = vi.fn().mockResolvedValue({ initializeVideoPromptRuntime });
    const deps = createDeps();
    const initialize = createVideoPromptOnDemandInitializer(loadRuntime);

    await initialize(deps, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(loadRuntime).toHaveBeenCalledTimes(1);
    expect(initializeVideoPromptRuntime).toHaveBeenCalledWith(
      deps,
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
  });
});
