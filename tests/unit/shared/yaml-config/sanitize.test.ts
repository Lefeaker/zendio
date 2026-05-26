import { describe, expect, it } from 'vitest';
import {
  normalizeYamlConfigOverrides,
  sanitizeDefaultValue,
  sanitizeField,
  sanitizeFieldList,
  toBoolean,
  toFieldType
} from '@shared/services/yamlConfigSanitize';

describe('yamlConfigSanitize', () => {
  it('parses primitive YAML field values', () => {
    expect(toFieldType('number')).toBe('number');
    expect(toFieldType('unknown')).toBe('text');
    expect(toBoolean('false', true)).toBe(false);
    expect(toBoolean(0, true)).toBe(false);
    expect(sanitizeDefaultValue('array', 'a, b, ,c')).toEqual(['a', 'b', 'c']);
    expect(sanitizeDefaultValue('number', '42')).toBe(42);
  });

  it('sanitizes and de-duplicates field lists', () => {
    expect(
      sanitizeFieldList(
        [
          { name: ' title ', type: 'text', enabled: 'false' },
          { name: 'title', type: 'number', enabled: true },
          { name: '1bad', type: 'text', enabled: true }
        ],
        { markCustom: true }
      )
    ).toEqual([{ name: 'title', type: 'text', enabled: false, isCustom: true }]);
  });

  it('filters invalid override shapes and unsupported default field names', () => {
    const normalized = normalizeYamlConfigOverrides({
      contentTypes: {
        article: {
          fields: [
            { name: 'title', type: 'text', enabled: false },
            { name: 'custom_not_default', type: 'text', enabled: true }
          ],
          customFields: [{ name: 'project', type: 'text', enabled: true }],
          domainOverrides: {
            ' https://News.Example.com ': [{ name: 'tags', type: 'array', defaultValue: 'a,b' }]
          }
        },
        unsupported: {
          fields: [{ name: 'title', type: 'text', enabled: false }]
        }
      }
    });

    expect(normalized?.contentTypes?.article?.fields).toEqual([
      { name: 'title', type: 'text', enabled: false }
    ]);
    expect(normalized?.contentTypes?.article?.customFields?.[0]).toMatchObject({
      name: 'project',
      isCustom: true
    });
    expect(normalized?.contentTypes?.article?.domainOverrides?.['news.example.com']).toEqual([
      { name: 'tags', type: 'array', enabled: true, defaultValue: ['a', 'b'] }
    ]);
    expect(normalized?.contentTypes).not.toHaveProperty('unsupported');
  });

  it('rejects invalid fields', () => {
    expect(sanitizeField(null)).toBeNull();
    expect(sanitizeField({ name: 'bad field', type: 'text' })).toBeNull();
  });

  it.each([
    [
      'normalizes optional field attributes',
      {
        name: ' status ',
        type: 'boolean',
        enabled: 'true',
        required: 'false',
        description: 42,
        valuePath: ' meta.status ',
        defaultValue: 'false'
      },
      {
        name: 'status',
        type: 'boolean',
        enabled: true,
        required: false,
        description: '42',
        valuePath: 'meta.status',
        defaultValue: false
      }
    ],
    [
      'drops blank value paths',
      {
        name: 'summary',
        type: 'text',
        valuePath: '   '
      },
      {
        name: 'summary',
        type: 'text',
        enabled: true
      }
    ],
    [
      'falls back unsupported field types to text',
      {
        name: 'category',
        type: 'object',
        enabled: 0
      },
      {
        name: 'category',
        type: 'text',
        enabled: false
      }
    ]
  ])('%s', (_caseName, input, expected) => {
    expect(sanitizeField(input)).toEqual(expected);
  });
});
