declare module '../../../scripts/utils/manifestHosts.mjs' {
  export function resolveRestHostPermissions(): string[];
  export function applyRestHostPermissions<T extends { host_permissions?: string[] }>(
    manifest: T
  ): T & { host_permissions?: string[] };
}

declare module '../../../scripts/utils/manifestSources.mjs' {
  export type BrowserManifestTarget = 'chrome' | 'firefox';

  export function createBrowserManifest(target: BrowserManifestTarget): Record<string, unknown>;
}
