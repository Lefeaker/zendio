// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { CompleteOptions } from '@shared/types/options';
import {
  buildRows,
  createCustomRow,
  type YamlDomainEntry
} from '@options/widgets/yaml-config/model';
import {
  hasValidationErrors,
  renderValidationState,
  validateYamlWidgetState
} from '@options/widgets/yaml-config/validationPresenter';

function options(): CompleteOptions {
  return mergeOptions(null) as CompleteOptions;
}

describe('YAML config widget validation presenter', () => {
  it('aggregates row validation errors across content types', () => {
    const rows = buildRows(options());
    const custom = createCustomRow();
    custom.name = 'bad field name';
    custom.enabled.article = true;
    rows.push(custom);

    const validation = validateYamlWidgetState(rows, []);

    expect(hasValidationErrors(validation)).toBe(true);
    expect(validation.rowErrors.get(custom.id)?.join('\n')).toContain('Field name');
  });

  it('renders global, row, and domain validation state into existing hosts', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div data-yaml-errors="global"></div>
      <table><tbody><tr data-row-id="row-1"><td></td><td></td></tr></tbody></table>
      <section data-domain-rule-id="domain-1"><div data-yaml-domain-errors="domain-1"></div></section>
    `;
    renderValidationState(container, {
      globalErrors: ['Global error'],
      rowErrors: new Map([['row-1', ['Row error']]]),
      domainErrors: new Map([['domain-1', ['Domain error']]])
    });

    expect(container.querySelector('[data-yaml-errors="global"]')?.textContent).toContain(
      'Global error'
    );
    expect(container.querySelector('[data-row-id="row-1"]')?.classList.contains('is-invalid')).toBe(
      true
    );
    expect(container.querySelector('[data-domain-rule-id="domain-1"]')?.textContent).toContain(
      'Domain error'
    );
  });

  it('reports domain override validation errors', () => {
    const rows = buildRows(options());
    const entries: YamlDomainEntry[] = [
      {
        id: 'domain-1',
        domain: '',
        contentType: 'article',
        fields: []
      }
    ];

    const validation = validateYamlWidgetState(rows, entries);

    expect(hasValidationErrors(validation)).toBe(true);
    expect(validation.domainErrors.get('domain-1')?.length).toBeGreaterThan(0);
  });
});
