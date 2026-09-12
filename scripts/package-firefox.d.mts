export type FirefoxReleasePackageResult = {
  artifactBaseName: string;
  manifest: Record<string, unknown>;
  outputPath: string;
  resolvedName: string;
  version: string;
  xpiName: string;
};

export type FirefoxLintSummary = {
  errors: number;
  warnings: number;
  notices: number;
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
  lintFirefoxExtensionImpl?: (distDir: string) => Promise<FirefoxLintSummary | void>;
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

export type FirefoxLintDependencies = {
  logger?: {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  };
  runBoundedCommandImpl?: (
    invocation: {
      profileId: 'firefox-addons-lint-v1';
      arguments: readonly [string];
    },
    dependencies: { mirrorOutput: false; environment: Readonly<Record<string, string | undefined>> }
  ) => Promise<{
    ok: boolean;
    exitCode: number | null;
    terminalReason: string;
    output: {
      stdout: { text: string };
      stderr: { text: string };
    };
  }>;
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

export function lintFirefoxExtension(
  distDir: string,
  dependencies?: FirefoxLintDependencies
): Promise<FirefoxLintSummary>;

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
export function lintFirefoxExtensionOnly(): Promise<void>;
