import { getService } from '@shared/di';
import { TOKENS } from '@shared/di/tokens';
import type { PlatformServices } from '@platform/types';

const styleCache = new Map<string, Promise<string>>();
const CSS_IMPORT_PATTERN =
  /^\s*@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^"')\s]+))\s*\)?\s*;/;

export function isJsdomRuntime(): boolean {
  return /jsdom/i.test(globalThis.navigator?.userAgent ?? '');
}

export async function loadExtensionStyle(path: string): Promise<string> {
  return loadExtensionStyleWithImports(path, new Set<string>());
}

async function loadExtensionStyleWithImports(
  path: string,
  importStack: Set<string>
): Promise<string> {
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
    const cssText = await response.text();
    return await inlineCssImports(path, cssText, importStack);
  })().catch((error) => {
    styleCache.delete(path);
    throw error;
  });
  styleCache.set(path, pending);
  return pending;
}

async function inlineCssImports(
  path: string,
  cssText: string,
  importStack: Set<string>
): Promise<string> {
  if (importStack.has(path)) {
    throw new Error(`[styleRegistry] Circular CSS import detected for "${path}"`);
  }

  importStack.add(path);
  try {
    const output: string[] = [];
    let remainingCss = cssText;

    while (remainingCss.length > 0) {
      const match = CSS_IMPORT_PATTERN.exec(remainingCss);
      if (!match) {
        break;
      }

      const importPath = match[1] ?? match[2] ?? match[3];
      if (!importPath || isExternalCssImport(importPath)) {
        output.push(match[0]);
      } else {
        output.push(
          await loadExtensionStyleWithImports(resolveCssImportPath(path, importPath), importStack)
        );
      }
      remainingCss = remainingCss.slice(match[0].length);
    }

    output.push(remainingCss);
    return output.join('');
  } finally {
    importStack.delete(path);
  }
}

function isExternalCssImport(importPath: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(importPath);
}

function resolveCssImportPath(fromPath: string, importPath: string): string {
  const stack = fromPath.split('/');
  stack.pop();

  for (const segment of importPath.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }

  return stack.join('/');
}

export function clearClipperStyleCache(): void {
  styleCache.clear();
}
