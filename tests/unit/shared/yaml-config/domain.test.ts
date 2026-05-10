import { describe, expect, it } from 'vitest';
import {
  buildDomainKeyOrder,
  extractDomainFields,
  normalizeDomain,
  normalizeDomainKey
} from '@shared/services/yamlConfigDomain';
import { mergeFields } from '@shared/services/yamlConfigMerge';

describe('yamlConfigDomain', () => {
  it('normalizes URLs, wildcard keys, and empty values', () => {
    expect(normalizeDomain(' https://News.Example.com/articles/1 ')).toBe('news.example.com');
    expect(normalizeDomain('example.com.')).toBe('example.com');
    expect(normalizeDomainKey(' *.Example.com ')).toBe('*.example.com');
    expect(normalizeDomainKey(' * ')).toBe('*');
    expect(normalizeDomainKey('   ')).toBe('');
  });

  it('orders wildcard, bare, exact, and www aliases for override resolution', () => {
    expect(buildDomainKeyOrder('https://www.news.example.com/post')).toEqual([
      '*',
      '*.news.example.com',
      '*.example.com',
      'news.example.com',
      'www.news.example.com'
    ]);
  });

  it('extracts domain fields by merging matches in specificity order', () => {
    const fields = extractDomainFields(
      'https://news.example.com/post',
      new Map([
        ['*', [{ name: 'scope', type: 'text', enabled: true, defaultValue: 'all' }]],
        [
          '*.example.com',
          [{ name: 'scope', type: 'text', enabled: true, defaultValue: 'example' }]
        ],
        ['news.example.com', [{ name: 'section', type: 'text', enabled: true }]]
      ]),
      mergeFields
    );

    expect(fields).toEqual([
      { name: 'scope', type: 'text', enabled: true, defaultValue: 'example' },
      { name: 'section', type: 'text', enabled: true }
    ]);
  });
});
