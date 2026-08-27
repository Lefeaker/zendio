import type { VideoPlatformContext } from './baseVideoPlatform';
import type {
  DocumentMutationDisposer,
  ScopedMutationObserver
} from '../../runtime/documentMutationTypes';
import { queryBilibiliShadowHosts } from './bilibiliPlatformSelection';
import { ScopedTimeoutScheduler } from './scopedTimeoutScheduler';
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

type BilibiliObserverContext = Pick<
  VideoPlatformContext,
  | 'createScopedMutationObserver'
  | 'documentMutationHub'
  | 'ensureHighlightStyles'
  | 'observeWithFragmentObserver'
  | 'registerShadowSelectionBridge'
  | 'unregisterShadowSelectionBridge'
  | 'scheduleFragmentHighlightRestore'
>;

export class BilibiliShadowObserver {
  private disposed = false;
  private generation = 0;
  private scopedObserver: ScopedMutationObserver | null = null;
  private observedShadowRoots: Array<WeakRef<ShadowRoot>> = [];
  private pendingShadowHosts = new WeakMap<HTMLElement, number>();
  private pendingHostGeneration = 0;
  private readonly timeoutScheduler = new ScopedTimeoutScheduler(() => this.getView());
  private readonly disposeBodySubscription: DocumentMutationDisposer;

  constructor(
    private readonly document: Document,
    private readonly context: BilibiliObserverContext
  ) {
    this.disposeBodySubscription = context.documentMutationHub.subscribe({
      subscriberId: 'bilibili-comment-shadow-discovery',
      filter: isBilibiliMutationRelevant,
      coalescingKey: 'shadow-refresh',
      delayMs: 100,
      callback: () => this.ensureObservedRoots()
    });
    this.ensureObservedRoots();
  }

  ensureObservedRoots(): void {
    if (this.disposed) return;
    try {
      this.pruneDisconnectedShadowRoots();
      queryBilibiliShadowHosts(this.document).forEach((host) =>
        this.ensureShadowHostObservation(host)
      );
    } catch (error) {
      console.warn('[BilibiliVideoPlatform] Failed to observe shadow roots:', error);
    }
  }

  ensureShadowHostObservationForTests(host: Element): void {
    this.ensureShadowHostObservation(host);
  }

  getObservedCommentRootsForSearch(): ShadowRoot[] {
    this.pruneDisconnectedShadowRoots();
    return this.observedShadowRoots.flatMap((reference) => {
      const root = reference.deref();
      return root && isBilibiliCommentRegionNode(root) ? [root] : [];
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.disposeBodySubscription();
    this.scopedObserver?.disconnect();
    this.scopedObserver = null;
    for (const reference of this.observedShadowRoots) {
      const root = reference.deref();
      if (root) this.context.unregisterShadowSelectionBridge(root);
    }
    this.observedShadowRoots = [];
    this.timeoutScheduler.clearAll();
    this.pendingShadowHosts = new WeakMap();
  }

  private ensureShadowHostObservation(host: Element): void {
    if (this.disposed || !(host instanceof HTMLElement) || isBilibiliDanmakuNode(host)) return;
    if (!isWithinCommentRegion(host)) return;
    if (host.shadowRoot) {
      this.observeShadowRootRecursive(host.shadowRoot);
      return;
    }
    if (!BILIBILI_SHADOW_HOST_TAG_SET.has(host.tagName.toLowerCase())) return;
    if (this.pendingShadowHosts.has(host)) return;
    const pollGeneration = ++this.pendingHostGeneration;
    const observerGeneration = this.generation;
    const reference = new WeakRef(host);
    this.pendingShadowHosts.set(host, pollGeneration);
    this.timeoutScheduler.schedule(
      () => this.pollForShadowRoot(reference, pollGeneration, observerGeneration, 0),
      120
    );
  }

  private pollForShadowRoot(
    reference: WeakRef<HTMLElement>,
    pollGeneration: number,
    observerGeneration: number,
    attempt: number
  ): void {
    const host = reference.deref();
    try {
      if (this.disposed || observerGeneration !== this.generation) return;
      if (!host || this.pendingShadowHosts.get(host) !== pollGeneration) return;
      if (!host.isConnected) {
        this.pendingShadowHosts.delete(host);
        return;
      }
      if (host.shadowRoot) {
        this.pendingShadowHosts.delete(host);
        this.observeShadowRootRecursive(host.shadowRoot);
        this.context.scheduleFragmentHighlightRestore();
        return;
      }
      if (attempt >= 20) {
        this.pendingShadowHosts.delete(host);
        return;
      }
      this.timeoutScheduler.schedule(
        () => this.pollForShadowRoot(reference, pollGeneration, observerGeneration, attempt + 1),
        160
      );
    } catch (error) {
      if (host) this.pendingShadowHosts.delete(host);
      console.warn('[BilibiliVideoPlatform] Shadow host polling failed:', error);
    }
  }

  private observeShadowRootRecursive(root: ShadowRoot | null): void {
    if (
      this.disposed ||
      !root ||
      this.observedShadowRoots.some((reference) => reference.deref() === root)
    )
      return;
    const observer = this.ensureScopedObserver();
    if (!observer) return;
    this.context.ensureHighlightStyles(root);
    this.context.registerShadowSelectionBridge(root);
    this.context.observeWithFragmentObserver(observer, root, { childList: true, subtree: true });
    this.observedShadowRoots.push(new WeakRef(root));
    root
      .querySelectorAll<HTMLElement>(BILIBILI_COMMENT_SHADOW_HOST_SELECTOR)
      .forEach((element) => this.ensureShadowHostObservation(element));
  }

  private ensureScopedObserver(): ScopedMutationObserver | null {
    if (this.scopedObserver) return this.scopedObserver;
    const generation = this.generation;
    this.scopedObserver = this.context.createScopedMutationObserver((mutations) => {
      if (this.disposed || generation !== this.generation) return;
      try {
        this.processScopedMutations(mutations);
      } catch (error) {
        console.warn('[BilibiliVideoPlatform] Scoped shadow mutation failed:', error);
      }
    });
    return this.scopedObserver;
  }

  private processScopedMutations(mutations: MutationRecord[]): void {
    this.pruneDisconnectedShadowRoots();
    let shouldRestore = false;
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      const changedNodes = [
        ...Array.from(mutation.addedNodes),
        ...Array.from(mutation.removedNodes)
      ];
      if (changedNodes.some((node) => !isBilibiliDanmakuNode(node))) shouldRestore = true;
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof Element) || isBilibiliDanmakuNode(node)) continue;
        if (isPotentialCommentHost(node)) {
          this.ensureShadowHostObservation(node);
          node
            .querySelectorAll<HTMLElement>(BILIBILI_COMMENT_SHADOW_HOST_SELECTOR)
            .forEach((host) => this.ensureShadowHostObservation(host));
        }
      }
    }
    if (shouldRestore && !this.disposed) this.context.scheduleFragmentHighlightRestore();
  }

  private pruneDisconnectedShadowRoots(): void {
    let pruned = false;
    this.observedShadowRoots = this.observedShadowRoots.filter((reference) => {
      const root = reference.deref();
      if (root?.host.isConnected) return true;
      if (root) this.context.unregisterShadowSelectionBridge(root);
      pruned = true;
      return false;
    });
    if (!pruned || !this.scopedObserver) return;
    this.scopedObserver.disconnect();
    for (const reference of this.observedShadowRoots) {
      const root = reference.deref();
      if (root)
        this.context.observeWithFragmentObserver(this.scopedObserver, root, {
          childList: true,
          subtree: true
        });
    }
  }

  private getView(): Window {
    return this.document.defaultView ?? window;
  }
}

export function isBilibiliDanmakuNode(node: Node | null): boolean {
  const element =
    node instanceof Element
      ? node
      : node?.parentElement instanceof Element
        ? node.parentElement
        : null;
  return Boolean(
    element &&
    (element.matches(BILIBILI_DANMAKU_SELECTOR) || element.closest(BILIBILI_DANMAKU_SELECTOR))
  );
}

function isBilibiliMutationRelevant(mutation: MutationRecord): boolean {
  if (mutation.type !== 'childList') return false;
  return [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)].some(
    (node) =>
      node instanceof Element && !isBilibiliDanmakuNode(node) && isPotentialCommentHost(node)
  );
}

function isWithinCommentRegion(element: Element): boolean {
  return element.isConnected && isBilibiliCommentRegionNode(element);
}

function isPotentialCommentHost(element: Element): boolean {
  if (isBilibiliDanmakuNode(element)) return false;
  if (BILIBILI_SHADOW_HOST_TAG_SET.has(element.tagName?.toLowerCase() ?? '')) return true;
  return Boolean(
    element.querySelector(BILIBILI_COMMENT_SHADOW_HOST_SELECTOR) ||
    element.querySelector('[class*="comment"]')
  );
}

export { isBilibiliCommentRegionNode };
