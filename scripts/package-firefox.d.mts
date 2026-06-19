export type FirefoxSigningOptions = {
  distDir: string;
  artifactsDir: string;
  zipSafeName: string;
  version: string;
  apiKey: string;
  apiSecret: string;
  channel: string;
  extensionId?: string;
};

export type WebExtSigningApi = {
  cmd: {
    sign: (
      options: Record<string, unknown>,
      runnerOptions: { shouldExitProgram: boolean }
    ) => Promise<void>;
  };
};

export type FirefoxLintResult = {
  summary?: {
    errors?: number;
    warnings?: number;
    notices?: number;
  };
  errors?: Array<{ code?: string; message?: string }>;
  warnings?: Array<{ code?: string; message?: string }>;
  notices?: Array<{ code?: string; message?: string }>;
};

export type WebExtLintApi = {
  cmd: {
    lint: (
      options: {
        sourceDir: string;
        selfHosted: boolean;
        warningsAsErrors: boolean;
      },
      runnerOptions: { shouldExitProgram: boolean }
    ) => Promise<FirefoxLintResult>;
  };
};

export type FirefoxLintDependencies = {
  importWebExtImpl?: () => Promise<WebExtLintApi>;
  logger?: {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  };
  webExt?: WebExtLintApi;
};

export type FirefoxSigningDependencies = {
  auditReleaseArchiveImpl?: (archivePath: string) => Promise<void>;
  copyFileImpl?: (source: string, target: string) => Promise<void>;
  importWebExtImpl?: () => Promise<WebExtSigningApi>;
  logger?: {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  };
  mkdirImpl?: (path: string, options: { recursive: boolean }) => Promise<void>;
  pathExistsImpl?: (targetPath: string) => Promise<boolean>;
  readdirImpl?: (path: string) => Promise<string[]>;
  resolvePathImpl?: (targetName: string) => string;
  runSigningImpl?: (
    options: FirefoxSigningOptions,
    dependencies?: FirefoxSigningDependencies
  ) => Promise<string | null>;
  statImpl?: (path: string) => Promise<{ mtimeMs: number; size: number }>;
  webExt?: WebExtSigningApi;
};

export type FirefoxReleasePackageResult = {
  manifest: Record<string, unknown>;
  outputPath: string;
  resolvedName: string;
  version: string;
  xpiName: string;
  zipSafeName: string;
};

export type FirefoxReleasePackageDependencies = {
  applyRestHostPermissionsImpl?: (manifest: Record<string, unknown>) => Record<string, unknown>;
  auditReleaseArchiveImpl?: (archivePath: string) => Promise<void>;
  createUnsignedXpiImpl?: (
    distDir: string,
    resolvedName: string,
    version: string
  ) => Promise<{ xpiName: string; outputPath: string; zipSafeName: string }>;
  lintFirefoxExtensionImpl?: (distDir: string) => Promise<FirefoxLintResult | void>;
  logger?: {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  };
  prepareLicenseArtifactsImpl?: (distDir: string) => Promise<void>;
  readFileImpl?: (path: string, encoding: 'utf8') => Promise<string>;
  resolveMessageImpl?: (
    messageName: string,
    manifest: Record<string, unknown>,
    distDir: string
  ) => Promise<string>;
  writeFileImpl?: (path: string, content: string) => Promise<void>;
};

export function sanitizeFileName(text: string): string;

export function createUnsignedXpi(
  distDir: string,
  resolvedName: string,
  version: string
): Promise<{ xpiName: string; outputPath: string; zipSafeName: string }>;

export function lintFirefoxExtension(
  distDir: string,
  dependencies?: FirefoxLintDependencies
): Promise<FirefoxLintResult>;

export function runSigning(
  options: FirefoxSigningOptions,
  dependencies?: FirefoxSigningDependencies
): Promise<string | null>;

export function signAndAuditFirefoxPackage(
  options: FirefoxSigningOptions,
  dependencies?: FirefoxSigningDependencies
): Promise<string>;

export function prepareFirefoxReleasePackage(
  options: { distDir: string },
  dependencies?: FirefoxReleasePackageDependencies
): Promise<FirefoxReleasePackageResult>;

export function packageFirefoxExtension(): Promise<void>;
