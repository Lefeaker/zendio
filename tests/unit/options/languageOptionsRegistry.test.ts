import { describe, expect, it } from 'vitest';
import { RELEASE_LANGUAGE_CONFIG, RELEASE_LANGUAGE_ORDER } from '@i18n/catalog/languages';
import { previewContent } from '@options/stitch/content';
import { createReleaseLanguageOptions } from '@options/stitch/languageOptions';

describe('Options language options registry', () => {
  it('uses the release language order and canonical codes', () => {
    const options = createReleaseLanguageOptions();
    expect(options.map((item) => item.value)).toEqual(RELEASE_LANGUAGE_ORDER);
    expect(options.map((item) => item.label)).toEqual(
      RELEASE_LANGUAGE_ORDER.map((code) => RELEASE_LANGUAGE_CONFIG[code].nativeName)
    );
    expect(options.map((item) => item.value)).not.toContain('es');
    expect(options.map((item) => item.value)).not.toContain('qps-ploc');
    expect(options).toHaveLength(12);
  });

  it('feeds production preview content from the same registry helper', () => {
    expect(previewContent.languageOptions).toEqual(createReleaseLanguageOptions());
  });
});
