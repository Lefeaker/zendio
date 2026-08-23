export type LegacyVideoPlatform = 'bilibili' | 'youtube';

export interface LegacyVideoCaptureIdentity {
  platform: LegacyVideoPlatform;
  videoId: string;
  storageKey: string;
  canonicalUrl: string;
}

const MAX_VIDEO_ID_LENGTH = 64;
const MAX_STORAGE_KEY_LENGTH = 128;
const BILIBILI_ID = /^BV[A-Za-z0-9]{8,62}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function exactOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function boundedId(value: string | null, pattern: RegExp): string | null {
  return value && value.length <= MAX_VIDEO_ID_LENGTH && pattern.test(value) ? value : null;
}

function identity(
  platform: LegacyVideoPlatform,
  videoId: string,
  canonicalUrl: URL
): LegacyVideoCaptureIdentity | null {
  const storageKey = `${platform === 'bilibili' ? 'bili:' : 'yt:'}${videoId}`;
  return storageKey.length <= MAX_STORAGE_KEY_LENGTH
    ? { platform, videoId, storageKey, canonicalUrl: canonicalUrl.toString() }
    : null;
}

export function parseLegacyVideoCaptureIdentity<Value>(
  rawUrl: Value
): LegacyVideoCaptureIdentity | null {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 4096) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== ''
  ) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (exactOrSubdomain(hostname, 'bilibili.com')) {
    const match = /^\/video\/(BV[A-Za-z0-9]{8,62})(?:\/|$)/.exec(parsed.pathname);
    const videoId = boundedId(match?.[1] ?? null, BILIBILI_ID);
    if (!videoId) return null;
    const canonical = new URL(`https://www.bilibili.com/video/${videoId}`);
    const page = parsed.searchParams.get('p');
    if (page && /^\d{1,4}$/.test(page)) canonical.searchParams.set('p', page);
    return identity('bilibili', videoId, canonical);
  }

  if (exactOrSubdomain(hostname, 'youtube.com') || hostname === 'youtu.be') {
    let candidate: string | null = null;
    if (hostname === 'youtu.be') {
      candidate = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (parsed.pathname === '/watch') {
      candidate = parsed.searchParams.get('v');
    } else {
      const match = /^\/(?:shorts|embed)\/([^/]+)(?:\/|$)/.exec(parsed.pathname);
      candidate = match?.[1] ?? null;
    }
    const videoId = boundedId(candidate, YOUTUBE_ID);
    if (!videoId) return null;
    const canonical = new URL('https://www.youtube.com/watch');
    canonical.searchParams.set('v', videoId);
    const list = parsed.searchParams.get('list');
    if (list && YOUTUBE_ID.test(list)) canonical.searchParams.set('list', list);
    return identity('youtube', videoId, canonical);
  }
  return null;
}
