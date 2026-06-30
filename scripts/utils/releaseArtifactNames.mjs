export const RELEASE_ARTIFACT_BASE_NAME = 'Zendio-All in Obsidian';

function normalizeExtension(extension) {
  return extension.startsWith('.') ? extension : `.${extension}`;
}

export function createReleaseArtifactBaseName(version, { suffix = '' } = {}) {
  return `${RELEASE_ARTIFACT_BASE_NAME}-v${version}${suffix}`;
}

export function createReleaseArtifactFileName(version, extension, { suffix = '' } = {}) {
  return `${createReleaseArtifactBaseName(version, { suffix })}${normalizeExtension(extension)}`;
}
