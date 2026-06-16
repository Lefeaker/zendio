import { describe, expect, it } from 'vitest';
import { DEFAULT_RUNTIME_MESSAGES } from '../../../src/i18n/locales';
import { RUNTIME_FALLBACK_MESSAGES } from '../../../src/i18n/catalog/runtimeFallbackMessages';

describe('runtime fallback messages', () => {
  it('keeps the narrow runtime fallback table equal to the default English catalog', () => {
    const expected = Object.fromEntries(
      Object.keys(RUNTIME_FALLBACK_MESSAGES).map((key) => [
        key,
        DEFAULT_RUNTIME_MESSAGES[key as keyof typeof RUNTIME_FALLBACK_MESSAGES]
      ])
    );

    expect(RUNTIME_FALLBACK_MESSAGES).toEqual(expected);
  });
});
