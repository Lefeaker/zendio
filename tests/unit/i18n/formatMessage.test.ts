import { beforeEach, describe, expect, it } from 'vitest';
import { formatMessage } from '../../../src/i18n';
import {
  __resetMessageFormatterCacheForTests,
  getMessageFormatterCacheSize
} from '../../../src/i18n/messageFormatter';

describe('formatMessage (ICU)', () => {
  beforeEach(() => {
    __resetMessageFormatterCacheForTests();
  });

  it('supports simple placeholder interpolation', () => {
    const result = formatMessage('Hello {name}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('keeps missing placeholders unchanged', () => {
    const result = formatMessage('Hello {name} from {place}!', { name: 'World' });
    expect(result).toBe('Hello World from {place}!');
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

  it('returns a deterministic fallback when formatter parsing fails', () => {
    // Missing plural categories will throw; ensure we do not crash.
    const template = '{count, plural, =1 {# item}}';
    expect(() => formatMessage(template, { count: 3 }, 'en')).not.toThrow();
    expect(formatMessage(template, { count: 3 }, 'en')).toBe(template);
  });

  it('bounds formatter cache size for repeated unique templates', () => {
    for (let index = 0; index < 80; index += 1) {
      formatMessage(`Hello {name}! ${index}`, { name: 'World' }, 'en');
    }

    expect(getMessageFormatterCacheSize()).toBeLessThanOrEqual(64);
  });
});
