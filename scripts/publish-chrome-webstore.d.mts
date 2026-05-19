export interface ChromeWebStoreConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  itemId: string;
  publisherId: string;
}

export interface PublishChromeWebStorePackageOptions {
  zipPath: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  readFileImpl?: (path: string) => Promise<Buffer>;
  logger?: Pick<Console, 'log' | 'error'>;
}

export interface ChromeWebStoreUrls {
  upload: string;
  publish: string;
}

export interface DryRunChromeWebStoreReleaseOptions {
  zipPath: string;
  env?: Record<string, string | undefined>;
  accessImpl?: (path: string) => Promise<void>;
  logger?: Pick<Console, 'log' | 'error'>;
}

export interface DryRunChromeWebStoreReleaseResult {
  mode: 'dry-run';
  itemId: string;
  publisherId: string;
  zipPath: string;
  tokenUrl: string;
  uploadUrl: string;
  publishUrl: string;
}

export interface ChromeWebStoreReleaseOptions {
  mode: 'dry-run' | 'publish';
  zipPath: string;
}

export function readChromeWebStoreConfig(
  env?: Record<string, string | undefined>
): ChromeWebStoreConfig;

export function createChromeWebStoreUrls(
  config: Pick<ChromeWebStoreConfig, 'publisherId' | 'itemId'>
): ChromeWebStoreUrls;

export function publishChromeWebStorePackage(
  options: PublishChromeWebStorePackageOptions
): Promise<{ upload: unknown; publish: unknown }>;

export function dryRunChromeWebStoreRelease(
  options: DryRunChromeWebStoreReleaseOptions
): Promise<DryRunChromeWebStoreReleaseResult>;

export function resolveReleaseOptionsFromArgs(
  argv: string[],
  cwd?: string
): Promise<ChromeWebStoreReleaseOptions>;
