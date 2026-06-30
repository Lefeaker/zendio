import { describe, expect, it } from 'vitest';
import { assertManifestCompatibleVersion } from '../../../scripts/utils/packageMetadata.mjs';

describe('packageMetadata', () => {
  it('accepts package versions that are safe to project into extension manifests', () => {
    expect(assertManifestCompatibleVersion('0.2.1')).toBe('0.2.1');
    expect(assertManifestCompatibleVersion('1')).toBe('1');
    expect(assertManifestCompatibleVersion('1.2')).toBe('1.2');
    expect(assertManifestCompatibleVersion('65535.0.1.2')).toBe('65535.0.1.2');
  });

  it.each([
    '',
    '0',
    '0.0',
    '0.0.0.0',
    ' 0.2.1',
    '0.2.1 ',
    '01.2.3',
    '1.02.3',
    '1.2.03',
    '1.2.3.4.5',
    '1.2.3-beta.1',
    '1.2.-3',
    '1.2.65536'
  ])('rejects manifest-incompatible version "%s"', (version) => {
    expect(() => assertManifestCompatibleVersion(version, 'test version')).toThrow(/test version/);
  });
});
