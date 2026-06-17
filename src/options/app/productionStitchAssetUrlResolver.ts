const ABSOLUTE_ASSET_URL = /^(?:[a-z][a-z\d+\-.]*:|\/\/|\/)/i;

type ExtensionRuntimeLike = {
  getURL?: (path: string) => string;
};

type ExtensionGlobalScope = typeof globalThis & {
  chrome?: { runtime?: ExtensionRuntimeLike };
  browser?: { runtime?: ExtensionRuntimeLike };
};

function isAbsoluteAssetUrl(path: string): boolean {
  return ABSOLUTE_ASSET_URL.test(path);
}

export function normalizeProductionStitchAssetPath(path: string): string {
  if (isAbsoluteAssetUrl(path)) {
    return path;
  }
  return path.replace(/^\.\/+/, '').replace(/^(?:\.\.\/)+/, '');
}

function resolveExtensionRuntime(): ExtensionRuntimeLike | undefined {
  const scope = globalThis as ExtensionGlobalScope;
  return scope.chrome?.runtime ?? scope.browser?.runtime;
}

export function resolveProductionStitchAssetUrl(path: string): string {
  if (isAbsoluteAssetUrl(path)) {
    return path;
  }

  const extensionRootPath = normalizeProductionStitchAssetPath(path);
  const runtime = resolveExtensionRuntime();
  if (typeof runtime?.getURL === 'function') {
    return runtime.getURL(extensionRootPath);
  }

  return `../${extensionRootPath}`;
}
