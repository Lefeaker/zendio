import { describe, it, expect } from 'vitest';
import { resolveAdaptiveText } from '@shared/i18n/textAdaptation';
import { createI18nResource } from '../../../src/i18n/resource';
import type { Messages } from '../../../src/i18n/messages';
import en from '../../../src/i18n/generated/locales/en.generated';

function createMessages(overrides: Partial<Messages>): Messages {
  return {
    ...en.runtime,
    ...overrides
  };
}

describe('resolveAdaptiveText', () => {
  it('returns full text when within budget', () => {
    const messages = createMessages({});
    const resource = createI18nResource({
      language: 'en',
      messages,
      fallbackChain: [en.runtime]
    });

    const result = resolveAdaptiveText('clipButton', resource, { viewportWidth: 1024 });

    expect(result.value).toBe(messages.clipButton);
    expect(result.usedShort).toBe(false);
    expect(result.overLimit).toBe(false);
  });

  it('uses short variant when text exceeds limit', () => {
    const messages = createMessages({
      testConnectionButton: '⚡ Test Connection With Extremely Long Label',
      testConnectionButton_short: '⚡ Test'
    });
    const resource = createI18nResource({
      language: 'en',
      messages,
      fallbackChain: [en.runtime]
    });

    const result = resolveAdaptiveText('testConnectionButton', resource, { viewportWidth: 1024 });

    expect(result.usedShort).toBe(true);
    expect(result.value).toBe(messages.testConnectionButton_short);
    expect(result.original).toBe(messages.testConnectionButton);
  });

  it('marks overflow when no short variant fits within budget', () => {
    const longLabel = 'Clip extremely detailed selection with metadata';
    const messages = createMessages({
      clipButton: longLabel,
      clipButton_short: 'Clip with metadata' // Still exceeds desktop budget
    });
    const resource = createI18nResource({
      language: 'en',
      messages,
      fallbackChain: [en.runtime]
    });

    const result = resolveAdaptiveText('clipButton', resource, { viewportWidth: 1024 });

    expect(result.usedShort).toBe(false);
    expect(result.value).toBe(longLabel);
    expect(result.overLimit).toBe(true);
  });
});
