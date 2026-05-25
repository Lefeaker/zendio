/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  buildTable,
  renderDomainOverrides
} from '../../../src/ui/domains/yaml-config/yamlConfigTableDom';
import {
  collectYamlDomainLabels,
  collectYamlTableLabels
} from '../../../src/ui/domains/yaml-config/yamlConfigTableLabels';
import { createToggleMap } from '../../../src/ui/domains/yaml-config/yamlConfigTableModel';
import type { DomainActions } from '../../../src/ui/domains/yaml-config/yamlConfigTableDomainRenderers';
import type {
  FieldRow,
  RowActions
} from '../../../src/ui/domains/yaml-config/yamlConfigTableTypes';

function makeRow(overrides: Partial<FieldRow> = {}): FieldRow {
  const builtIn = overrides.builtIn ?? false;
  return {
    id: overrides.id ?? 'row-custom',
    name: overrides.name ?? 'custom_meta',
    type: overrides.type ?? 'text',
    defaultValue: overrides.defaultValue ?? '',
    enabled: overrides.enabled ?? createToggleMap(true),
    supported: overrides.supported ?? createToggleMap(true),
    builtIn,
    isCustom: overrides.isCustom ?? !builtIn,
    required: overrides.required ?? false,
    valuePath: overrides.valuePath,
    originTypes: overrides.originTypes ?? new Set()
  };
}

function createRowActions(): RowActions {
  return {
    onNameInput: vi.fn(),
    onNameBlur: vi.fn(),
    onTypeChange: vi.fn(),
    onToggleContentType: vi.fn(),
    onAdvancedToggle: vi.fn(),
    onMoveRow: vi.fn(),
    onDeleteRow: vi.fn(),
    onDefaultValueInput: vi.fn(),
    onDefaultValueBlur: vi.fn(),
    onAdvancedValuePathInput: vi.fn(),
    onAdvancedValuePathBlur: vi.fn()
  };
}

describe('yamlConfigTable renderer characterization', () => {
  it('renders the table header and row groups with stable row counts', () => {
    const labels = collectYamlTableLabels(null);
    const rows = [
      makeRow({ id: 'row-type', name: 'type', builtIn: true, isCustom: false }),
      makeRow({ id: 'row-custom', name: 'custom_meta' })
    ];

    const table = buildTable({
      labels,
      rows,
      currentFilterMode: null,
      currentSortMode: null,
      defaultGroupExpanded: true,
      advancedOpenRows: new Set(),
      rowErrors: new Map(),
      getMoveAvailability: () => ({ canMoveUp: false, canMoveDown: true }),
      onDefaultGroupToggle: vi.fn(),
      onToggleFilter: vi.fn(),
      onToggleSort: vi.fn(),
      rowActions: createRowActions()
    });

    expect(table.querySelectorAll('.aobx-table__row')).toHaveLength(2);
    expect(table.textContent).toContain(labels.field);
    expect(table.textContent).toContain(`${labels.defaultGroup} (1/1)`);
    expect(table.textContent).toContain(`${labels.customGroup} (1/1)`);
  });

  it('renders stable row action labels and content-type aria labels', () => {
    const labels = collectYamlTableLabels(null);
    const row = makeRow({ id: 'row-action', name: 'action_field' });

    const table = buildTable({
      labels,
      rows: [row],
      currentFilterMode: null,
      currentSortMode: null,
      defaultGroupExpanded: true,
      advancedOpenRows: new Set(),
      rowErrors: new Map(),
      getMoveAvailability: () => ({ canMoveUp: true, canMoveDown: true }),
      onDefaultGroupToggle: vi.fn(),
      onToggleFilter: vi.fn(),
      onToggleSort: vi.fn(),
      rowActions: createRowActions()
    });

    const actionButtons = Array.from(table.querySelectorAll<HTMLButtonElement>('button')).map(
      (button) => button.textContent?.trim() ?? ''
    );
    expect(actionButtons).toEqual(expect.arrayContaining([labels.advancedShow, '↑', '↓', '×']));
    expect(table.querySelector('[aria-label="文章"]')).toBeTruthy();
    expect(table.querySelector('button[title="删除"]')).toBeTruthy();
  });

  it('renders domain field editors according to field type', () => {
    const host = document.createElement('div');
    const tableLabels = collectYamlTableLabels(null);
    const domainLabels = collectYamlDomainLabels(null);
    const actions: DomainActions = {
      onAddDomainEntry: vi.fn(),
      onRemoveDomainEntry: vi.fn(),
      onDomainInput: vi.fn(),
      onDomainBlur: vi.fn(),
      onContentTypeChange: vi.fn(),
      onAddDomainField: vi.fn(),
      onRemoveDomainField: vi.fn(),
      onDomainFieldNameChange: vi.fn(),
      onDomainFieldEnabledChange: vi.fn(),
      onDomainFieldDefaultInput: vi.fn(),
      onDomainFieldDefaultBlur: vi.fn(),
      onDomainFieldValuePathInput: vi.fn(),
      onDomainFieldValuePathBlur: vi.fn()
    };

    renderDomainOverrides({
      host,
      entries: [
        {
          id: 'entry-1',
          domain: 'docs.example.com',
          contentType: 'article',
          fields: [
            {
              id: 'field-tags',
              name: 'tags',
              type: 'array',
              enabled: true,
              defaultValue: 'one; two',
              valuePath: 'metadata.tags'
            }
          ]
        }
      ],
      labels: domainLabels,
      tableLabels,
      domainErrors: new Map(),
      getFieldOptionsForEntry: () => [
        makeRow({ id: 'row-tags', name: 'tags', type: 'array', builtIn: true, isCustom: false })
      ],
      actions
    });

    expect(host.querySelector('.aobx-domain__field-select')).toBeInstanceOf(HTMLSelectElement);
    expect(host.querySelector('.aobx-domain__field-enabled input[type="checkbox"]')).toBeTruthy();
    expect(host.querySelector('.aobx-table__array-input')).toBeInstanceOf(HTMLInputElement);
    expect(host.querySelector<HTMLInputElement>('.aobx-domain__value-path-input')?.value).toBe(
      'metadata.tags'
    );
  });

  it('dispatches renderer events to controller callbacks exactly once', () => {
    const labels = collectYamlTableLabels(null);
    const row = makeRow({ id: 'row-event', name: 'event_field' });
    const rowActions = createRowActions();
    const onToggleFilter = vi.fn();
    const onToggleSort = vi.fn();

    const table = buildTable({
      labels,
      rows: [row],
      currentFilterMode: null,
      currentSortMode: null,
      defaultGroupExpanded: true,
      advancedOpenRows: new Set(),
      rowErrors: new Map(),
      getMoveAvailability: () => ({ canMoveUp: false, canMoveDown: false }),
      onDefaultGroupToggle: vi.fn(),
      onToggleFilter,
      onToggleSort,
      rowActions
    });

    const articleButtons = Array.from(table.querySelectorAll<HTMLButtonElement>('button')).filter(
      (button) => button.textContent?.trim() === labels.article
    );
    articleButtons[0]?.click();
    articleButtons[1]?.click();
    Array.from(table.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === labels.advancedShow)
      ?.click();

    expect(onToggleFilter).toHaveBeenCalledTimes(1);
    expect(onToggleFilter).toHaveBeenCalledWith('article');
    expect(onToggleSort).toHaveBeenCalledTimes(1);
    expect(onToggleSort).toHaveBeenCalledWith('article');
    expect(rowActions.onAdvancedToggle).toHaveBeenCalledTimes(1);
    expect(rowActions.onAdvancedToggle).toHaveBeenCalledWith(row);
  });
});
