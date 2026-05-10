import { describe, expect, it } from 'vitest';
import {
  cloneConfig,
  mergeContentTypeConfig,
  mergeDomainOverrides,
  mergeFields
} from '@shared/services/yamlConfigMerge';
import type { ContentTypeYamlConfig } from '@shared/types/yamlConfig';

describe('yamlConfigMerge', () => {
  it('clones merged fields so callers cannot mutate source config', () => {
    const base = [{ name: 'title', type: 'text' as const, enabled: true, defaultValue: ['a'] }];
    const merged = mergeFields(base);

    expect(merged).toEqual([{ name: 'title', type: 'text', enabled: true, defaultValue: ['a'] }]);
    (merged[0]?.defaultValue as string[]).push('b');
    expect(base[0]?.defaultValue).toEqual(['a']);
  });

  it('normalizes and merges domain override maps', () => {
    const merged = mergeDomainOverrides(
      {
        ' *.Example.com ': [{ name: 'source', type: 'text', enabled: true }]
      },
      {
        'https://news.example.com/path': [{ name: 'source', type: 'text', enabled: false }]
      }
    );

    expect(Array.from(merged.keys())).toEqual(['*.example.com', 'news.example.com']);
    expect(merged.get('news.example.com')).toEqual([
      { name: 'source', type: 'text', enabled: false }
    ]);
  });

  it('builds content type configs with fields, custom fields, and domain overrides', () => {
    const base: ContentTypeYamlConfig = {
      contentType: 'article',
      fields: [{ name: 'title', type: 'text', enabled: true }],
      domainOverrides: {
        '*': [{ name: 'site', type: 'text', enabled: true }]
      }
    };

    const merged = mergeContentTypeConfig('article', cloneConfig(base), {
      fields: [{ name: 'title', type: 'text', enabled: false }],
      customFields: [{ name: 'project', type: 'text', enabled: true, isCustom: true }]
    });

    expect(merged?.fields).toEqual([{ name: 'title', type: 'text', enabled: false }]);
    expect(merged?.customFields).toEqual([
      { name: 'project', type: 'text', enabled: true, isCustom: true }
    ]);
    expect(merged?.domainOverrides?.['*']).toEqual([{ name: 'site', type: 'text', enabled: true }]);
  });
});
