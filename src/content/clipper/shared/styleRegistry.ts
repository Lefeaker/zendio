import { getService } from '@shared/di';
import { TOKENS } from '@shared/di/tokens';
import type { PlatformServices } from '@platform/types';

const styleCache = new Map<string, Promise<string>>();

export function isJsdomRuntime(): boolean {
  return /jsdom/i.test(globalThis.navigator?.userAgent ?? '');
}

export async function loadExtensionStyle(path: string): Promise<string> {
  const cached = styleCache.get(path);
  if (cached) {
    return cached;
  }

  if (isJsdomRuntime()) {
    const emptyStyle = Promise.resolve('');
    styleCache.set(path, emptyStyle);
    return emptyStyle;
  }

  const pending = (async () => {
    let url = path;
    try {
      const platformServices = getService<PlatformServices>(TOKENS.platformServices);
      url = platformServices.runtime.getURL(path);
    } catch {
      url = path;
    }
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(
        `[styleRegistry] Failed to load style "${path}": ${response.status} ${response.statusText}`
      );
    }
    return await response.text();
  })().catch((error) => {
    styleCache.delete(path);
    throw error;
  });
  styleCache.set(path, pending);
  return pending;
}

export function clearClipperStyleCache(): void {
  styleCache.clear();
}
