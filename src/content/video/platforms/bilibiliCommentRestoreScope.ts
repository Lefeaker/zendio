const BILIBILI_COMMENT_RESTORE_ROOT_SELECTOR = [
  'bili-comments',
  'bili-comment-thread-renderer',
  'bili-comment-renderer',
  'bili-comment-reply-renderer',
  '#comment',
  '#comment-app',
  '.comment-list',
  '.comment-list-item',
  '.comment-wrap',
  '.comment-thread',
  '.reply-item',
  '.reply-list',
  '.bb-comment'
].join(',');

export const BILIBILI_COMMENT_SHADOW_HOST_SELECTOR = [
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
].join(',');

export function collectBilibiliCommentRestoreRoots(doc: Document): HTMLElement[] {
  const roots: HTMLElement[] = [];
  doc
    .querySelectorAll<HTMLElement>(BILIBILI_COMMENT_RESTORE_ROOT_SELECTOR)
    .forEach((root) => roots.push(root));
  return dedupeByIdentity(roots);
}

export function collectBilibiliCommentShadowHosts(doc: Document): HTMLElement[] {
  const hosts: HTMLElement[] = [];
  collectBilibiliCommentRestoreRoots(doc).forEach((root) =>
    collectShadowHostsFromScopedNode(root, hosts)
  );
  return dedupeByIdentity(hosts);
}

export function isBilibiliCommentRegionNode(node: Node | null): boolean {
  return isBilibiliCommentRegionNodeInternal(node, new Set<Node>());
}

function isBilibiliCommentRegionNodeInternal(node: Node | null, visited: Set<Node>): boolean {
  if (!node || visited.has(node)) {
    return false;
  }
  visited.add(node);
  if (node instanceof ShadowRoot) {
    return node.host instanceof Element
      ? isBilibiliCommentRegionNodeInternal(node.host, visited)
      : false;
  }
  const element =
    node instanceof Element
      ? node
      : node?.parentElement instanceof Element
        ? node.parentElement
        : null;
  if (!element || !element.isConnected) {
    return false;
  }
  if (element.matches(BILIBILI_COMMENT_RESTORE_ROOT_SELECTOR)) {
    return true;
  }
  if (element.closest(BILIBILI_COMMENT_RESTORE_ROOT_SELECTOR)) {
    return true;
  }
  const root = element.getRootNode();
  if (root instanceof ShadowRoot && root.host instanceof Element) {
    return isBilibiliCommentRegionNodeInternal(root.host, visited);
  }
  return false;
}

function collectShadowHostsFromScopedNode(node: Node, hosts: HTMLElement[]): void {
  if (
    node instanceof HTMLElement &&
    node.matches(BILIBILI_COMMENT_SHADOW_HOST_SELECTOR) &&
    isBilibiliCommentRegionNode(node)
  ) {
    hosts.push(node);
  }
  if (node instanceof Element && node.shadowRoot) {
    collectShadowHostsFromScopedNode(node.shadowRoot, hosts);
  }
  for (let child = node.firstChild; child; child = child.nextSibling) {
    collectShadowHostsFromScopedNode(child, hosts);
  }
}

function dedupeByIdentity<T extends object>(items: T[]): T[] {
  const seen = new WeakSet<T>();
  return items.filter((item) => {
    if (seen.has(item)) {
      return false;
    }
    seen.add(item);
    return true;
  });
}
