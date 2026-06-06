import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { describe, expect, it } from 'vitest';
import { createSchemaTranslator } from '@options/stitch/schema/i18n';

describe('createSchemaTranslator', () => {
  it('returns the fallback when messages are missing', () => {
    expect(createSchemaTranslator(null)('schemaOverviewTitle', 'Fallback')).toBe('Fallback');
  });

  it('returns the catalog-backed message when one exists', () => {
    expect(
      createSchemaTranslator({
        ...DEFAULT_RUNTIME_MESSAGES,
        schemaOverviewTitle: 'Overview From Messages'
      })('schemaOverviewTitle', 'Fallback')
    ).toBe('Overview From Messages');
  });

  it('formats placeholder values', () => {
    expect(
      createSchemaTranslator({
        ...DEFAULT_RUNTIME_MESSAGES,
        schemaOverviewTitle: 'Saved {count}'
      })('schemaOverviewTitle', 'Fallback', { count: 3 })
    ).toBe('Saved 3');
  });
});
