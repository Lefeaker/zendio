import { describe, expect, it } from 'vitest';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { CompleteOptions } from '@shared/types/options';
import {
  buildDomainEntries,
  buildRows,
  collectYamlConfig,
  createCustomRow,
  createDomainField,
  updateDefaultValue
} from '@options/widgets/yaml-config/model';

function options(overrides: Partial<CompleteOptions> = {}): CompleteOptions {
  return mergeOptions(overrides) as CompleteOptions;
}

describe('YAML config widget model', () => {
  it('builds rows from defaults and collects enabled custom fields', () => {
    const rows = buildRows(options());
    const custom = createCustomRow();
    custom.name = 'project';
    custom.enabled.article = true;
    updateDefaultValue(custom, 'article', 'research');
    rows.push(custom);

    expect(collectYamlConfig(rows, [])?.contentTypes?.article?.customFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'project',
          defaultValue: 'research',
          enabled: true
        })
      ])
    );
  });

  it('round-trips domain override entries from options', () => {
    const draft = options({
      yamlConfig: {
        contentTypes: {
          article: {
            domainOverrides: {
              'example.com': [{ name: 'title', type: 'text', enabled: true }]
            }
          }
        }
      }
    } as Partial<CompleteOptions>);
    const rows = buildRows(draft);
    const entries = buildDomainEntries(draft, rows);

    expect(entries[0]).toEqual(
      expect.objectContaining({
        domain: 'example.com',
        contentType: 'article'
      })
    );
    expect(collectYamlConfig(rows, entries)?.contentTypes?.article?.domainOverrides).toEqual({
      'example.com': [expect.objectContaining({ name: 'title' })]
    });
  });

  it('creates domain fields from the selected content type field set', () => {
    const rows = buildRows(options());
    const field = createDomainField(rows, 'article');

    expect(field.name).toBeTruthy();
    expect(field.enabled).toBe(true);
  });
});
