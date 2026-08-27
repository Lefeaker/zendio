export type FirefoxReleasePackageResult = {
  artifactBaseName: string;
  manifest: Record<string, unknown>;
  outputPath: string;
  resolvedName: string;
  version: string;
  xpiName: string;
};

export type FirefoxStaticValidationDependencies = {
  applyRestHostPermissionsImpl?: (manifest: Record<string, unknown>) => Record<string, unknown>;
  createBrowserManifestImpl?: (browser: 'firefox') => Record<string, unknown>;
  logger?: { log: (...args: unknown[]) => void };
  pathExistsImpl?: (path: string) => Promise<boolean>;
  readFileImpl?: (path: string, encoding: 'utf8') => Promise<string>;
};

export type FirefoxReleasePackageDependencies = {
  applyRestHostPermissionsImpl?: (manifest: Record<string, unknown>) => Record<string, unknown>;
  auditReleaseArchiveImpl?: (archivePath: string) => Promise<void>;
  createUnsignedXpiImpl?: (
    distDir: string,
    resolvedName: string,
    version: string,
    options?: {
      publication?: {
        mode: 'release-no-replace-v1';
        outputDir: string;
        workDir: string;
      };
    }
  ) => Promise<{ xpiName: string; outputPath: string; artifactBaseName: string }>;
  logger?: { log: (...args: unknown[]) => void };
  prepareLicenseArtifactsImpl?: (distDir: string) => Promise<void>;
  readFileImpl?: (path: string, encoding: 'utf8') => Promise<string>;
  resolveMessageImpl?: (
    messageName: string,
    manifest: Record<string, unknown>,
    distDir: string
  ) => Promise<string>;
  validateFirefoxExtensionImpl?: (distDir: string) => Promise<Record<string, unknown> | void>;
  writeFileImpl?: (path: string, content: string) => Promise<void>;
};

export function createUnsignedXpi(
  distDir: string,
  resolvedName: string,
  version: string,
  options?: {
    publication?: {
      mode: 'release-no-replace-v1';
      outputDir: string;
      workDir: string;
    };
  }
): Promise<{ xpiName: string; outputPath: string; artifactBaseName: string }>;

export function validateFirefoxExtension(
  distDir: string,
  dependencies?: FirefoxStaticValidationDependencies
): Promise<Record<string, unknown>>;

export function prepareFirefoxReleasePackage(
  options: {
    distDir: string;
    publication?: {
      mode: 'release-no-replace-v1';
      outputDir: string;
      workDir: string;
    };
  },
  dependencies?: FirefoxReleasePackageDependencies
): Promise<FirefoxReleasePackageResult>;

export function packageFirefoxExtension(): Promise<void>;
