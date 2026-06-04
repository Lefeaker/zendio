import { describe, expect, it } from 'vitest';
import { pseudoLocalizeString } from '../../../src/i18n/pseudoLocalization';

describe('pseudoLocalization', () => {
  it('preserves simple placeholders while pseudo-localizing visible text', () => {
    expect(pseudoLocalizeString('Hello {name}!')).toBe('[Ĥèːľľòː {name}!·13]');
  });

  it('preserves ICU plural syntax while pseudo-localizing branch text', () => {
    const template = '{count, plural, =0 {No items} one {# item} other {# items}}';
    const localized = pseudoLocalizeString(template);

    expect(localized).toContain('{count, plural, =0 {');
    expect(localized).toContain('one {# ');
    expect(localized).toContain('other {# ');
    expect(localized).toContain('Ñòː');
    expect(localized).toContain('ìːťèːṁ');
    expect(localized).not.toContain('No items');
    expect(localized).toContain(`·${template.length}]`);
  });

  it('preserves select syntax and nested placeholders inside formatter branches', () => {
    const template = '{gender, select, female {{count} invitee} other {{count} invitees}}';
    const localized = pseudoLocalizeString(template);

    expect(localized).toContain('{gender, select, female {');
    expect(localized).toContain('{count}');
    expect(localized).toContain('ìːñṽ');
    expect(localized).not.toContain('invitee');
    expect(localized).toContain(`·${template.length}]`);
  });
});
