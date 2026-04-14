import type { VideoPlatformContext } from './baseVideoPlatform';
import { queryBilibiliShadowHosts } from './bilibiliPlatformSelection';

const BILIBILI_SHADOW_HOST_TAGS = [
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
const BILIBILI_SHADOW_HOST_SELECTOR = BILIBILI_COMMENT_HOST_SELECTORS.join(',');
const BILIBILI_COMMENT_REGION_SELECTOR = [
  'bili-comment-thread-renderer',
  'bili-comment-renderer',
  'bili-comment-reply-renderer',
  '.comment-list',
  '.comment-list-item',
  '.comment-wrap',
  '.comment-thread',
  '.reply-item',
  '.reply-list',
  '.bb-comment',
  '#comment',
  '#comment-app'
].join(',');

export class BilibiliShadowObserver {
  private fragmentObserver: MutationObserver | null = null;
  private readonly observedShadowRoots = new WeakSet<ShadowRoot>();
  private readonly pendingShadowHosts = new WeakSet<HTMLElement>();
  private readonly pendingTimeouts = new Set<number>();

  constructor(
    private readonly document: Document,
    private readonly context: Pick<
      VideoPlatformContext,
      'ensureHighlightStyles' | 'registerShadowSelectionBridge' | 'observeWithFragmentObserver' | 'scheduleFragmentHighlightRestore'
    >
  ) {}

  observeDomChanges(observer: MutationObserver): void {
    this.fragmentObserver = observer;
    this.observeShadowRoots();
  }

  ensureObservedRoots(): void {
    this.observeShadowRoots();
  }

  ensureShadowHostObservationForTests(host: Element): void {
    this.ensureShadowHostObservation(host);
  }

  handleMutations(mutations: MutationRecord[]): void {
    let shouldRefresh = false;
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') {
        continue;
      }
      shouldRefresh = true;
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }
        if (isPotentialCommentHost(node)) {
          const view = this.document.defaultView ?? window;
          const handle = view.setTimeout(() => {
            this.pendingTimeouts.delete(handle);
            this.observeShadowRoots();
            this.context.scheduleFragmentHighlightRestore();
          }, 100);
          this.pendingTimeouts.add(handle);
        }
      });
    }
    if (shouldRefresh) {
      this.observeShadowRoots();
    }
  }

  dispose(): void {
    const view = this.document.defaultView ?? window;
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

  private ensureShadowHostObservation(host: Element): void {
    if (!(host instanceof HTMLElement)) {
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

    const nestedHosts = root.querySelectorAll<HTMLElement>(BILIBILI_SHADOW_HOST_SELECTOR);
    nestedHosts.forEach((element) => this.ensureShadowHostObservation(element));
  }
}

function isWithinCommentRegion(element: Element): boolean {
  if (!element.isConnected) {
    return false;
  }
  if (element.matches(BILIBILI_COMMENT_REGION_SELECTOR)) {
    return true;
  }
  return Boolean(element.closest(BILIBILI_COMMENT_REGION_SELECTOR));
}

function isPotentialCommentHost(element: Element): boolean {
  const tagName = element.tagName?.toLowerCase() ?? '';
  if (tagName.startsWith('bili-comment') || tagName.includes('rich-text')) {
    return true;
  }
  return Boolean(element.querySelector('[class*="comment"]'));
}
