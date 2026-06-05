import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateRichHtmlCatalogMessages } from '../../../scripts/utils/i18nRichHtmlPolicy.mjs';

const lintScript = resolve('scripts/lint-i18n.mjs');

describe('i18n rich HTML catalog policy', () => {
  it('rejects HTML tags outside the explicit allowlist keys', () => {
    const errors = validateRichHtmlCatalogMessages({
      en: {
        clipSuccess: '<a href="https://example.com">Saved</a>'
      }
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('[rich-html:en:clipSuccess] HTML tags are only allowed')
      ])
    );
  });

  it('rejects javascript URLs even for allowlist keys', () => {
    const errors = validateRichHtmlCatalogMessages({
      en: {
        contactModalDescription: '<a href="javascript:alert(1)">contact</a>'
      }
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('[rich-html:en:contactModalDescription] unsafe javascript URL')
      ])
    );
  });

  it('rejects inline event handlers even for allowlist keys', () => {
    const errors = validateRichHtmlCatalogMessages({
      en: {
        contactModalDescription: '<a href="https://example.com" onclick="alert(1)">contact</a>'
      }
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          '[rich-html:en:contactModalDescription] event attributes are forbidden'
        )
      ])
    );
  });

  it('accepts the checked-in catalog through the i18n lint command', () => {
    const result = spawnSync(process.execPath, [lintScript], {
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toContain(
      '[lint-i18n] All catalog locales passed consistency checks.'
    );
  });
});
