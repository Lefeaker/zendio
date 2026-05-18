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

export function readChromeWebStoreConfig(
  env?: Record<string, string | undefined>
): ChromeWebStoreConfig;

export function publishChromeWebStorePackage(
  options: PublishChromeWebStorePackageOptions
): Promise<{ upload: unknown; publish: unknown }>;
