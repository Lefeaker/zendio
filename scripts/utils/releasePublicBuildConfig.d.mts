export type ReleasePublicConfigMode = 'standalone-synthetic' | 'owner-public-vars';

export interface ReleasePublicBuildConfig {
  readonly configMode: ReleasePublicConfigMode;
  readonly values: Readonly<{
    measurementId: string;
    transportMode: 'proxy';
    proxyEndpoint: string;
  }>;
  readonly fingerprint: string;
  readonly artifactConfigEligible: boolean;
}

export interface LockedDependencyCruiserBinding {
  readonly repoRoot: string;
  readonly cliPath: string;
  readonly packageDigest: string;
  readonly dependencyProjectionDigest: string;
  readonly lockDigest: string;
  readonly configDigest: string;
  readonly cliDigest: string;
}

export const RELEASE_PUBLIC_CONFIG_KEYS: readonly string[];
export const RELEASE_PUBLIC_CONFIG_MODES: readonly ReleasePublicConfigMode[];
export const STANDALONE_SYNTHETIC_CONFIG: Readonly<{
  measurementId: string;
  transportMode: 'proxy';
  proxyEndpoint: string;
}>;
export const LOCKED_DEPENDENCY_CRUISER: Readonly<{
  packageName: 'dependency-cruiser';
  version: '16.10.4';
  packageRelativeCli: string;
  configRelativePath: string;
  argv: readonly string[];
  timeoutMs: number;
  stdoutBytes: number;
  stderrBytes: number;
}>;

export function validateReleasePublicBuildConfig(input: {
  configMode: ReleasePublicConfigMode;
  environment: Readonly<Record<string, string | undefined>>;
}): ReleasePublicBuildConfig;

export function runLockedDependencyCruiser(
  options?: {
    repoRoot?: string;
    environment?: Readonly<Record<string, string | undefined>>;
  },
  dependencies?: {
    readHeadFile?: (repoRoot: string, relativePath: string) => Buffer | string;
    spawnSync?: (
      command: string,
      args: readonly string[],
      options: Readonly<Record<string, unknown>>
    ) => {
      error?: Error & { code?: string };
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      signal?: NodeJS.Signals | null;
      status?: number | null;
    };
  }
): Readonly<{
  stdout: Buffer;
  stderr: Buffer;
  binding: LockedDependencyCruiserBinding;
}>;
