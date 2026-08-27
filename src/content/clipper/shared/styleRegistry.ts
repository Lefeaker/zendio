import { getService } from '@shared/di';
import { TOKENS } from '@shared/di/tokens';
import type { PlatformServices } from '@platform/types';

export const CONTENT_STYLE_PACKS = ['clipper', 'reader', 'video', 'prompt-task'] as const;
export type ContentStylePack = (typeof CONTENT_STYLE_PACKS)[number];

const styleCache = new Map<string, Promise<string>>();

export function isJsdomRuntime(): boolean {
  return /jsdom/i.test(globalThis.navigator?.userAgent ?? '');
}

export function contentStylePackPath(pack: ContentStylePack): string {
  return `ui/stitch-runtime/styles/${pack}.css`;
}

export function loadContentStylePack(pack: ContentStylePack): Promise<string> {
  return loadExtensionStyle(contentStylePackPath(pack));
}

export function loadExtensionStyle(path: string): Promise<string> {
  const cached = styleCache.get(path);
  if (cached) return cached;

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
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `[styleRegistry] Failed to load style "${path}": ${response.status} ${response.statusText}`
      );
    }
    const cssText = await response.text();
    if (/^\s*@import\b/m.test(cssText)) {
      throw new Error(`[styleRegistry] Style pack "${path}" is not flattened`);
    }
    return cssText;
  })().catch((error) => {
    if (styleCache.get(path) === pending) styleCache.delete(path);
    throw error;
  });
  styleCache.set(path, pending);
  return pending;
}

export function clearClipperStyleCache(): void {
  styleCache.clear();
}
