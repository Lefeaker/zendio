import { describe, expect, it } from 'vitest';
import {
  RELEASE_ARTIFACT_BASE_NAME,
  createReleaseArtifactBaseName,
  createReleaseArtifactFileName
} from '../../../scripts/utils/releaseArtifactNames.mjs';

describe('release artifact names', () => {
  it('uses the full Zendio display name for release package basenames', () => {
    expect(RELEASE_ARTIFACT_BASE_NAME).toBe('Zendio——All in Obsidian');
    expect(createReleaseArtifactBaseName('0.2.0')).toBe('Zendio——All in Obsidian-v0.2.0');
    expect(createReleaseArtifactFileName('0.2.0', 'zip')).toBe(
      'Zendio——All in Obsidian-v0.2.0.zip'
    );
  });

  it('keeps release suffixes before the file extension', () => {
    expect(createReleaseArtifactFileName('0.2.0', '.xpi', { suffix: '-signed' })).toBe(
      'Zendio——All in Obsidian-v0.2.0-signed.xpi'
    );
    expect(createReleaseArtifactFileName('0.2.0', 'zip', { suffix: '-release' })).toBe(
      'Zendio——All in Obsidian-v0.2.0-release.zip'
    );
  });
});
