export type BrowserManifestTarget = 'chrome' | 'firefox';

export function createBrowserManifest(target: BrowserManifestTarget): Record<string, unknown>;
