/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasPlayableVideo,
  isValidVideoPlayPage,
  matchesSupportedVideoHost,
  observeVideoControlTarget
} from '@content/video/videoPromptObserver';

describe('videoPromptObserver', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('observes until a supported control target appears and disconnects cleanly', () => {
    const callback = vi.fn();
    const stop = observeVideoControlTarget({
      doc: document,
      url: 'https://www.youtube.com/watch?v=abc',
      onTarget: callback
    });
    expect(typeof stop).toBe('function');
    stop();
  });

  it('matches supported hosts and validates play pages', () => {
    expect(matchesSupportedVideoHost('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(matchesSupportedVideoHost('notaurl')).toBe(false);
    expect(
      isValidVideoPlayPage('https://youtu.be/abc123', {
        platform: 'youtube',
        videoId: 'abc123',
        canonicalUrl: '',
        storageKey: 'yt:abc123'
      })
    ).toBe(true);
    expect(
      isValidVideoPlayPage('https://www.bilibili.com/video/BV1', {
        platform: 'bilibili',
        videoId: 'BV1',
        canonicalUrl: '',
        storageKey: 'bili:BV1'
      })
    ).toBe(true);
    expect(
      isValidVideoPlayPage('https://www.youtube.com/', {
        platform: 'youtube',
        videoId: '',
        canonicalUrl: '',
        storageKey: null
      })
    ).toBe(false);
  });

  it('detects playable video elements', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    document.body.appendChild(video);
    expect(hasPlayableVideo()).toBe(true);
  });
});
