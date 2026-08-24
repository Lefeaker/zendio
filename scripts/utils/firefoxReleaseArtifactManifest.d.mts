export type FirefoxReleaseTransportMode = 'local-private-v1' | 'github-artifact-v1';

export type FirefoxReleaseArtifactBinding = Readonly<{
  schema: 'portable-release-artifact-v1';
  transportMode: FirefoxReleaseTransportMode;
  releaseDir: string;
  geckoId: string;
  xpiPath: string;
  sourceArchivePath: string;
}>;

export const FIREFOX_RELEASE_ARTIFACT_SCHEMA: 'portable-release-artifact-v1';
export const FIREFOX_RELEASE_TRANSPORT_MODES: readonly FirefoxReleaseTransportMode[];
export function canonicalArtifactJson(value: unknown): string;
export function createFirefoxReleaseArtifactManifest(
  options: Record<string, unknown>
): Promise<Record<string, unknown>>;
export function verifyFirefoxReleaseArtifactManifest(options: {
  manifestPath: string;
  transportMode: FirefoxReleaseTransportMode;
  expectedAttemptRoot?: string;
}): Promise<FirefoxReleaseArtifactBinding>;
export function assertVerifiedFirefoxArtifactBinding(
  binding: unknown
): FirefoxReleaseArtifactBinding;
export function consumeVerifiedFirefoxArtifactBinding(
  binding: unknown,
  transportMode: FirefoxReleaseTransportMode
): Readonly<{
  xpiPath: string;
  sourceArchivePath: string;
  geckoId: string;
  transportMode: FirefoxReleaseTransportMode;
  manifest: Record<string, unknown>;
}>;
export function getVerifiedFirefoxArtifactSnapshot(binding: unknown): Readonly<{
  path: string;
  bytes: Buffer;
  inventory: readonly Readonly<{
    path: string;
    directory: boolean;
    size: number;
    crc32: number;
    sha256: string | null;
  }>[];
}>;
