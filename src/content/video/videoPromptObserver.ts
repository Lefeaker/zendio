import type { VideoIdentity } from './utils';

const SUPPORTED_VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'bilibili.com'] as const;

let videoObserver: MutationObserver | null = null;

/**
 * 监听 DOM 变化以便重新评估浮层是否需要挂载。
 */
export function observeVideoElements(onMutation: () => void): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return;
  }
  if (videoObserver) {
    return;
  }

  videoObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length > 0)) {
      onMutation();
    }
  });

  try {
    videoObserver.observe(document.documentElement ?? document, { childList: true, subtree: true });
  } catch {
    videoObserver = null;
  }
}

export function disconnectVideoObserver(): void {
  videoObserver?.disconnect();
  videoObserver = null;
}

export function matchesSupportedVideoHost(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return SUPPORTED_VIDEO_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export function hasPlayableVideo(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const video = document.querySelector('video');
  return Boolean(video && video.readyState >= 0);
}

export function isValidVideoPlayPage(url: string, identity: VideoIdentity): boolean {
  if (!url) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname.includes('youtube.com') || hostname === 'youtu.be') {
    if (hostname === 'youtu.be') {
      const trimmed = parsed.pathname.replace(/^\/+/, '');
      return Boolean(trimmed && trimmed.split(/[?/]/)[0]);
    }
    return parsed.pathname === '/watch' && Boolean(parsed.searchParams.get('v'));
  }

  if (hostname.includes('bilibili.com')) {
    return parsed.pathname.startsWith('/video/') && Boolean(identity.videoId);
  }

  return false;
}
