// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { YamlContentType } from '@shared/types/yamlConfig';
import {
  renderDomainRules,
  type DomainRulesCallbacks
} from '@options/widgets/yaml-config/domainRulesRenderer';
import {
  renderFieldTable,
  type FieldTableCallbacks
} from '@options/widgets/yaml-config/fieldTableRenderer';
import {
  createToggleMap,
  type YamlDomainEntry,
  type YamlFieldRow
} from '@options/widgets/yaml-config/model';

function createRow(overrides: Partial<YamlFieldRow> = {}): YamlFieldRow {
  return {
    id: 'row-title',
    name: 'title',
    type: 'text',
    enabled: createToggleMap(true),
    supported: createToggleMap(true),
    defaultValues: {},
    valuePaths: {},
    defaultValue: '',
    valuePath: 'title',
    required: false,
    builtIn: true,
    isGlobal: false,
    originTypes: new Set<YamlContentType>(['article']),
    ...overrides
  };
}

function createFieldCallbacks(): FieldTableCallbacks {
  return {
    markDirty: vi.fn(),
    removeRow: vi.fn(),
    render: vi.fn(),
    setFilter: vi.fn()
  };
}

function createDomainCallbacks(): DomainRulesCallbacks {
  return {
    addDomainEntry: vi.fn(),
    markDirty: vi.fn(),
    removeDomainEntry: vi.fn(),
    render: vi.fn()
  };
}

function changeInput(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function changeSelect(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('YAML config native renderers', () => {
  it('renders the field table with stable row and YAML field markers', () => {
    const rows = [
      createRow({ id: 'row-title', name: 'title' }),
      createRow({
        id: 'row-hidden',
        name: 'hidden',
        enabled: createToggleMap(false),
        supported: createToggleMap(false)
      }),
      createRow({ id: 'row-summary', name: 'summary' })
    ];

    const table = renderFieldTable(rows, 'article', createFieldCallbacks());

    expect(table.classList.contains('stitch-yaml-config-table')).toBe(true);
    expect(
      Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr')).map(
        (row) => row.dataset.rowId
      )
    ).toEqual(['row-title', 'row-summary']);
    expect(
      Array.from(table.querySelectorAll<HTMLElement>('[data-yaml-field]')).map(
        (node) => node.dataset.yamlField
      )
    ).toEqual(expect.arrayContaining(['name', 'type', 'defaultValue', 'valuePath']));
  });

  it('updates a rendered field input and calls markDirty once', () => {
    const row = createRow();
    const callbacks = createFieldCallbacks();
    const table = renderFieldTable([row], 'all', callbacks);
    const nameInput = table.querySelector<HTMLInputElement>('[data-yaml-field="name"]');

    expect(nameInput).toBeTruthy();
    if (!nameInput) {
      throw new Error('Expected name input');
    }
    changeInput(nameInput, 'headline');

    expect(row.name).toBe('headline');
    expect(callbacks.markDirty).toHaveBeenCalledTimes(1);
    expect(callbacks.render).not.toHaveBeenCalled();
  });

  it('updates enabled and supported state when a content checkbox changes', () => {
    const row = createRow({
      builtIn: false,
      enabled: createToggleMap(false),
      supported: createToggleMap(false)
    });
    const callbacks = createFieldCallbacks();
    const table = renderFieldTable([row], 'all', callbacks);
    const checkbox = table.querySelector<HTMLInputElement>('[data-mode="clipper"]');

    expect(checkbox).toBeTruthy();
    if (!checkbox) {
      throw new Error('Expected clipper checkbox');
    }
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(row.enabled.clipper).toBe(true);
    expect(row.supported.clipper).toBe(true);
    expect(callbacks.markDirty).toHaveBeenCalledTimes(1);
  });

  it('removes custom rows through the delete button and rerenders', () => {
    const row = createRow({ builtIn: false });
    const callbacks = createFieldCallbacks();
    const table = renderFieldTable([row], 'all', callbacks);
    const deleteButton = table.querySelector<HTMLButtonElement>('.yaml-delete-button');

    expect(deleteButton?.disabled).toBe(false);
    deleteButton?.click();

    expect(callbacks.removeRow).toHaveBeenCalledWith(row);
    expect(callbacks.markDirty).toHaveBeenCalledTimes(1);
    expect(callbacks.render).toHaveBeenCalledTimes(1);
  });

  it('renders an empty domain override helper when no rules exist', () => {
    const grid = renderDomainRules([], [createRow()], createDomainCallbacks());

    expect(grid.classList.contains('stitch-yaml-domain-grid')).toBe(true);
    expect(grid.querySelector('.yaml-helper')?.textContent).toBe('No domain overrides configured.');
  });

  it('edits domain rule values and calls the expected callbacks', () => {
    const rows = [
      createRow({ name: 'title', valuePath: 'title' }),
      createRow({ name: 'summary', type: 'text', valuePath: 'description' })
    ];
    const entry: YamlDomainEntry = {
      id: 'domain-article-1',
      domain: 'example.com',
      contentType: 'article',
      fields: [
        {
          id: 'domain-field-1',
          name: 'title',
          type: 'text',
          enabled: true,
          defaultValue: '',
          valuePath: 'title'
        }
      ]
    };
    const callbacks = createDomainCallbacks();

    const grid = renderDomainRules([entry], rows, callbacks);
    const card = grid.querySelector<HTMLElement>('[data-domain-rule-id="domain-article-1"]');
    const contentTypeSelect = card?.querySelector<HTMLSelectElement>('.yaml-rule-meta select');
    const domainInput = card?.querySelector<HTMLInputElement>('[data-yaml-domain="domain"]');
    const fieldSelect = card?.querySelector<HTMLSelectElement>('[data-yaml-domain-field="name"]');
    const defaultInput = card?.querySelector<HTMLInputElement>(
      '[data-yaml-domain-field="defaultValue"]'
    );
    const valuePathInput = card?.querySelector<HTMLInputElement>(
      '[data-yaml-domain-field="valuePath"]'
    );

    expect(card).toBeTruthy();
    if (!domainInput || !contentTypeSelect || !fieldSelect || !defaultInput || !valuePathInput) {
      throw new Error('Expected rendered domain rule controls');
    }
    changeInput(domainInput, 'docs.example.com');
    changeSelect(contentTypeSelect, 'clipper');
    changeSelect(fieldSelect, 'summary');
    changeInput(defaultInput, 'Draft');
    changeInput(valuePathInput, 'metadata.summary');

    expect(entry).toEqual(
      expect.objectContaining({
        domain: 'docs.example.com',
        contentType: 'clipper'
      })
    );
    expect(entry.fields[0]).toEqual(
      expect.objectContaining({
        name: 'summary',
        defaultValue: 'Draft',
        valuePath: 'metadata.summary'
      })
    );
    expect(callbacks.markDirty).toHaveBeenCalledTimes(5);
    expect(callbacks.render).toHaveBeenCalledTimes(1);
  });
});
