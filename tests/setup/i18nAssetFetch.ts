import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const nativeFetch =
  typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;

function resolveI18nAssetPath(input: RequestInfo | URL): string | null {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : 'url' in input
          ? input.url
          : '';

  let pathname = rawUrl;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    pathname = rawUrl;
  }

  const normalizedPath = pathname.replace(/^\/+/, '');
  return normalizedPath.startsWith('i18n/') ? join(repoRoot, 'public', normalizedPath) : null;
}

async function defaultI18nAssetFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const assetPath = resolveI18nAssetPath(input);
  if (assetPath && existsSync(assetPath)) {
    return new Response(readFileSync(assetPath, 'utf8'), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
      status: 200
    });
  }

  if (nativeFetch) {
    return nativeFetch(input, init);
  }

  return new Response(null, { status: 404 });
}

export function ensureI18nAssetFetch(): void {
  globalThis.fetch = defaultI18nAssetFetch;
}

ensureI18nAssetFetch();

beforeEach(() => {
  ensureI18nAssetFetch();
});
