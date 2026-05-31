import { describe, expect, it } from 'vitest';
import { DEFAULT_YAML_CONFIG } from '@shared/config';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { CompleteOptions } from '@shared/types/options';
import type { YamlConfigOverrides, YamlContentType } from '@shared/types/yamlConfig';
import {
  buildDomainEntries,
  buildRows,
  collectYamlConfig,
  CONTENT_TYPES,
  createCustomRow,
  updateDefaultValue,
  updateValuePath
} from '@options/widgets/yaml-config/model';
import {
  buildInitialDomainOverrides,
  buildInitialRows,
  collectYamlConfigOverrides,
  formatArrayValue,
  parseDefaultValueWithValidation
} from '@ui/domains/yaml-config/yamlConfigTableModel';
import { validateYamlConfig } from '@ui/domains/yaml-config/yamlConfigTableValidation';
import type {
  DomainOverrideEntry,
  FieldRow,
  YamlConfigDomainLabels,
  YamlConfigTableLabels
} from '@ui/domains/yaml-config/yamlConfigTableTypes';

const tableLabels: Pick<YamlConfigTableLabels, 'errors' | 'warnings'> = {
  errors: {
    nameRequired: 'name required',
    namePattern: 'invalid name',
    nameDuplicate: 'duplicate name',
    typeRequired: 'type required',
    modeRequired: 'mode required',
    valueInvalid: 'invalid value',
    valuePathInvalid: 'invalid value path'
  },
  warnings: {
    unresolvedErrors: 'unresolved errors'
  }
};

const domainLabels: Pick<YamlConfigDomainLabels, 'errors' | 'warnings'> = {
  errors: {
    domainRequired: 'domain required',
    domainDuplicate: 'duplicate domain',
    fieldRequired: 'field required',
    fieldDuplicate: 'duplicate field',
    fieldUnsupported: 'unsupported field',
    valueInvalid: 'invalid domain value',
    valuePathInvalid: 'invalid domain value path'
  },
  warnings: {
    unresolvedErrors: 'unresolved errors'
  }
};

function completeOptions(yamlConfig?: YamlConfigOverrides): CompleteOptions {
  return mergeOptions(yamlConfig ? { yamlConfig } : {}) as CompleteOptions;
}

function baseOrder(rows: FieldRow[]): Map<string, number> {
  return new Map(rows.map((row, index) => [row.id, index]));
}

function isFieldAvailable(
  rows: FieldRow[],
  fieldName: string,
  contentType: YamlContentType
): boolean {
  return rows.some(
    (row) =>
      row.name === fieldName &&
      (row.isCustom || row.supported[contentType] || row.originTypes.has(contentType))
  );
}

describe('current YAML editor behavior characterization', () => {
  it('loads default rows for every YAML content type from DEFAULT_YAML_CONFIG', () => {
    const rows = buildRows(completeOptions());

    for (const contentType of CONTENT_TYPES) {
      const expected = DEFAULT_YAML_CONFIG.contentTypes[contentType]?.fields.map(
        (field) => field.name
      );
      const actual = rows
        .filter((row) => row.builtIn && row.supported[contentType])
        .map((row) => row.name)
        .sort();

      expect(actual).toEqual([...(expected ?? [])].sort());
    }
  });

  it('collects added, edited, and toggled custom fields for each content type', () => {
    for (const contentType of CONTENT_TYPES) {
      const rows = buildRows(completeOptions());
      const custom = createCustomRow();
      custom.name = `${contentType}_summary`;
      custom.type = 'text';
      CONTENT_TYPES.forEach((candidate) => {
        custom.enabled[candidate] = candidate === contentType;
      });
      updateDefaultValue(custom, contentType, `${contentType} default`);
      updateValuePath(custom, contentType, `metadata.${contentType}`);
      rows.push(custom);

      const collected = collectYamlConfig(rows, []);

      expect(collected?.contentTypes?.[contentType]?.customFields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: `${contentType}_summary`,
            type: 'text',
            enabled: true,
            defaultValue: `${contentType} default`,
            valuePath: `metadata.${contentType}`,
            isCustom: true
          })
        ])
      );
      const otherTypes = CONTENT_TYPES.filter((candidate) => candidate !== contentType);
      otherTypes.forEach((candidate) => {
        expect(
          collected?.contentTypes?.[candidate]?.customFields?.some(
            (field) => field.name === `${contentType}_summary`
          )
        ).not.toBe(true);
      });
    }
  });

  it('loads and collects globalFields with native widget parity', () => {
    const yamlConfig: YamlConfigOverrides = {
      globalFields: [
        {
          name: 'source',
          type: 'text',
          enabled: true,
          defaultValue: 'web',
          valuePath: 'metadata.source'
        }
      ]
    };
    const rows = buildRows(completeOptions(yamlConfig));

    expect(rows.find((row) => row.name === 'source')).toEqual(
      expect.objectContaining({
        isGlobal: true,
        defaultValue: 'web',
        valuePath: 'metadata.source'
      })
    );
    expect(collectYamlConfig(rows, [])?.globalFields).toEqual([
      {
        name: 'source',
        type: 'text',
        enabled: true,
        defaultValue: 'web',
        valuePath: 'metadata.source',
        isCustom: true
      }
    ]);
  });

  it('loads and collects exact and wildcard domain overrides', () => {
    const yamlConfig: YamlConfigOverrides = {
      contentTypes: {
        article: {
          domainOverrides: {
            'docs.example.com': [{ name: 'title', type: 'text', enabled: true }],
            '*.example.com': [
              { name: 'tags', type: 'array', enabled: true, defaultValue: ['docs', 'example'] }
            ]
          }
        }
      }
    };
    const rows = buildInitialRows(yamlConfig);
    const domainEntries = buildInitialDomainOverrides(yamlConfig, rows);

    expect(domainEntries.map((entry) => entry.domain)).toEqual([
      'docs.example.com',
      '*.example.com'
    ]);
    expect(
      collectYamlConfigOverrides({
        rows,
        domainEntries,
        baseOrder: baseOrder(rows)
      })?.contentTypes?.article?.domainOverrides
    ).toEqual({
      'docs.example.com': [{ name: 'title', type: 'text', enabled: true }],
      '*.example.com': [
        { name: 'tags', type: 'array', enabled: true, defaultValue: ['docs', 'example'] }
      ]
    });
  });

  it('reports duplicate domains within the same content type case-insensitively', () => {
    const rows = buildInitialRows();
    const domainEntries: DomainOverrideEntry[] = [
      {
        id: 'domain-1',
        domain: 'Docs.Example.com',
        contentType: 'article',
        fields: [{ id: 'field-1', name: 'title', type: 'text', enabled: true, defaultValue: '' }]
      },
      {
        id: 'domain-2',
        domain: 'docs.example.com',
        contentType: 'article',
        fields: [{ id: 'field-2', name: 'url', type: 'text', enabled: true, defaultValue: '' }]
      }
    ];

    const validation = validateYamlConfig({
      rows,
      domainEntries,
      tableLabels,
      domainLabels,
      isFieldAvailableForContentType: (fieldName, contentType) =>
        isFieldAvailable(rows, fieldName, contentType)
    });

    expect(validation.domainErrors.get('domain-2')).toContain('duplicate domain');
    expect(validation.globalErrors).toContain('unresolved errors');
  });

  it('parses and formats array defaults with semicolon, comma, and newline separators', () => {
    const raw = 'alpha; beta, gamma\ndelta';

    expect(parseDefaultValueWithValidation('array', raw)).toEqual({
      value: ['alpha', 'beta', 'gamma', 'delta']
    });
    expect(formatArrayValue(raw)).toBe('alpha; beta; gamma; delta');
  });

  it('reports invalid boolean and number defaults without throwing', () => {
    expect(parseDefaultValueWithValidation('boolean', 'yes')).toEqual({
      error: 'INVALID_BOOLEAN'
    });
    expect(parseDefaultValueWithValidation('number', 'not-a-number')).toEqual({
      error: 'INVALID_NUMBER'
    });
  });

  it('rejects editable valuePath values containing spaces', () => {
    const rows = buildInitialRows();
    const row = rows.find((candidate) => candidate.name === 'title');
    expect(row).toBeDefined();
    if (!row) {
      return;
    }
    row.valuePath = 'metadata title';

    const validation = validateYamlConfig({
      rows,
      domainEntries: [],
      tableLabels,
      domainLabels,
      isFieldAvailableForContentType: (fieldName, contentType) =>
        isFieldAvailable(rows, fieldName, contentType)
    });

    expect(validation.rowErrors.get(row.id)).toContain('invalid value path');
  });

  it('blocks collection when validation has unresolved invalid state', () => {
    const rows = buildInitialRows();
    const invalidRow: FieldRow = {
      id: 'invalid-number-row',
      name: 'invalid_number',
      type: 'number',
      defaultValue: 'NaN',
      enabled: { article: true, clipper: false, video: false, ai_chat: false },
      supported: { article: true, clipper: true, video: true, ai_chat: true },
      builtIn: false,
      isCustom: true,
      required: false,
      originTypes: new Set<YamlContentType>()
    };
    rows.push(invalidRow);

    const validation = validateYamlConfig({
      rows,
      domainEntries: [],
      tableLabels,
      domainLabels,
      isFieldAvailableForContentType: (fieldName, contentType) =>
        isFieldAvailable(rows, fieldName, contentType)
    });
    const blockedResult =
      validation.rowErrors.size || validation.domainErrors.size || validation.globalErrors.length
        ? null
        : collectYamlConfigOverrides({ rows, domainEntries: [], baseOrder: baseOrder(rows) });

    expect(validation.rowErrors.get(invalidRow.id)).toContain('invalid value');
    expect(blockedResult).toBeNull();
  });

  it('loads domain overrides through native widget model without corrupting fields', () => {
    const draft = completeOptions({
      contentTypes: {
        video: {
          domainOverrides: {
            'video.example.com': [
              {
                name: 'platform',
                type: 'text',
                enabled: true,
                defaultValue: 'example',
                valuePath: 'metadata.platform'
              }
            ]
          }
        }
      }
    });
    const rows = buildRows(draft);
    const domainEntries = buildDomainEntries(draft, rows);

    expect(collectYamlConfig(rows, domainEntries)?.contentTypes?.video?.domainOverrides).toEqual({
      'video.example.com': [
        {
          name: 'platform',
          type: 'text',
          enabled: true,
          defaultValue: 'example',
          valuePath: 'metadata.platform'
        }
      ]
    });
  });
});
