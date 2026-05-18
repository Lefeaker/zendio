import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_YAML_CONFIG } from '@shared/config/yamlDefaults';
import * as yamlConfigModule from '@shared/services/yamlConfigService';

const { YamlConfigService, normalizeYamlConfigOverrides } = yamlConfigModule;

import type { YamlConfigOverrides, YamlFieldConfig } from '@shared/types/yamlConfig';

const findField = (fields: YamlFieldConfig[], name: string): YamlFieldConfig | undefined =>
  fields.find((field) => field.name === name);

describe('normalizeYamlConfigOverrides', () => {
  it('returns null for invalid input', () => {
    expect(normalizeYamlConfigOverrides(undefined)).toBeNull();
    expect(normalizeYamlConfigOverrides('foo')).toBeNull();
  });

  it('upgrades legacy array structure', () => {
    const legacy: unknown = {
      contentTypes: [
        {
          contentType: 'article',
          fields: [
            { name: 'title', type: 'text', enabled: true },
            { name: ' invalid name ', type: 'text', enabled: true }
          ],
          customFields: [{ name: 'project', type: 'text', defaultValue: 'demo' }]
        }
      ],
      globalFields: [
        { name: 'tag', type: 'array', defaultValue: ['a', 'b'] },
        { name: 'bad field', type: 'text' }
      ]
    };

    const normalized = normalizeYamlConfigOverrides(legacy);
    expect(normalized).not.toBeNull();
    expect(normalized?.contentTypes?.article?.fields).toHaveLength(1);
    expect(normalized?.contentTypes?.article?.fields?.[0]?.name).toBe('title');
    expect(normalized?.contentTypes?.article?.customFields?.[0]?.isCustom).toBe(true);
    expect(normalized?.globalFields).toHaveLength(1);
    expect(normalized?.globalFields?.[0]?.name).toBe('tag');
  });
});

describe('YamlConfigService', () => {
  let service: InstanceType<typeof YamlConfigService>;

  beforeEach(() => {
    service = new YamlConfigService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes overrides before resolving config', () => {
    const overrides: YamlConfigOverrides = {
      contentTypes: {
        clipper: {
          fields: [
            { name: 'tags', type: 'text', enabled: false },
            { name: 'export_mode', type: 'text', enabled: 'false' as unknown as boolean }
          ],
          customFields: [{ name: '  custom_label  ', type: 'text', enabled: true }]
        }
      },
      globalFields: [{ name: 'workspace', type: 'text', enabled: true }]
    };

    const resolved = service.resolveConfig('clipper', overrides);
    const fieldNames = resolved.fields.map((field) => field.name);
    expect(fieldNames).toContain('custom_label');
    expect(fieldNames).toContain('tags');
    const tagsField = findField(resolved.fields, 'tags');
    expect(tagsField?.enabled).toBe(false);
    expect(fieldNames).toContain('workspace');
  });

  it('returns default config without mutating shared references', () => {
    const firstResult = service.resolveConfig('article', null);
    expect(findField(firstResult.fields, 'title')?.required).toBe(true);

    if (firstResult.fields[0]) {
      firstResult.fields[0].name = 'mutated';
      firstResult.fields[0].enabled = false;
    }

    const secondResult = service.resolveConfig('article', null);
    expect(secondResult.fields[0]?.name).toBe('type');
    expect(secondResult.fields).not.toBe(firstResult.fields);
    expect(findField(secondResult.fields, 'type')?.defaultValue).toBe('article');
  });

  it('merges direct field overrides, domain overrides and global fields', () => {
    const overrides: YamlConfigOverrides = {
      contentTypes: {
        article: {
          fields: [
            { name: 'title', type: 'text', enabled: false },
            { name: 'author', type: 'text', enabled: true, description: 'from overrides' }
          ],
          customFields: [{ name: 'custom_flag', type: 'boolean', enabled: true, isCustom: true }],
          domainOverrides: {
            '*': [{ name: 'base_tag', type: 'text', enabled: true }],
            '*.example.com': [
              { name: 'title', type: 'text', enabled: false, defaultValue: 'example' }
            ],
            'news.example.com': [
              { name: 'title', type: 'text', enabled: true, defaultValue: 'news headline' },
              { name: 'breaking_tag', type: 'text', enabled: true }
            ]
          }
        }
      },
      globalFields: [{ name: 'workspace', type: 'text', enabled: true }]
    };

    const resolved = service.resolveConfig('article', overrides, {
      domain: 'https://news.example.com/articles/1'
    });

    const titleField = findField(resolved.fields, 'title');
    expect(titleField?.enabled).toBe(true);
    expect(titleField?.defaultValue).toBe('news headline');
    expect(findField(resolved.fields, 'base_tag')).toBeDefined();
    expect(findField(resolved.fields, 'breaking_tag')).toBeDefined();
    expect(findField(resolved.fields, 'author')).toMatchObject({
      description: 'from overrides',
      enabled: true
    });
    expect(findField(resolved.fields, 'workspace')).toBeDefined();
    expect(findField(resolved.fields, 'custom_flag')?.isCustom).toBe(true);
  });

  it('does not mutate overrides input and remains pure between calls', () => {
    const overrides: YamlConfigOverrides = {
      contentTypes: {
        clipper: {
          fields: [{ name: 'highlight_count', type: 'number', enabled: true }],
          customFields: [{ name: 'clip_label', type: 'text', enabled: true, isCustom: true }]
        }
      }
    };
    const before = JSON.stringify(overrides);
    const first = service.resolveConfig('clipper', overrides);
    expect(JSON.stringify(overrides)).toBe(before);

    first.fields.forEach((field) => {
      field.enabled = false;
    });

    const second = service.resolveConfig('clipper', overrides);
    expect(second.fields.some((field) => field.enabled)).toBe(true);
  });

  it('validates and normalizes YAML overrides', () => {
    const rawInput: unknown = {
      contentTypes: {
        article: {
          fields: [
            { name: ' title ', type: 'text', enabled: 'false' },
            { name: '1invalid', type: 'text', enabled: true }
          ],
          domainOverrides: {
            ' https://News.example.com ': [
              { name: ' tags ', type: 'array', defaultValue: 'a, b , c ' },
              { name: '##bad', type: 'text', enabled: true }
            ]
          }
        }
      },
      globalFields: [
        { name: ' workspace ', type: 'text', enabled: 'true' },
        { name: 'bad field', type: 'text' }
      ]
    };

    const normalized = service.validateYamlConfig(rawInput);
    expect(normalized?.contentTypes?.article?.fields).toHaveLength(1);
    expect(normalized?.contentTypes?.article?.fields?.[0]?.name).toBe('title');
    expect(normalized?.contentTypes?.article?.fields?.[0]?.enabled).toBe(false);

    const domainFields = normalized?.contentTypes?.article?.domainOverrides?.['news.example.com'];
    expect(domainFields).toBeDefined();
    expect(domainFields?.[0]?.name).toBe('tags');
    expect(domainFields?.[0]?.defaultValue).toEqual(['a', 'b', 'c']);

    expect(normalized?.globalFields).toHaveLength(1);
    expect(normalized?.globalFields?.[0]?.name).toBe('workspace');
    expect(normalized?.globalFields?.[0]?.isCustom).toBe(true);
  });

  it('ignores invalid content type keys returned from normalizeYamlConfigOverrides', () => {
    vi.spyOn(yamlConfigModule, 'normalizeYamlConfigOverrides').mockReturnValue({
      contentTypes: {
        article: {
          fields: [{ name: 'title', type: 'text', enabled: false }]
        },
        invalid_type: {
          fields: [{ name: 'noop', type: 'text', enabled: true }]
        }
      }
    } as unknown as YamlConfigOverrides);

    const result = service.resolveConfig('article', {} as YamlConfigOverrides);
    expect(findField(result.fields, 'title')).toBeDefined();
  });

  it('throws when normalized bundle lacks requested content type', () => {
    const defaults = DEFAULT_YAML_CONFIG;
    const originalArticle = defaults.contentTypes.article;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (defaults.contentTypes as Record<string, typeof originalArticle | undefined>).article;

    try {
      expect(() => service.resolveConfig('article', null)).toThrow(
        '[yamlConfigService] 未找到内容类型 article 的配置'
      );
    } finally {
      defaults.contentTypes.article = originalArticle;
    }
  });

  it('merges domain overrides defined in defaults', () => {
    const defaults = DEFAULT_YAML_CONFIG;
    const videoDefaults = defaults.contentTypes.video;
    if (!videoDefaults) {
      throw new Error('video defaults missing');
    }
    const originalDomainOverrides = videoDefaults.domainOverrides;
    videoDefaults.domainOverrides = {
      '*.example.com': [{ name: 'from_defaults', type: 'text', enabled: true }]
    };

    try {
      const result = service.resolveConfig('video', null, {
        domain: 'https://news.example.com/watch?v=1'
      });
      expect(findField(result.fields, 'from_defaults')).toBeDefined();
    } finally {
      if (originalDomainOverrides) {
        videoDefaults.domainOverrides = originalDomainOverrides;
      } else {
        delete videoDefaults.domainOverrides;
      }
    }
  });

  it('resolves www-prefixed domains by honoring specific overrides first', () => {
    const overrides: YamlConfigOverrides = {
      contentTypes: {
        article: {
          domainOverrides: {
            '*.example.com': [{ name: 'wildcard_field', type: 'text', enabled: true }],
            'www.example.com': [{ name: 'www_only', type: 'text', enabled: true }]
          }
        }
      }
    };

    const resolved = service.resolveConfig('article', overrides, {
      domain: 'https://www.example.com/post'
    });
    expect(findField(resolved.fields, 'wildcard_field')).toBeDefined();
    expect(findField(resolved.fields, 'www_only')).toBeDefined();
  });
});
