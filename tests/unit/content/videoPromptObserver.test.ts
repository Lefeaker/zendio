/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { disconnectVideoObserver, hasPlayableVideo, isValidVideoPlayPage, matchesSupportedVideoHost, observeVideoElements } from '@content/video/videoPromptObserver';

describe('videoPromptObserver', () => {
  afterEach(() => {
    disconnectVideoObserver();
    document.body.innerHTML = '';
  });

  it('observes mutations only once and disconnects cleanly', () => {
    const callback = vi.fn();
    observeVideoElements(callback);
    observeVideoElements(callback);
    document.body.appendChild(document.createElement('div'));
    expect(typeof disconnectVideoObserver).toBe('function');
    disconnectVideoObserver();
  });

  it('matches supported hosts and validates play pages', () => {
    expect(matchesSupportedVideoHost('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(matchesSupportedVideoHost('notaurl')).toBe(false);
    expect(isValidVideoPlayPage('https://youtu.be/abc123', { platform: 'youtube', videoId: 'abc123', canonicalUrl: '', storageKey: 'yt:abc123' })).toBe(true);
    expect(isValidVideoPlayPage('https://www.bilibili.com/video/BV1', { platform: 'bilibili', videoId: 'BV1', canonicalUrl: '', storageKey: 'bili:BV1' })).toBe(true);
    expect(isValidVideoPlayPage('https://www.youtube.com/', { platform: 'youtube', videoId: '', canonicalUrl: '', storageKey: null })).toBe(false);
  });

  it('detects playable video elements', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    document.body.appendChild(video);
    expect(hasPlayableVideo()).toBe(true);
  });
});
