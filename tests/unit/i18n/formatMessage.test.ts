import { describe, it, expect } from 'vitest';
import { formatMessage } from '../../../src/i18n';

describe('formatMessage (ICU)', () => {
  it('supports simple placeholder interpolation', () => {
    const result = formatMessage('Hello {name}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('supports ICU plural rules', () => {
    const template = '{count, plural, one {# file} other {# files}}';

    expect(formatMessage(template, { count: 1 }, 'en')).toBe('1 file');
    expect(formatMessage(template, { count: 2 }, 'en')).toBe('2 files');
  });

  it('applies locale-specific pluralisation', () => {
    const template = '{count, plural, one {# elemento} other {# elementos}}';
    expect(formatMessage(template, { count: 1 }, 'es-ES')).toBe('1 elemento');
    expect(formatMessage(template, { count: 3 }, 'es-ES')).toBe('3 elementos');
  });

  it('falls back to legacy behaviour when formatter fails', () => {
    // Missing plural categories will throw; ensure we do not crash.
    const template = '{count, plural, =1 {# item}}';
    expect(formatMessage(template, { count: 3 }, 'en')).toBe(template);
  });
});
