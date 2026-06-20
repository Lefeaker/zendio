import type { VideoIdentity } from './utils';

const SUPPORTED_VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'bilibili.com'] as const;

export const YOUTUBE_CONTROL_TARGET_SELECTORS = ['.ytp-right-controls'] as const;
export const BILIBILI_CONTROL_TARGET_SELECTORS = [
  '.bpx-player-control-bottom-right',
  '.bilibili-player-video-control-bottom-right',
  '.squirtle-controller-right'
] as const;
export const YOUTUBE_PLAYER_ROOT_SELECTORS = [
  '#movie_player',
  '.html5-video-player',
  'ytd-player',
  '#player'
] as const;
export const BILIBILI_PLAYER_ROOT_SELECTORS = [
  '.bpx-player-container',
  '.bpx-player-primary-area',
  '.bpx-player-video-area',
  '.bilibili-player',
  '#bilibili-player',
  '.squirtle-video-wrap'
] as const;

const IGNORED_DYNAMIC_REGION_SELECTOR = [
  '.bpx-player-render-dm-wrap',
  '.bpx-player-dm-mask-wrap',
  '.bpx-player-adv-dm-wrap',
  '.bpx-player-row-dm-wrap',
  '.bpx-player-bas-dm-wrap',
  '.bpx-player-cmd-dm-wrap',
  '.bili-danmaku-x-dm',
  '.bili-danmaku-x-dm-vip'
].join(',');

export interface VideoControlTargetObserverOptions {
  doc: Document;
  url: string;
  onTarget(target: Element): void;
}

function selectControlTarget(doc: Document, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const target = doc.querySelector(selector);
    if (target) {
      return target;
    }
  }
  return null;
}

function selectFirstConnected(doc: Document, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const target = doc.querySelector(selector);
    if (target?.isConnected) {
      return target;
    }
  }
  return null;
}

/**
 * Finds the supported player control target that can host the Zendio entry button.
 */
export function findVideoControlTarget(doc: Document, url: string): Element | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('youtube.com') || hostname === 'youtu.be') {
      return selectControlTarget(doc, YOUTUBE_CONTROL_TARGET_SELECTORS);
    }
    if (hostname.includes('bilibili.com')) {
      return selectControlTarget(doc, BILIBILI_CONTROL_TARGET_SELECTORS);
    }
  } catch {
    return null;
  }
  return null;
}

export function findVideoControlObserverRoot(doc: Document, url: string): Element | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('youtube.com') || hostname === 'youtu.be') {
      return selectFirstConnected(doc, YOUTUBE_PLAYER_ROOT_SELECTORS);
    }
    if (hostname.includes('bilibili.com')) {
      return selectFirstConnected(doc, BILIBILI_PLAYER_ROOT_SELECTORS);
    }
  } catch {
    return null;
  }
  return null;
}

export function isIgnoredVideoMutationNode(node: Node | null): boolean {
  const element =
    node instanceof Element
      ? node
      : node?.parentElement instanceof Element
        ? node.parentElement
        : null;
  if (!element) {
    return false;
  }
  return Boolean(
    element.matches(IGNORED_DYNAMIC_REGION_SELECTOR) ||
    element.closest(IGNORED_DYNAMIC_REGION_SELECTOR)
  );
}

export function observeVideoControlTarget(options: VideoControlTargetObserverOptions): () => void {
  const existingTarget = findVideoControlTarget(options.doc, options.url);
  if (existingTarget) {
    options.onTarget(existingTarget);
    return () => undefined;
  }

  if (typeof MutationObserver === 'undefined') {
    return () => undefined;
  }

  const root = findVideoControlObserverRoot(options.doc, options.url);
  if (!root) {
    return () => undefined;
  }

  let observer: MutationObserver | null = null;
  let stopped = false;

  const disconnect = (): void => {
    stopped = true;
    observer?.disconnect();
    observer = null;
  };

  observer = new MutationObserver((mutations) => {
    if (stopped) {
      return;
    }

    const hasRelevantAddition = mutations.some((mutation) =>
      Array.from(mutation.addedNodes).some((node) => !isIgnoredVideoMutationNode(node))
    );
    if (!hasRelevantAddition) {
      return;
    }

    const target = findVideoControlTarget(options.doc, options.url);
    if (!target) {
      return;
    }

    options.onTarget(target);
    disconnect();
  });

  try {
    observer.observe(root, {
      childList: true,
      subtree: true
    });
  } catch {
    disconnect();
  }

  return disconnect;
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
