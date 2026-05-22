import type { ActiveSelectionInfo } from './selectionSnapshot';
import { hasUsableSelection } from './selectionSnapshot';

const BILIBILI_SHADOW_HOST_SELECTOR =
  'bili-comment-thread-renderer,bili-comment-renderer,bili-comment-reply-renderer,bili-rich-text,bili-comment-area,bili-comment-list,bili-comment-item,bili-comment-content,bili-comment-text,bili-comment-reply-list,bili-comment-reply-item,bili-comment-user-info,bili-avatar,bili-dynamic-content,bili-comment-box,bili-comment-editor,bili-comment-actions,bili-comment-time,bili-comment-like,bili-comment-reply-btn';

export function findShadowSelection(document: Document): ActiveSelectionInfo | null {
  const visited = new Set<ShadowRoot>();
  const queue = collectInitialShadowRoots(document);

  while (queue.length) {
    const root = queue.pop();
    if (!root || visited.has(root)) {
      continue;
    }
    visited.add(root);

    const shadowWithSelection = root as ShadowRoot & { getSelection?: () => Selection | null };
    const selection =
      typeof shadowWithSelection.getSelection === 'function'
        ? shadowWithSelection.getSelection()
        : null;
    if (selection && hasUsableSelection(selection)) {
      return { selection, root };
    }

    collectChildShadowRoots(root, queue);
  }

  return null;
}

function collectInitialShadowRoots(document: Document): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  document.querySelectorAll<HTMLElement>(BILIBILI_SHADOW_HOST_SELECTOR).forEach((host) => {
    if (host.shadowRoot) {
      roots.push(host.shadowRoot);
    }
  });
  return roots;
}

function collectChildShadowRoots(root: ShadowRoot, queue: ShadowRoot[]): void {
  root.querySelectorAll<HTMLElement>('*').forEach((element) => {
    if (element.shadowRoot) {
      queue.push(element.shadowRoot);
    }
  });
}
