import type { VideoPlatformContext } from './baseVideoPlatform';
import { queryBilibiliShadowHosts } from './bilibiliPlatformSelection';
import {
  BILIBILI_COMMENT_SHADOW_HOST_SELECTOR,
  isBilibiliCommentRegionNode
} from './bilibiliCommentRestoreScope';

const BILIBILI_SHADOW_HOST_TAGS = [
  'bili-comments',
  'bili-comment-thread-renderer',
  'bili-comment-renderer',
  'bili-comment-reply-renderer',
  'bili-rich-text',
  'bili-emoji',
  'bili-avatar',
  'bili-at',
  'bili-link',
  'bili-dyn-content'
] as const;

const BILIBILI_COMMENT_HOST_SELECTORS: ReadonlyArray<string> = [...BILIBILI_SHADOW_HOST_TAGS];
const BILIBILI_SHADOW_HOST_TAG_SET = new Set<string>(BILIBILI_COMMENT_HOST_SELECTORS);

const BILIBILI_DANMAKU_SELECTOR = [
  '.bpx-player-render-dm-wrap',
  '.bpx-player-dm-mask-wrap',
  '.bpx-player-adv-dm-wrap',
  '.bpx-player-row-dm-wrap',
  '.bpx-player-bas-dm-wrap',
  '.bpx-player-cmd-dm-wrap',
  '.bili-danmaku-x-dm',
  '.bili-danmaku-x-dm-vip'
].join(',');

export class BilibiliShadowObserver {
  private fragmentObserver: MutationObserver | null = null;
  private readonly observedShadowRoots = new WeakSet<ShadowRoot>();
  private readonly observedCommentRoots = new Set<ShadowRoot>();
  private readonly pendingShadowHosts = new WeakSet<HTMLElement>();
  private readonly pendingTimeouts = new Set<number>();
  private pendingRefreshHandle: number | null = null;

  constructor(
    private readonly document: Document,
    private readonly context: Pick<
      VideoPlatformContext,
      | 'ensureHighlightStyles'
      | 'registerShadowSelectionBridge'
      | 'observeWithFragmentObserver'
      | 'scheduleFragmentHighlightRestore'
    >
  ) {}

  observeDomChanges(observer: MutationObserver): void {
    this.fragmentObserver = observer;
  }

  ensureObservedRoots(): void {
    this.observeShadowRoots();
  }

  ensureShadowHostObservationForTests(host: Element): void {
    this.ensureShadowHostObservation(host);
  }

  getObservedCommentRootsForSearch(): ShadowRoot[] {
    this.pruneDisconnectedCommentRoots();
    return Array.from(this.observedCommentRoots);
  }

  handleMutations(mutations: MutationRecord[]): void {
    let shouldRefresh = false;
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') {
        continue;
      }
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }
        if (isBilibiliDanmakuNode(node)) {
          return;
        }
        if (isPotentialCommentHost(node)) {
          shouldRefresh = true;
        }
      });
    }
    if (shouldRefresh) {
      this.scheduleShadowRefresh();
    }
  }

  dispose(): void {
    const view = this.document.defaultView ?? window;
    if (this.pendingRefreshHandle !== null) {
      view.clearTimeout(this.pendingRefreshHandle);
      this.pendingRefreshHandle = null;
    }
    for (const handle of this.pendingTimeouts) {
      view.clearTimeout(handle);
    }
    this.pendingTimeouts.clear();
    this.fragmentObserver = null;
  }

  private observeShadowRoots(): void {
    if (!this.fragmentObserver) {
      return;
    }

    try {
      const hosts = queryBilibiliShadowHosts(this.document);
      hosts.forEach((host) => this.ensureShadowHostObservation(host));
    } catch (error) {
      console.warn('[BilibiliVideoPlatform] Failed to observe shadow roots:', error);
    }
  }

  private scheduleShadowRefresh(): void {
    if (this.pendingRefreshHandle !== null) {
      return;
    }
    const view = this.document.defaultView ?? window;
    this.pendingRefreshHandle = view.setTimeout(() => {
      this.pendingRefreshHandle = null;
      this.observeShadowRoots();
      this.context.scheduleFragmentHighlightRestore();
    }, 100);
  }

  private ensureShadowHostObservation(host: Element): void {
    if (!(host instanceof HTMLElement)) {
      return;
    }
    if (isBilibiliDanmakuNode(host)) {
      return;
    }
    if (!isWithinCommentRegion(host)) {
      return;
    }
    if (host.shadowRoot) {
      this.observeShadowRootRecursive(host.shadowRoot);
      return;
    }
    const tagName = host.tagName.toLowerCase();
    if (!BILIBILI_SHADOW_HOST_TAG_SET.has(tagName)) {
      return;
    }
    if (this.pendingShadowHosts.has(host)) {
      return;
    }
    this.pendingShadowHosts.add(host);
    const maxAttempts = 20;
    const view = this.document.defaultView ?? window;

    const poll = (attempt: number): void => {
      try {
        if (!host.isConnected) {
          this.pendingShadowHosts.delete(host);
          return;
        }
        if (host.shadowRoot) {
          this.pendingShadowHosts.delete(host);
          this.observeShadowRootRecursive(host.shadowRoot);
          return;
        }
        if (attempt >= maxAttempts) {
          this.pendingShadowHosts.delete(host);
          return;
        }
        const handle = view.setTimeout(() => poll(attempt + 1), 160);
        this.pendingTimeouts.add(handle);
      } catch (error) {
        this.pendingShadowHosts.delete(host);
        console.warn('[BilibiliVideoPlatform] Shadow host polling failed:', error);
      }
    };

    const initialHandle = view.setTimeout(() => poll(0), 120);
    this.pendingTimeouts.add(initialHandle);
  }

  private observeShadowRootRecursive(root: ShadowRoot | null): void {
    if (!root || this.observedShadowRoots.has(root)) {
      return;
    }
    this.context.ensureHighlightStyles(root);
    this.context.registerShadowSelectionBridge(root);
    this.context.observeWithFragmentObserver(root, { childList: true, subtree: true });
    this.observedShadowRoots.add(root);
    if (isBilibiliCommentRegionNode(root)) {
      this.observedCommentRoots.add(root);
    }

    const nestedHosts = root.querySelectorAll<HTMLElement>(BILIBILI_COMMENT_SHADOW_HOST_SELECTOR);
    nestedHosts.forEach((element) => this.ensureShadowHostObservation(element));
  }

  private pruneDisconnectedCommentRoots(): void {
    for (const root of this.observedCommentRoots) {
      if (!isBilibiliCommentRegionNode(root)) {
        this.observedCommentRoots.delete(root);
      }
    }
  }
}

export function isBilibiliDanmakuNode(node: Node | null): boolean {
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
    element.matches(BILIBILI_DANMAKU_SELECTOR) || element.closest(BILIBILI_DANMAKU_SELECTOR)
  );
}

function isWithinCommentRegion(element: Element): boolean {
  if (!element.isConnected) {
    return false;
  }
  return isBilibiliCommentRegionNode(element);
}

function isPotentialCommentHost(element: Element): boolean {
  if (isBilibiliDanmakuNode(element)) {
    return false;
  }
  const tagName = element.tagName?.toLowerCase() ?? '';
  if (BILIBILI_SHADOW_HOST_TAG_SET.has(tagName)) {
    return true;
  }
  return Boolean(
    element.querySelector(BILIBILI_COMMENT_SHADOW_HOST_SELECTOR) ||
    element.querySelector('[class*="comment"]')
  );
}

export { isBilibiliCommentRegionNode };
