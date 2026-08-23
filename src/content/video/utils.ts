import { parseLegacyVideoCaptureIdentity } from '../../shared/sessionDrafts/legacyVideoCaptureKey';

export type VideoPlatform = 'bilibili' | 'youtube' | 'unknown';

export interface VideoIdentity {
  platform: VideoPlatform;
  videoId: string | null;
  storageKey: string | null;
  canonicalUrl: string;
}

export const VIDEO_STORAGE_PREFIX: Record<Exclude<VideoPlatform, 'unknown'>, string> = {
  bilibili: 'bili:',
  youtube: 'yt:'
};

export function detectVideoIdentity(rawUrl: string | undefined | null): VideoIdentity {
  const fallbackIdentity: VideoIdentity = {
    platform: 'unknown',
    videoId: null,
    storageKey: null,
    canonicalUrl: rawUrl || ''
  };

  if (!rawUrl) {
    return fallbackIdentity;
  }

  const parsed = parseLegacyVideoCaptureIdentity(rawUrl);
  return parsed ?? fallbackIdentity;
}

export function isSupportedVideoUrl(rawUrl: string | undefined | null): boolean {
  return detectVideoIdentity(rawUrl).platform !== 'unknown';
}
