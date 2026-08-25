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
  readonly rawValues: Readonly<Record<string, string>>;
  readonly rawFingerprints: Readonly<Record<string, string>>;
  readonly policy: ReleaseBuildEnvironmentPolicy;
  readonly policyDigest: string;
  readonly esbuild: ReleaseEsbuildIdentity;
}

export interface ReleaseBuildEnvironmentPolicy {
  readonly id: 'release-build-env-v1';
  readonly sentry: Readonly<{
    dsn: '';
    enabled: false;
    environment: 'production';
    release: string;
  }>;
  readonly hostPermissions: readonly string[];
}

export interface ReleaseEsbuildIdentity {
  readonly platform: string;
  readonly architecture: string;
  readonly lockSha256: string;
  readonly jsPackage: Readonly<{
    name: 'esbuild';
    version: '0.28.1';
    packageJsonSha256: string;
  }>;
  readonly platformPackage: Readonly<{
    name: string;
    version: '0.28.1';
    packageJsonSha256: string;
    executableRelativePath: string;
    executableSize: number;
    executableSha256: string;
  }>;
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
export const RELEASE_BUILD_FORBIDDEN_KEYS: readonly string[];
export const RELEASE_BUILD_ENVIRONMENT_POLICY: ReleaseBuildEnvironmentPolicy;
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
  repoRoot?: string;
}): ReleasePublicBuildConfig;
export function resolveReleaseEsbuildIdentity(repoRoot?: string): ReleaseEsbuildIdentity;

export function runIsolatedReleaseBuild(
  options: {
    configMode: ReleasePublicConfigMode;
    browser: 'chrome' | 'firefox';
    distDir: string;
    tempDir: string;
    environment?: Readonly<Record<string, string | undefined>>;
  },
  dependencies?: {
    spawnSync?: (
      command: string,
      args: readonly string[],
      options: Readonly<{
        cwd: string;
        env: Readonly<Record<string, string>>;
        encoding: null;
        shell: false;
        timeout: number;
        maxBuffer: number;
      }>
    ) => {
      error?: Error;
      signal?: NodeJS.Signals | null;
      status?: number | null;
      stdout?: Buffer;
      stderr?: Buffer;
    };
  }
): Readonly<{
  browser: 'chrome' | 'firefox';
  attemptRoot: string;
  distDir: string;
  tempDir: string;
  config: ReleasePublicBuildConfig;
  argv: readonly string[];
  childEnvironment: Readonly<Record<string, string>>;
}>;

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
