import type { VerifiedChromeArtifactBinding } from './utils/releaseArtifactManifest.mjs';

export const CHROME_WEBSTORE_LIMITS: Readonly<{
  tokenMs: 30000;
  uploadMs: 180000;
  statusMs: 30000;
  publishMs: 60000;
  stateMs: 5000;
  terminalDrainMs: 1000;
  statusIntervalMs: 5000;
  statusAttempts: 12;
  statusTotalMs: 60000;
  tokenBytes: number;
  responseBytes: number;
  cumulativeBytes: number;
  stateBytes: number;
}>;

export const CHROME_DEFAULT_PUBLIC_PUBLISH_REQUEST: Readonly<{
  blockOnWarnings: true;
  deployInfos: readonly Readonly<{ deployPercentage: 100 }>[];
  publishType: 'DEFAULT_PUBLISH';
  skipReview: false;
}>;

export interface ChromeWebStoreConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly itemId: string;
  readonly publisherId: string;
}

export function readChromeWebStoreConfig(environment?: NodeJS.ProcessEnv): ChromeWebStoreConfig;
export function createChromeWebStoreUrls(
  config: Pick<ChromeWebStoreConfig, 'itemId' | 'publisherId'>
): Readonly<{
  name: string;
  upload: string;
  status: string;
  publish: string;
}>;
export function publishVerifiedChromeWebStore(
  options: {
    binding: VerifiedChromeArtifactBinding;
    stateFile: string;
    environment?: NodeJS.ProcessEnv;
  },
  dependencies?: {
    fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
    setTimeoutOperation?: typeof setTimeout;
    clearTimeoutOperation?: typeof clearTimeout;
  }
): Promise<
  Readonly<{ upload: unknown; publish: unknown; terminalResult: 'PENDING_REVIEW' | 'PUBLISHED' }>
>;
export function dryRunVerifiedChromeRelease(options: {
  binding: VerifiedChromeArtifactBinding;
  stateFile: string;
}): Promise<
  Readonly<{ mode: 'dry-run'; releaseSha: string; packageVersion: string; zipSha256: string }>
>;
export function resolveReleaseOptionsFromArgs(argv: readonly string[]): Readonly<{
  mode: 'dry-run' | 'publish';
  manifestPath: string;
  stateFile: string;
  transportMode: 'local-private-v1' | 'github-artifact-v1';
  zipPath?: string;
}>;
export function runChromeWebStoreCli(
  argv?: readonly string[],
  environment?: NodeJS.ProcessEnv
): Promise<unknown>;
