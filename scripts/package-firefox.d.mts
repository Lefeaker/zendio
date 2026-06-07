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

export function sanitizeFileName(text: string): string;

export function createUnsignedXpi(
  distDir: string,
  resolvedName: string,
  version: string
): Promise<{ xpiName: string; outputPath: string; zipSafeName: string }>;

export function runSigning(
  options: FirefoxSigningOptions,
  dependencies?: FirefoxSigningDependencies
): Promise<string | null>;

export function signAndAuditFirefoxPackage(
  options: FirefoxSigningOptions,
  dependencies?: FirefoxSigningDependencies
): Promise<string>;

export function packageFirefoxExtension(): Promise<void>;
