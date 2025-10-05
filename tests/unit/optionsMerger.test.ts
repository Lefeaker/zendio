import { describe, it, expect } from 'vitest';
import { mergeOptions } from '../../src/shared/config/optionsMerger';
import { DEFAULT_OPTIONS } from '../../src/shared/config';
import type { StoredOptions } from '../../src/shared/types';

describe('shared optionsMerger', () => {
  it('returns defaults when no stored options provided', () => {
    const result = mergeOptions(undefined);
    expect(result.rest.baseUrl).toBe(DEFAULT_OPTIONS.rest.baseUrl);
    expect(result.templates.article).toBe(DEFAULT_OPTIONS.templates.article);
    expect(result.templates.reading).toBe(DEFAULT_OPTIONS.templates.reading);
    expect(result.domainMappings).toEqual(DEFAULT_OPTIONS.domainMappings);
  });

  it('merges partial rest and classifier values', () => {
    const stored: StoredOptions = {
      rest: {
        baseUrl: 'https://example.com',
        apiKey: 'token'
      },
      classifier: {
        enabled: true,
        provider: 'openai',
        model: 'gpt-4o'
      },
      fragmentClipper: {
        captureContext: true
      }
    };

    const result = mergeOptions(stored);
    expect(result.rest.baseUrl).toBe('https://example.com');
    expect(result.rest.apiKey).toBe('token');
    expect(result.rest.httpsUrl).toBe(DEFAULT_OPTIONS.rest.httpsUrl);
    expect(result.classifier?.enabled).toBe(true);
    expect(result.classifier?.provider).toBe('openai');
    expect(result.classifier?.model).toBe('gpt-4o');
    expect(result.classifier?.taxonomy).toEqual(DEFAULT_OPTIONS.classifier?.taxonomy);
    expect(result.fragmentClipper?.captureContext).toBe(true);
    expect(result.fragmentClipper?.contextLength).toBe(DEFAULT_OPTIONS.fragmentClipper?.contextLength);
    expect(result.templates.reading).toBe(DEFAULT_OPTIONS.templates.reading);
  });
});
