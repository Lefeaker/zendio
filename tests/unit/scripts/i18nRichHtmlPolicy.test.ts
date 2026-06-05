import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateRichHtmlCatalogMessages } from '../../../scripts/utils/i18nRichHtmlPolicy.mjs';

const lintScript = resolve('scripts/lint-i18n.mjs');

describe('i18n rich HTML catalog policy', () => {
  it('accepts safe anchor attributes for explicit rich HTML keys', () => {
    const errors = validateRichHtmlCatalogMessages({
      en: {
        contactModalDescription:
          '<a href="https://example.com/support" target="_blank" rel="noopener noreferrer">contact</a>'
      }
    });

    expect(errors).toEqual([]);
  });

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

  it.each([
    ['strong', '<strong class="x">important</strong>', 'class'],
    ['em', '<em style="color:red">emphasis</em>', 'style'],
    ['code', '<code data-x="1">code</code>', 'data-x'],
    ['br', '<br id="break">', 'id'],
    ['a', '<a href="https://example.com" style="color:red">contact</a>', 'style']
  ])('rejects unsupported <%s> attributes', (_tag, value, attribute) => {
    const errors = validateRichHtmlCatalogMessages({
      en: {
        contactModalDescription: value
      }
    });

    expect(errors).toEqual(
      expect.arrayContaining([expect.stringContaining(`attribute ${attribute} is not allowed`)])
    );
  });

  it('rejects anchor tags without href before runtime sanitizer can flatten them', () => {
    const errors = validateRichHtmlCatalogMessages({
      en: {
        contactModalDescription: '<a target="_blank" rel="noopener noreferrer">contact</a>'
      }
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('[rich-html:en:contactModalDescription] <a> requires href')
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
