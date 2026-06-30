type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const REPO_ROOT: string;

export function assertManifestCompatibleVersion(version: unknown, source?: string): string;

export function readPackageMetadata(rootDir?: string): {
  packageJson: { [key: string]: JsonValue };
  packagePath: string;
};

export function readPackageVersion(rootDir?: string): string;

export function readPackageVersionLabel(rootDir?: string): string;
