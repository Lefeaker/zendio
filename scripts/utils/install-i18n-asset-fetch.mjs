import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const helperDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(helperDir, '../..');

function resolveI18nAssetPath(input) {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input && typeof input.url === 'string'
          ? input.url
          : '';

  let pathname = rawUrl;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    pathname = rawUrl;
  }

  const normalizedPath = pathname.replace(/^\/+/, '');
  return normalizedPath.startsWith('i18n/') ? path.join(repoRoot, 'public', normalizedPath) : null;
}

export function installI18nAssetFetch() {
  const nativeFetch =
    typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;

  globalThis.fetch = async (input, init) => {
    const assetPath = resolveI18nAssetPath(input);
    if (assetPath && existsSync(assetPath)) {
      return new Response(await readFile(assetPath, 'utf8'), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
        status: 200
      });
    }

    if (nativeFetch) {
      return nativeFetch(input, init);
    }

    return new Response(null, { status: 404 });
  };
}
