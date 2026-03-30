import { describe, expect, it } from 'vitest';
import { detectVideoIdentity, isSupportedVideoUrl } from '@content/video/utils';

describe('video utils', () => {
  it('detects bilibili canonical identity with page parameter', () => {
    const identity = detectVideoIdentity('https://www.bilibili.com/video/BV1xx411c7mD/?spm_id_from=333.337.search-card.all.click&p=2');
    expect(identity).toEqual({
      platform: 'bilibili',
      videoId: 'BV1xx411c7mD',
      storageKey: 'bili:BV1xx411c7mD',
      canonicalUrl: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2'
    });
  });

  it('detects youtube short and embed urls', () => {
    expect(detectVideoIdentity('https://youtu.be/abc123?t=30')).toMatchObject({
      platform: 'youtube',
      videoId: 'abc123',
      storageKey: 'yt:abc123'
    });
    expect(detectVideoIdentity('https://www.youtube.com/shorts/xyz987')).toMatchObject({
      platform: 'youtube',
      videoId: 'xyz987'
    });
    expect(detectVideoIdentity('https://www.youtube.com/embed/qqq777?start=4')).toMatchObject({
      platform: 'youtube',
      videoId: 'qqq777'
    });
  });

  it('falls back for invalid or unsupported urls', () => {
    expect(detectVideoIdentity('not a url')).toEqual({
      platform: 'unknown',
      videoId: null,
      storageKey: null,
      canonicalUrl: 'not a url'
    });
    expect(isSupportedVideoUrl('https://example.com/watch?v=1')).toBe(false);
  });
});
