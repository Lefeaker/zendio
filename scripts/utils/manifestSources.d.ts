export type BrowserManifestTarget = 'chrome' | 'firefox';

export interface ManifestSourceOptions {
  rootDir?: string;
  version?: string;
}

export function createBrowserManifest(
  target: BrowserManifestTarget,
  options?: ManifestSourceOptions
): Record<string, unknown>;
