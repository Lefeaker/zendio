import { getService } from '@shared/di';
import { TOKENS } from '@shared/di/tokens';
import type { PlatformServices } from '@platform/types';

const STYLE_DIRECTORY = 'styles/clipper';
const styleCache = new Map<string, Promise<string>>();

function resolveStyleUrl(name: string): string {
  const normalized = name.endsWith('.css') ? name : `${name}.css`;
  try {
    const platformServices = getService<PlatformServices>(TOKENS.platformServices);
    return platformServices.runtime.getURL(`${STYLE_DIRECTORY}/${normalized}`);
  } catch {
    return `${STYLE_DIRECTORY}/${normalized}`;
  }
}

async function fetchStyle(name: string): Promise<string> {
  const url = resolveStyleUrl(name);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`[styleRegistry] Failed to load clipper style "${name}": ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

export function loadClipperStyle(name: string): Promise<string> {
  if (!styleCache.has(name)) {
    const entry = fetchStyle(name).catch((error) => {
      styleCache.delete(name);
      throw error;
    });
    styleCache.set(name, entry);
  }
  return styleCache.get(name)!;
}

export function clearClipperStyleCache(): void {
  styleCache.clear();
}
