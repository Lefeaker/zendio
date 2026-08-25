export type ReleaseArtifactTransportMode = 'local-private-v1' | 'github-artifact-v1';

export interface VerifiedChromeArtifactBinding {
  readonly schema: 'portable-release-artifact-v1';
  readonly browser: 'chrome';
  readonly transportMode: ReleaseArtifactTransportMode;
  readonly releaseDir: string;
  readonly manifestPath: string;
  readonly zipPath: string;
  readonly releaseSha: string;
  readonly releaseTree: string;
  readonly packageVersion: string;
  readonly authorizationMode: 'standalone-unproven' | 'attached-ci-provenance-v1';
}

export const RELEASE_ARTIFACT_SCHEMA: 'portable-release-artifact-v1';
export const RELEASE_ARTIFACT_TRANSPORT_MODES: readonly ReleaseArtifactTransportMode[];
export const RELEASE_ARTIFACT_LIMITS: Readonly<{
  authorizationBytes: number;
  manifestBytes: number;
  resultBytes: number;
  artifactBytes: number;
  maximumDepth: 32;
  maximumRows: 4096;
  maximumPathBytes: 1024;
  maximumStringBytes: 4096;
}>;

export function canonicalReleaseArtifactJson(value: unknown): string;
export function normalizeUploadArtifactDigestOutput(value: string): string;
export function parseRestArtifactDigest(value: unknown): string;
export function parseCanonicalActionArtifactId(value: unknown): string;
export function parseCanonicalRestArtifactId(value: unknown): string;
export function createChromeReleaseArtifactManifest(
  options: Record<string, unknown>
): Promise<Record<string, unknown>>;
export function verifyChromeReleaseArtifactManifest(options: {
  manifestPath: string;
  transportMode: ReleaseArtifactTransportMode;
  expectedAttemptRoot?: string;
}): Promise<VerifiedChromeArtifactBinding>;
export function assertVerifiedChromeArtifactBinding(
  binding: unknown
): VerifiedChromeArtifactBinding;
export function consumeVerifiedChromeArtifactBinding(
  binding: unknown,
  transportMode: ReleaseArtifactTransportMode
): Readonly<{
  binding: VerifiedChromeArtifactBinding;
  manifest: Record<string, unknown>;
  zipPath: string;
  zipBytes: Buffer;
  zipSha256: string;
}>;
export function writeCanonicalReleaseFile(
  path: string,
  value: unknown,
  maximumBytes?: number
): Promise<string>;
export function runReleaseArtifactUtilityCli(
  argv?: readonly string[],
  environment?: NodeJS.ProcessEnv
): Promise<string>;
