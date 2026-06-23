const ABSOLUTE_ASSET_URL = /^(?:[a-z][a-z\d+\-.]*:|\/\/|\/)/i;

export type ProductionStitchAssetUrlResolver = (path: string) => string;

export type ProductionStitchAssetRuntime = {
  getURL(path: string): string;
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

export function resolveProductionStitchAssetUrl(
  path: string,
  runtime?: ProductionStitchAssetRuntime
): string {
  if (isAbsoluteAssetUrl(path)) {
    return path;
  }

  const extensionRootPath = normalizeProductionStitchAssetPath(path);
  if (runtime) {
    return runtime.getURL(extensionRootPath);
  }

  return `../${extensionRootPath}`;
}

export function createProductionStitchAssetUrlResolver(
  runtime?: ProductionStitchAssetRuntime
): ProductionStitchAssetUrlResolver {
  return (path) => resolveProductionStitchAssetUrl(path, runtime);
}
