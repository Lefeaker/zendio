/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';
import {
  buildInitialDomainOverrides,
  buildInitialRows,
  collectYamlConfigOverrides,
  createToggleMap,
  ensureDomainEntryFields,
  findFieldDefinition
} from '../../../src/ui/domains/yaml-config/yamlConfigTableModel';
import {
  collectYamlDomainLabels,
  collectYamlTableLabels
} from '../../../src/ui/domains/yaml-config/yamlConfigTableLabels';
import { validateYamlConfig } from '../../../src/ui/domains/yaml-config/yamlConfigTableValidation';

describe('yamlConfigTable state model characterization', () => {
  it('preserves default row values and dataset labels while applying initial overrides', () => {
    const initial: YamlConfigOverrides = {
      contentTypes: {
        article: {
          fields: [{ name: 'type', type: 'text', enabled: true, defaultValue: 'note' }],
          customFields: [
            {
              name: 'priority',
              type: 'number',
              enabled: true,
              defaultValue: 3,
              valuePath: 'metadata.priority'
            }
          ]
        }
      }
    };
    const host = document.createElement('div');
    host.dataset.labelDefault = 'Default Value';
    host.dataset.labelCustomGroup = 'Custom metadata';

    const rows = buildInitialRows(initial);
    const typeRow = rows.find((row) => row.name === 'type');
    const priorityRow = rows.find((row) => row.name === 'priority');
    const statusRow = rows.find((row) => row.name === 'status');
    const labels = collectYamlTableLabels(host);

    expect(typeRow).toMatchObject({ defaultValue: 'note', builtIn: true });
    expect(priorityRow).toMatchObject({
      defaultValue: '3',
      isCustom: true,
      valuePath: 'metadata.priority'
    });
    expect(priorityRow?.enabled.article).toBe(true);
    expect(statusRow).toMatchObject({ defaultValue: 'unread', isCustom: true });
    expect(labels.defaultValue).toBe('Default Value');
    expect(labels.customGroup).toBe('Custom metadata');
  });

  it('keeps validation errors stable for invalid YAML rows and domain fields', () => {
    const tableLabels = collectYamlTableLabels(null);
    const domainLabels = collectYamlDomainLabels(null);
    const rows = buildInitialRows();
    rows.push({
      id: 'custom-score',
      name: 'score',
      type: 'number',
      defaultValue: 'not-a-number',
      enabled: createToggleMap(true),
      supported: createToggleMap(true),
      builtIn: false,
      isCustom: true,
      required: false,
      valuePath: 'bad path',
      originTypes: new Set()
    });
    const domainEntries = [
      {
        id: 'domain-1',
        domain: 'docs.example.com',
        contentType: 'article' as const,
        fields: [
          {
            id: 'domain-field-1',
            name: 'title',
            type: 'text' as const,
            enabled: true,
            defaultValue: '',
            valuePath: 'invalid path'
          }
        ]
      }
    ];
    const validate = () =>
      validateYamlConfig({
        rows,
        domainEntries,
        tableLabels,
        domainLabels,
        isFieldAvailableForContentType: (fieldName, contentType) =>
          rows.some(
            (row) =>
              row.name === fieldName &&
              (row.isCustom || row.supported[contentType] || row.originTypes.has(contentType))
          )
      });

    const first = validate();
    const second = validate();

    expect(first.rowErrors.get('custom-score')).toEqual(second.rowErrors.get('custom-score'));
    expect(first.domainErrors.get('domain-1')).toEqual(second.domainErrors.get('domain-1'));
    expect(first.globalErrors).toEqual(second.globalErrors);
    expect(first.rowErrors.get('custom-score')).toContain(tableLabels.errors.valueInvalid);
    expect(first.rowErrors.get('custom-score')).toContain(tableLabels.errors.valuePathInvalid);
    expect(first.domainErrors.get('domain-1')).toContain(domainLabels.errors.valuePathInvalid);
  });

  it('keeps domain entry and retained field identity while updating and pruning fields', () => {
    const initial: YamlConfigOverrides = {
      contentTypes: {
        article: {
          domainOverrides: {
            'docs.example.com': [
              { name: 'title', type: 'text', enabled: true, defaultValue: 'Docs' }
            ]
          }
        }
      }
    };
    const rows = buildInitialRows(initial);
    const entries = buildInitialDomainOverrides(initial, rows);
    const entry = entries[0];
    const retainedField = entry.fields[0];
    const tagsDefinition = findFieldDefinition(rows, 'article', 'tags');

    entry.domain = 'kb.example.com';
    entry.fields.push({
      id: 'manual-tags',
      name: 'tags',
      type: tagsDefinition?.type ?? 'array',
      enabled: true,
      defaultValue: 'one; two',
      valuePath: tagsDefinition?.valuePath ?? ''
    });
    ensureDomainEntryFields(entry, rows, (fieldName, contentType) =>
      rows.some(
        (row) =>
          row.name === fieldName &&
          (row.isCustom || row.supported[contentType] || row.originTypes.has(contentType))
      )
    );
    entry.fields = entry.fields.filter((field) => field.name !== 'tags');

    expect(entry.id).toBe(entries[0]?.id);
    expect(entry.domain).toBe('kb.example.com');
    expect(entry.fields).toHaveLength(1);
    expect(entry.fields[0]).toBe(retainedField);
  });

  it('collects reapplied rows and domain entries into the current override shape', () => {
    const initial: YamlConfigOverrides = {
      contentTypes: {
        article: {
          customFields: [
            {
              name: 'score',
              type: 'number',
              enabled: true,
              defaultValue: 7,
              valuePath: 'metadata.score'
            }
          ],
          domainOverrides: {
            'docs.example.com': [
              { name: 'author', type: 'text', enabled: true, defaultValue: 'Docs Team' }
            ]
          }
        }
      }
    };
    const rows = buildInitialRows(initial);
    const domainEntries = buildInitialDomainOverrides(initial, rows);
    const baseOrder = new Map(rows.map((row, index) => [row.id, index]));

    const collected = collectYamlConfigOverrides({ rows, domainEntries, baseOrder });

    expect(collected?.contentTypes?.article?.customFields).toEqual([
      expect.objectContaining({
        name: 'score',
        type: 'number',
        defaultValue: 7,
        valuePath: 'metadata.score',
        isCustom: true
      }),
      expect.objectContaining({
        name: 'status',
        type: 'array',
        defaultValue: ['unread'],
        isCustom: true
      })
    ]);
    expect(collected?.contentTypes?.article?.domainOverrides).toEqual({
      'docs.example.com': [
        expect.objectContaining({ name: 'author', type: 'text', defaultValue: 'Docs Team' })
      ]
    });
  });
});
