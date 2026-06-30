export const RELEASE_ARTIFACT_BASE_NAME: 'Zendio-All in Obsidian';

export function createReleaseArtifactBaseName(
  version: string,
  options?: { suffix?: string }
): string;

export function createReleaseArtifactFileName(
  version: string,
  extension: string,
  options?: { suffix?: string }
): string;
