/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BilibiliVideoPlatform } from '@content/video/platforms/bilibiliPlatform';
import { createContext, withScheduledRestore } from './bilibiliVideoPlatformFixtures';

describe('BilibiliVideoPlatform', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
    vi.useRealTimers();
  });

  it('activates on bilibili hosts and formats bilibili titles', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));

    expect(
      platform.shouldActivate({ location: { hostname: 'www.bilibili.com' } } as Document)
    ).toBe(true);
    expect(platform.formatVideoTitle('测试视频___哔哩哔哩_bilibili')).toBe('测试视频');
    expect(platform.formatVideoTitle('   ')).toBeNull();
  });

  it('builds timestamp urls with active episode fallback', () => {
    document.body.innerHTML =
      '<div class="video-episode-card__entry is-active" data-index="2"></div>';
    const platform = new BilibiliVideoPlatform(createContext(document));

    const url = platform.buildTimestampUrl(135, {
      canonicalUrl: 'https://www.bilibili.com/video/BV1xx411c7mD',
      currentUrl: document.location.href,
      videoId: 'BV1xx411c7mD'
    });

    expect(url).toBe('https://www.bilibili.com/video/BV1xx411c7mD?t=135&p=3');
  });

  it('returns null for invalid timestamp base urls and ignores unrelated mutations', () => {
    vi.useFakeTimers();
    const scheduleRestore = vi.fn();
    const platform = new BilibiliVideoPlatform(
      withScheduledRestore(createContext(document), scheduleRestore)
    );

    expect(
      platform.buildTimestampUrl(15, {
        canonicalUrl: 'not-a-url',
        currentUrl: 'still-bad',
        videoId: null
      })
    ).toBeNull();

    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: [document.createElement('div')],
        removedNodes: [],
        target: document.body,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);

    vi.advanceTimersByTime(110);
    expect(scheduleRestore).not.toHaveBeenCalled();
  });

  it('does not activate on non-bilibili hosts and preserves existing page param in timestamp urls', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));

    expect(platform.shouldActivate({ location: { hostname: 'example.com' } } as Document)).toBe(
      false
    );
    expect(
      platform.buildTimestampUrl(45, {
        canonicalUrl: 'https://www.bilibili.com/video/BV1xx411c7mD?p=4',
        currentUrl: document.location.href,
        videoId: 'BV1xx411c7mD'
      })
    ).toBe('https://www.bilibili.com/video/BV1xx411c7mD?p=4&t=45');
  });

  it('uses current url when canonical url is missing, keeps page param, and returns null for empty formatted titles', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));
    const activeEpisode = document.createElement('div');
    activeEpisode.className = 'video-episode-card__entry is-active';
    activeEpisode.setAttribute('data-index', '0');
    document.body.appendChild(activeEpisode);

    expect(
      platform.buildTimestampUrl(33, {
        canonicalUrl: '',
        currentUrl: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
        videoId: 'BV1xx411c7mD'
      })
    ).toBe('https://www.bilibili.com/video/BV1xx411c7mD?p=2&t=33');
    expect(platform.formatVideoTitle('____哔哩哔哩')).toBeNull();
  });

  it('keeps trimmed raw titles when bilibili suffix stripping does not apply', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));
    expect(platform.formatVideoTitle('  Plain Raw Title  ')).toBe('Plain Raw Title');
  });
});
