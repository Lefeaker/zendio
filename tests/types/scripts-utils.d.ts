declare module '../../../scripts/utils/manifestHosts.mjs' {
  export function resolveRestHostPermissions(): string[];
  export function applyRestHostPermissions<T extends { host_permissions?: string[] }>(
    manifest: T
  ): T & { host_permissions?: string[] };
}

declare module '../../../scripts/utils/manifestSources.mjs' {
  export type BrowserManifestTarget = 'chrome' | 'firefox';

  export interface ManifestSourceOptions {
    rootDir?: string;
    version?: string;
  }

  export function createBrowserManifest(
    target: BrowserManifestTarget,
    options?: ManifestSourceOptions
  ): Record<string, unknown>;
}

declare module '../../../scripts/utils/packageMetadata.mjs' {
  type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

  export const REPO_ROOT: string;

  export function assertManifestCompatibleVersion(version: unknown, source?: string): string;

  export function readPackageMetadata(rootDir?: string): {
    packageJson: { [key: string]: JsonValue };
    packagePath: string;
  };

  export function readPackageVersion(rootDir?: string): string;

  export function readPackageVersionLabel(rootDir?: string): string;
}

declare module '../../../scripts/utils/i18nRichHtmlPolicy.mjs' {
  export function validateRichHtmlCatalogMessages(
    localeMessages: Record<string, Record<string, string>>
  ): string[];
}
