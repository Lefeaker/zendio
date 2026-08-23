import { describe, expect, it } from 'vitest';

import { parseLegacyVideoCaptureIdentity } from '../../../src/shared/sessionDrafts/legacyVideoCaptureKey';

describe('legacy video capture key', () => {
  it('accepts exact and real subdomain hosts with bounded identifiers', () => {
    expect(
      parseLegacyVideoCaptureIdentity('https://www.bilibili.com/video/BV1xx411c7mD?p=2')
    ).toMatchObject({
      platform: 'bilibili',
      videoId: 'BV1xx411c7mD',
      storageKey: 'bili:BV1xx411c7mD'
    });
    expect(
      parseLegacyVideoCaptureIdentity('https://m.youtube.com/watch?v=abc_DEF-123')
    ).toMatchObject({
      platform: 'youtube',
      videoId: 'abc_DEF-123',
      storageKey: 'yt:abc_DEF-123'
    });
    expect(parseLegacyVideoCaptureIdentity('https://youtu.be/abc_DEF-123')).not.toBeNull();
  });

  it.each([
    'https://bilibili.com.attacker.example/video/BV1xx411c7mD',
    'https://youtube.com.attacker.example/watch?v=abc_DEF-123',
    'https://user@youtube.com/watch?v=abc_DEF-123',
    'https://youtube.com:8443/watch?v=abc_DEF-123',
    'ftp://youtube.com/watch?v=abc_DEF-123',
    'https://youtube.com/watch?v=abc%2FDEF',
    'https://youtu.be/a\u0000b'
  ])('rejects unsafe or ambiguous input %s', (url) => {
    expect(parseLegacyVideoCaptureIdentity(url)).toBeNull();
  });
});
