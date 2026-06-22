import type { ContextMenuListenerDependencies } from './contextMenusTypes';

export function isVideoUrl(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname.includes('bilibili.com')) {
      return /\/video\//.test(parsed.pathname);
    }
    if (hostname === 'youtu.be') {
      return true;
    }
    if (hostname.includes('youtube.com')) {
      return (
        parsed.pathname.startsWith('/watch') ||
        parsed.pathname.startsWith('/shorts') ||
        parsed.pathname.startsWith('/embed/')
      );
    }
  } catch {
    return false;
  }
  return false;
}

export function isInjectableUrl(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:'
    );
  } catch {
    return false;
  }
}

export async function resolveTabUrl(
  dependencies: ContextMenuListenerDependencies,
  tabId: number
): Promise<string | undefined> {
  try {
    const tab = await dependencies.tabs.get(tabId);
    return tab?.url ?? undefined;
  } catch {
    return undefined;
  }
}
