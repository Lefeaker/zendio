/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createYamlConfigController,
  type YamlConfigController
} from '../../../src/ui/domains/yaml-config/yamlConfigTable';
import {
  createToggleMap,
  parseDefaultValueWithValidation
} from '../../../src/ui/domains/yaml-config/yamlConfigTableModel';
import { validateYamlConfig } from '../../../src/ui/domains/yaml-config/yamlConfigTableValidation';
import type {
  DomainOverrideEntry,
  FieldRow
} from '../../../src/ui/domains/yaml-config/yamlConfigTableTypes';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';

const HOST_TEMPLATE = `
  <div
    id="yamlConfigTable"
    data-label-field="Field"
    data-label-type="Type"
    data-label-article="Article"
    data-label-clipper="Clipper"
    data-label-video="Video"
    data-label-ai="AI"
    data-label-default="Value"
    data-label-actions="Actions"
    data-label-delete="Delete"
    data-label-default-group="Default fields"
    data-label-filter-all="All"
    data-label-custom-group="Custom fields"
    data-error-name-required="Field name is required"
    data-error-name-pattern="Only letters, numbers, underscores, or dashes are allowed, and it cannot start with a number."
    data-error-name-duplicate="Duplicate field name, please pick another."
    data-error-mode-required="Enable at least one content type."
    data-error-type-required="Select a field type."
    data-error-value-invalid="Default value does not match the field type."
    data-warning-unresolved="Fix the highlighted errors before saving.">
  </div>
  <div id="yamlDomainOverrides"></div>
  <button id="yamlAddFieldBtn" type="button"></button>
`;

function mountController(): YamlConfigController {
  document.body.innerHTML = HOST_TEMPLATE;
  const tableHost = document.getElementById('yamlConfigTable');
  const domainHost = document.getElementById('yamlDomainOverrides');
  const addButton = document.getElementById('yamlAddFieldBtn');
  if (!tableHost || !domainHost || !addButton || !(addButton instanceof HTMLButtonElement)) {
    throw new Error('Missing YAML editor hosts');
  }
  const controller = createYamlConfigController({
    tableHost,
    domainHost,
    addFieldButton: addButton,
    onDirty: vi.fn()
  });
  controller.render(null);
  return controller;
}

function requireRowId(row: HTMLElement, errorMessage: string): string {
  const { rowId } = row.dataset;
  if (!rowId) {
    throw new Error(errorMessage);
  }
  return rowId;
}

function createCustomField(name: string): HTMLElement {
  const addButton = document.getElementById('yamlAddFieldBtn');
  if (!(addButton instanceof HTMLButtonElement)) {
    throw new Error('Expected add button element');
  }

  const before = new Set(
    Array.from(document.querySelectorAll<HTMLElement>('div[data-row-id]')).map((row) =>
      requireRowId(row, 'Expected row id before creating custom field')
    )
  );

  addButton.dispatchEvent(new Event('click', { bubbles: true }));
  const row = Array.from(document.querySelectorAll<HTMLElement>('div[data-row-id]')).find(
    (candidate) => !before.has(requireRowId(candidate, 'Row missing identifier while diffing'))
  );

  if (!row) {
    throw new Error('Expected custom row');
  }

  const input = row.querySelector<HTMLInputElement>('input[type="text"]:not([disabled])');
  const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!input || !checkbox) {
    throw new Error('Missing custom row controls');
  }

  input.value = name;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));

  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  return row;
}

describe('yamlConfigTable validation', () => {
  let controller: YamlConfigController | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    controller = mountController();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    controller?.dispose();
    controller = null;
    document.body.innerHTML = '';
  });

  it('blocks collection when custom field is incomplete', () => {
    document
      .getElementById('yamlAddFieldBtn')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(() => controller?.collect()).toThrowError();
  });

  it('collects overrides when custom field passes validation', () => {
    const row = createCustomField('custom_meta');
    const rowId = requireRowId(row, 'Expected to find newly added row id');

    vi.runAllTimers();
    const refreshedRow = document.querySelector(`div[data-row-id="${rowId}"]`);
    expect(refreshedRow).toBeTruthy();

    if (!controller) {
      throw new Error('Controller missing');
    }

    let overrides: ReturnType<YamlConfigController['collect']> | null = null;
    let caught: unknown;
    try {
      overrides = controller.collect();
    } catch (error) {
      caught = error;
    }
    if (caught) {
      const messages = Array.from(document.querySelectorAll('.yaml-row-errors li')).map(
        (node) => node.textContent ?? ''
      );
      throw new Error(messages.join(' | ') || String(caught));
    }
    expect(overrides).not.toBeNull();
    const articleCustom = overrides?.contentTypes?.article?.customFields ?? [];
    expect(articleCustom.some((field) => field.name === 'custom_meta')).toBe(true);
  });

  it('collects domain overrides after adding a domain rule and field', () => {
    const addDomainRuleButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('添加域名规则'));
    expect(addDomainRuleButton).toBeTruthy();
    addDomainRuleButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const domainInput = document.querySelector<HTMLInputElement>('.aobx-domain__domain-input');
    expect(domainInput).toBeTruthy();
    if (!domainInput) {
      throw new Error('Expected domain input');
    }
    domainInput.value = 'docs.example.com';
    domainInput.dispatchEvent(new Event('input', { bubbles: true }));
    domainInput.dispatchEvent(new Event('blur', { bubbles: true }));

    const addFieldButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('添加字段')
    );
    expect(addFieldButton).toBeTruthy();
    addFieldButton?.dispatchEvent(new Event('click', { bubbles: true }));

    if (!controller) {
      throw new Error('Controller missing');
    }

    const overrides = controller.collect();
    const overrideKeys = Object.keys(overrides?.contentTypes?.article?.domainOverrides ?? {});
    expect(overrideKeys).toHaveLength(1);
    expect(overrides?.contentTypes?.article?.domainOverrides?.['docs.example.com']?.length).toBe(1);
  });

  it('preserves custom order when collecting regardless of sort toggles', () => {
    const firstId = requireRowId(createCustomField('custom_alpha'), 'Missing first row id');
    const secondId = requireRowId(createCustomField('custom_beta'), 'Missing second row id');

    const secondRow = document.querySelector<HTMLElement>(`div[data-row-id="${secondId}"]`);
    expect(secondRow).toBeTruthy();
    const moveUpButton = Array.from(secondRow?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === '↑'
    );
    expect(moveUpButton).toBeTruthy();
    moveUpButton?.dispatchEvent(new Event('click', { bubbles: true }));

    vi.runAllTimers();

    const sortButton = Array.from(document.querySelectorAll('#yamlConfigTable button')).find(
      (button) => button.textContent?.trim() === 'Article'
    );
    expect(sortButton).toBeTruthy();
    sortButton?.dispatchEvent(new Event('click', { bubbles: true }));

    if (!controller) {
      throw new Error('Controller missing');
    }

    const overrides = controller.collect();
    const articleCustom = overrides?.contentTypes?.article?.customFields ?? [];
    expect(articleCustom.map((field) => field.name)).toEqual([
      'status',
      'custom_beta',
      'custom_alpha'
    ]);
    expect(firstId).not.toEqual(secondId);
  });

  it('surfaces duplicate custom field errors and renders warning banner', () => {
    createCustomField('duplicate_name');
    createCustomField('duplicate_name');

    vi.runAllTimers();
    expect(() => controller?.collect()).toThrowError();
  });

  it('validates domain override value paths and allows removing invalid domain rules', () => {
    const addDomainRuleButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('添加域名规则'));
    expect(addDomainRuleButton).toBeTruthy();
    addDomainRuleButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const domainInput = document.querySelector<HTMLInputElement>('.aobx-domain__domain-input');
    expect(domainInput).toBeTruthy();
    if (!domainInput) {
      throw new Error('Expected domain input');
    }
    domainInput.value = 'docs.example.com';
    domainInput.dispatchEvent(new Event('input', { bubbles: true }));
    domainInput.dispatchEvent(new Event('blur', { bubbles: true }));

    const addFieldButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('添加字段')
    );
    expect(addFieldButton).toBeTruthy();
    addFieldButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const valuePathInput = document.querySelector<HTMLInputElement>(
      '.aobx-domain__value-path-input'
    );
    expect(valuePathInput).toBeTruthy();
    if (!valuePathInput) {
      throw new Error('Expected domain value path input');
    }
    valuePathInput.value = 'invalid path';
    valuePathInput.dispatchEvent(new Event('input', { bubbles: true }));
    valuePathInput.dispatchEvent(new Event('blur', { bubbles: true }));

    vi.runAllTimers();
    expect(() => controller?.collect()).toThrowError();

    const removeRuleButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('删除规则'));
    expect(removeRuleButton).toBeTruthy();
    removeRuleButton?.dispatchEvent(new Event('click', { bubbles: true }));

    if (!controller) {
      throw new Error('Controller missing');
    }
    const overrides = controller.collect();
    expect(overrides?.contentTypes?.article?.domainOverrides).toBeUndefined();
  });

  it('filters, sorts, and deletes custom fields without leaking removed rows into collect', () => {
    const alphaRowId = requireRowId(
      createCustomField('custom_alpha_delete'),
      'Missing alpha row id'
    );
    createCustomField('custom_beta_keep');

    const filterButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('#yamlConfigTable button')
    ).find((button) => button.textContent?.trim() === 'Article');
    expect(filterButton).toBeTruthy();
    filterButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const alphaRow = document.querySelector<HTMLElement>(`div[data-row-id="${alphaRowId}"]`);
    expect(alphaRow).toBeTruthy();
    const deleteButton = Array.from(
      alphaRow?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).find((button) => button.title === 'Delete');
    expect(deleteButton).toBeTruthy();
    deleteButton?.dispatchEvent(new Event('click', { bubbles: true }));

    if (!controller) {
      throw new Error('Controller missing');
    }
    const overrides = controller.collect();
    const articleCustom = overrides?.contentTypes?.article?.customFields ?? [];
    expect(articleCustom.map((field) => field.name)).toContain('custom_beta_keep');
    expect(articleCustom.map((field) => field.name)).not.toContain('custom_alpha_delete');
  });

  it('normalizes array default values into trimmed item lists', () => {
    const row = createCustomField('custom_array_values');
    const rowId = requireRowId(row, 'Missing array row id');
    const selects = row.querySelectorAll<HTMLSelectElement>('select');
    const typeSelect = Array.from(selects).find((select) =>
      Array.from(select.options).some((option) => option.value === 'array')
    );
    expect(typeSelect).toBeTruthy();
    if (!typeSelect) {
      throw new Error('Expected type select');
    }
    typeSelect.value = 'array';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const refreshedRow = document.querySelector<HTMLElement>(`div[data-row-id="${rowId}"]`);
    const arrayInput =
      refreshedRow?.querySelector<HTMLInputElement>('.aobx-table__array-input') ?? null;
    expect(arrayInput).toBeTruthy();
    if (!arrayInput) {
      throw new Error('Expected array input');
    }
    arrayInput.value = ' alpha ; beta, gamma, delta ';
    arrayInput.dispatchEvent(new Event('input', { bubbles: true }));
    arrayInput.dispatchEvent(new Event('blur', { bubbles: true }));

    if (!controller) {
      throw new Error('Controller missing');
    }
    const overrides = controller.collect();
    const articleCustom = overrides?.contentTypes?.article?.customFields ?? [];
    const field = articleCustom.find((item) => item.name === 'custom_array_values');
    expect(field?.defaultValue).toEqual(['alpha', 'beta', 'gamma', 'delta']);
    expect(arrayInput.value).toBe('alpha; beta; gamma; delta');
  });

  it('requires at least one enabled content type for custom fields', () => {
    const row = createCustomField('custom_without_mode');
    const rowId = requireRowId(row, 'Missing mode row id');
    const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    if (!checkbox) {
      throw new Error('Expected article checkbox');
    }
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    vi.runAllTimers();
    expect(() => controller?.collect()).toThrowError();
    const refreshedRow = document.querySelector<HTMLElement>(`div[data-row-id="${rowId}"]`);
    const errors = Array.from(refreshedRow?.querySelectorAll('.yaml-row-errors li') ?? []).map(
      (node) => node.textContent ?? ''
    );
    const globalWarning = document.querySelector('.aobx-table__global-errors')?.textContent ?? '';
    expect(
      errors.some((message) => message.includes('Enable at least one content type')) ||
        globalWarning.length > 0
    ).toBe(true);
  });

  it('rejects duplicate custom field names and surfaces row errors', () => {
    createCustomField('custom_duplicate_name');
    createCustomField('custom_duplicate_name');

    vi.runAllTimers();
    expect(() => controller?.collect()).toThrowError();

    const rowErrors = Array.from(document.querySelectorAll('.yaml-row-errors li')).map(
      (node) => node.textContent ?? ''
    );
    const globalWarning = document.querySelector('.aobx-table__global-errors')?.textContent ?? '';
    expect(
      rowErrors.some((message) => message.includes('Duplicate field name')) ||
        globalWarning.length > 0
    ).toBe(true);
  });

  it('validates custom field default values and advanced value paths', () => {
    const row = createCustomField('custom_number_field');
    const rowId = requireRowId(row, 'Missing number field row id');
    const selects = row.querySelectorAll<HTMLSelectElement>('select');
    const typeSelect = Array.from(selects).find((select) =>
      Array.from(select.options).some((option) => option.value === 'number')
    );
    expect(typeSelect).toBeTruthy();
    if (!typeSelect) {
      throw new Error('Expected number type select');
    }
    typeSelect.value = 'number';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const refreshedRow = document.querySelector<HTMLElement>(`div[data-row-id="${rowId}"]`);
    const defaultInput =
      Array.from(
        refreshedRow?.querySelectorAll<HTMLInputElement>(
          'input[type="text"]:not(.aobx-table__advanced-input)'
        ) ?? []
      ).find((input) => input.value !== 'custom_number_field') ?? null;
    expect(defaultInput).toBeTruthy();
    if (!defaultInput) {
      throw new Error('Expected default value input');
    }
    defaultInput.value = 'not-a-number';
    defaultInput.dispatchEvent(new Event('input', { bubbles: true }));
    defaultInput.dispatchEvent(new Event('blur', { bubbles: true }));

    const advancedButton = refreshedRow?.querySelector<HTMLButtonElement>('button');
    expect(advancedButton).toBeTruthy();
    advancedButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const advancedInput = document.querySelector<HTMLInputElement>(`#yaml-advanced-${rowId}`);
    expect(advancedInput).toBeTruthy();
    if (!advancedInput) {
      throw new Error('Expected advanced value path input');
    }
    advancedInput.value = 'meta author';
    advancedInput.dispatchEvent(new Event('input', { bubbles: true }));
    advancedInput.dispatchEvent(new Event('blur', { bubbles: true }));

    vi.runAllTimers();
    expect(() => controller?.collect()).toThrowError();
    const errors = Array.from(document.querySelectorAll('.yaml-row-errors li')).map(
      (node) => node.textContent ?? ''
    );
    const globalWarning = document.querySelector('.aobx-table__global-errors')?.textContent ?? '';
    expect(
      errors.some((message) => message.includes('Default value does not match')) ||
        errors.some((message) => message.includes('cannot contain spaces')) ||
        globalWarning.length > 0
    ).toBe(true);
  });

  it('reorders custom fields through move buttons and preserves collected order', () => {
    createCustomField('custom_first');
    const secondRowId = requireRowId(createCustomField('custom_second'), 'Missing second row id');

    const secondRow = document.querySelector<HTMLElement>(`div[data-row-id="${secondRowId}"]`);
    const moveUpButton = Array.from(
      secondRow?.querySelectorAll<HTMLButtonElement>('button') ?? []
    )[1];
    expect(moveUpButton).toBeTruthy();
    moveUpButton?.dispatchEvent(new Event('click', { bubbles: true }));

    if (!controller) {
      throw new Error('Controller missing');
    }
    const overrides = controller.collect();
    const articleCustom = (overrides?.contentTypes?.article?.customFields ?? [])
      .map((field) => field.name)
      .filter((name) => name.startsWith('custom_'));
    expect(articleCustom).toEqual(['custom_second', 'custom_first']);
  });

  it('removes deleted custom rows from collected overrides', () => {
    createCustomField('custom_keep');
    createCustomField('custom_delete');

    const rowToDelete = Array.from(document.querySelectorAll<HTMLElement>('div[data-row-id]')).find(
      (row) => {
        const input = row.querySelector<HTMLInputElement>('input[type="text"]:not([disabled])');
        return input?.value === 'custom_delete';
      }
    );
    const deleteButton = Array.from(
      rowToDelete?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).at(-1);
    expect(deleteButton).toBeTruthy();
    deleteButton?.dispatchEvent(new Event('click', { bubbles: true }));

    if (!controller) {
      throw new Error('Controller missing');
    }
    const overrides = controller.collect();
    const customNames = (overrides.contentTypes?.article?.customFields ?? []).map(
      (field) => field.name
    );
    expect(customNames).toContain('custom_keep');
    expect(customNames).not.toContain('custom_delete');
  });

  it('allows collection after removing an invalid domain override card', () => {
    const addDomainRuleButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('添加域名规则'));
    expect(addDomainRuleButton).toBeTruthy();
    addDomainRuleButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const domainInput = document.querySelector<HTMLInputElement>('.aobx-domain__domain-input');
    expect(domainInput).toBeTruthy();
    if (!domainInput) {
      throw new Error('Expected domain input');
    }
    domainInput.value = 'docs.example.com';
    domainInput.dispatchEvent(new Event('input', { bubbles: true }));
    domainInput.dispatchEvent(new Event('blur', { bubbles: true }));

    const addFieldButton = document.querySelector<HTMLButtonElement>('.aobx-domain__add-field-btn');
    expect(addFieldButton).toBeTruthy();
    addFieldButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const valuePathInput = document.querySelector<HTMLInputElement>(
      '.aobx-domain__value-path-input'
    );
    expect(valuePathInput).toBeTruthy();
    if (!valuePathInput) {
      throw new Error('Expected domain value path input');
    }
    valuePathInput.value = 'meta author';
    valuePathInput.dispatchEvent(new Event('input', { bubbles: true }));
    valuePathInput.dispatchEvent(new Event('blur', { bubbles: true }));

    vi.runAllTimers();
    expect(() => controller?.collect()).toThrowError();

    const removeDomainButton = document.querySelector<HTMLButtonElement>(
      '.aobx-domain__remove-btn'
    );
    expect(removeDomainButton).toBeTruthy();
    removeDomainButton?.dispatchEvent(new Event('click', { bubbles: true }));

    if (!controller) {
      throw new Error('Controller missing');
    }
    const overrides = controller.collect();
    expect(overrides.contentTypes?.article?.domainOverrides).toBeUndefined();
    expect(document.querySelector('.aobx-domain__card')).toBeNull();
    expect(document.querySelector('.aobx-table__global-errors')).toBeNull();
  });

  it('drops unsupported domain fields after switching domain override content type', () => {
    const addDomainRuleButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('添加域名规则'));
    expect(addDomainRuleButton).toBeTruthy();
    addDomainRuleButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const domainInput = document.querySelector<HTMLInputElement>('.aobx-domain__domain-input');
    expect(domainInput).toBeTruthy();
    if (!domainInput) {
      throw new Error('Expected domain input');
    }
    domainInput.value = 'docs.example.com';
    domainInput.dispatchEvent(new Event('input', { bubbles: true }));
    domainInput.dispatchEvent(new Event('blur', { bubbles: true }));

    const addFieldButton = document.querySelector<HTMLButtonElement>('.aobx-domain__add-field-btn');
    expect(addFieldButton).toBeTruthy();
    addFieldButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const fieldSelect = document.querySelector<HTMLSelectElement>('.aobx-domain__field-select');
    expect(fieldSelect).toBeTruthy();
    if (!fieldSelect) {
      throw new Error('Expected domain field select');
    }
    fieldSelect.value = 'author';
    fieldSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const typeSelect = document.querySelector<HTMLSelectElement>('.aobx-domain__type-select');
    expect(typeSelect).toBeTruthy();
    if (!typeSelect) {
      throw new Error('Expected domain content type select');
    }
    typeSelect.value = 'video';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector('.aobx-domain__field-empty')).toBeTruthy();

    const replacementAddButton = document.querySelector<HTMLButtonElement>(
      '.aobx-domain__add-field-btn'
    );
    expect(replacementAddButton).toBeTruthy();
    replacementAddButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const replacementSelect = document.querySelector<HTMLSelectElement>(
      '.aobx-domain__field-select'
    );
    expect(replacementSelect).toBeTruthy();
    expect(replacementSelect?.value).not.toBe('author');

    if (!controller) {
      throw new Error('Controller missing');
    }
    const overrides = controller.collect();
    const videoOverride =
      overrides.contentTypes?.video?.domainOverrides?.['docs.example.com'] ?? [];
    expect(videoOverride).toHaveLength(1);
    expect(videoOverride[0]?.name).not.toBe('author');
    expect(overrides.contentTypes?.article?.domainOverrides).toBeUndefined();
  });

  it('removes individual domain fields and surfaces the empty-field validation state', () => {
    const addDomainRuleButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('添加域名规则'));
    expect(addDomainRuleButton).toBeTruthy();
    addDomainRuleButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const domainInput = document.querySelector<HTMLInputElement>('.aobx-domain__domain-input');
    expect(domainInput).toBeTruthy();
    if (!domainInput) {
      throw new Error('Expected domain input');
    }
    domainInput.value = 'docs.example.com';
    domainInput.dispatchEvent(new Event('input', { bubbles: true }));
    domainInput.dispatchEvent(new Event('blur', { bubbles: true }));

    const addFieldButton = document.querySelector<HTMLButtonElement>('.aobx-domain__add-field-btn');
    expect(addFieldButton).toBeTruthy();
    addFieldButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const removeFieldButton = document.querySelector<HTMLButtonElement>(
      '.aobx-domain__field-remove'
    );
    expect(removeFieldButton).toBeTruthy();
    removeFieldButton?.dispatchEvent(new Event('click', { bubbles: true }));

    expect(document.querySelector('.aobx-domain__field-empty')).toBeTruthy();

    vi.runAllTimers();
    expect(() => controller?.collect()).toThrowError();
    const cardErrors = Array.from(document.querySelectorAll('.aobx-domain__errors li')).map(
      (node) => node.textContent ?? ''
    );
    const globalWarning = document.querySelector('.aobx-table__global-errors')?.textContent ?? '';
    expect(document.querySelector('.aobx-domain__field-empty')).toBeTruthy();
    expect(cardErrors.length > 0 || globalWarning.length > 0).toBe(true);
  });

  it('switches domain fields to array editors and normalizes collected defaults', () => {
    const addDomainRuleButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('添加域名规则'));
    expect(addDomainRuleButton).toBeTruthy();
    addDomainRuleButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const domainInput = document.querySelector<HTMLInputElement>('.aobx-domain__domain-input');
    expect(domainInput).toBeTruthy();
    if (!domainInput) {
      throw new Error('Expected domain input');
    }
    domainInput.value = 'video.example.com';
    domainInput.dispatchEvent(new Event('input', { bubbles: true }));
    domainInput.dispatchEvent(new Event('blur', { bubbles: true }));

    const addFieldButton = document.querySelector<HTMLButtonElement>('.aobx-domain__add-field-btn');
    expect(addFieldButton).toBeTruthy();
    addFieldButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const fieldSelect = document.querySelector<HTMLSelectElement>('.aobx-domain__field-select');
    expect(fieldSelect).toBeTruthy();
    if (!fieldSelect) {
      throw new Error('Expected field selector');
    }
    fieldSelect.value = 'tags';
    fieldSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const arrayInput = document.querySelector<HTMLInputElement>(
      '.aobx-domain__field-body .aobx-table__array-input'
    );
    expect(arrayInput).toBeTruthy();
    if (!arrayInput) {
      throw new Error('Expected array input');
    }
    arrayInput.value = 'alpha ; beta;; gamma';
    arrayInput.dispatchEvent(new Event('input', { bubbles: true }));
    arrayInput.dispatchEvent(new Event('blur', { bubbles: true }));

    if (!controller) {
      throw new Error('Controller missing');
    }
    const overrides = controller.collect();
    expect(overrides.contentTypes?.article?.domainOverrides?.['video.example.com']).toEqual([
      expect.objectContaining({ name: 'tags', defaultValue: ['alpha', 'beta', 'gamma'] })
    ]);
  });

  it('disables custom row move buttons while filter or sort modes are active', () => {
    createCustomField('move_alpha');
    createCustomField('move_beta');

    const customRows = Array.from(
      document.querySelectorAll<HTMLElement>('div[data-row-id]')
    ).filter((row) => {
      const input = row.querySelector<HTMLInputElement>('input[type="text"]:not([disabled])');
      return input?.value === 'move_alpha' || input?.value === 'move_beta';
    });
    expect(customRows).toHaveLength(2);

    const firstRowButtons = Array.from(
      customRows[0]?.querySelectorAll<HTMLButtonElement>('button') ?? []
    );
    const moveDown = firstRowButtons.find((button) => button.textContent === '↓');
    expect(moveDown?.disabled).toBe(false);

    const articleFilter = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Article'
    );
    expect(articleFilter).toBeTruthy();
    articleFilter?.dispatchEvent(new Event('click', { bubbles: true }));

    const filteredRow = Array.from(document.querySelectorAll<HTMLElement>('div[data-row-id]')).find(
      (row) => {
        const input = row.querySelector<HTMLInputElement>('input[type="text"]:not([disabled])');
        return input?.value === 'move_alpha';
      }
    );
    const filteredMoveDown = Array.from(
      filteredRow?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).find((button) => button.textContent === '↓');
    expect(filteredMoveDown?.disabled).toBe(true);

    articleFilter?.dispatchEvent(new Event('click', { bubbles: true }));
    const sortArticle = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Article' && button.closest('.grid')
    );
    expect(sortArticle).toBeTruthy();
    sortArticle?.dispatchEvent(new Event('click', { bubbles: true }));

    const sortedRow = Array.from(document.querySelectorAll<HTMLElement>('div[data-row-id]')).find(
      (row) => {
        const input = row.querySelector<HTMLInputElement>('input[type="text"]:not([disabled])');
        return input?.value === 'move_alpha';
      }
    );
    const sortedMoveDown = Array.from(
      sortedRow?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).find((button) => button.textContent === '↓');
    expect(sortedMoveDown?.disabled).toBe(true);
  });

  it('pre-opens advanced panels for rows with valuePath and toggles them closed and open again', () => {
    const initial: YamlConfigOverrides = {
      globalFields: [
        {
          name: 'source_meta',
          type: 'text',
          enabled: true,
          valuePath: 'meta.author'
        }
      ]
    };

    controller?.render(initial);

    const customRow = Array.from(document.querySelectorAll<HTMLElement>('div[data-row-id]')).find(
      (row) => {
        const input = row.querySelector<HTMLInputElement>('input[type="text"]:not([disabled])');
        return input?.value === 'source_meta';
      }
    );
    expect(customRow).toBeTruthy();
    expect(customRow?.querySelector('.aobx-table__advanced-input')).toBeTruthy();

    const advancedButton = Array.from(
      customRow?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).find((button) => button.textContent?.includes('Hide source'));
    expect(advancedButton?.className).toContain('text-accent');
    advancedButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const closedRow = Array.from(document.querySelectorAll<HTMLElement>('div[data-row-id]')).find(
      (row) => {
        const input = row.querySelector<HTMLInputElement>('input[type="text"]:not([disabled])');
        return input?.value === 'source_meta';
      }
    );
    expect(closedRow?.querySelector('.aobx-table__advanced-input')).toBeNull();

    const reopenButton = Array.from(
      closedRow?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).find((button) => button.textContent?.includes('Show source'));
    reopenButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const reopenedRow = Array.from(document.querySelectorAll<HTMLElement>('div[data-row-id]')).find(
      (row) => {
        const input = row.querySelector<HTMLInputElement>('input[type="text"]:not([disabled])');
        return input?.value === 'source_meta';
      }
    );
    expect(reopenedRow?.querySelector('.aobx-table__advanced-input')).toBeTruthy();
    expect(reopenedRow?.querySelector('.aobx-table__advanced-examples')).toBeTruthy();
  });

  it('validates empty and case-insensitive duplicate domain rules', () => {
    const addDomainRuleButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('添加域名规则'));
    expect(addDomainRuleButton).toBeTruthy();
    addDomainRuleButton?.dispatchEvent(new Event('click', { bubbles: true }));
    addDomainRuleButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const domainInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('.aobx-domain__domain-input')
    );
    expect(domainInputs).toHaveLength(2);
    domainInputs[0].value = 'Docs.Example.com';
    domainInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    domainInputs[0].dispatchEvent(new Event('blur', { bubbles: true }));
    domainInputs[1].value = 'docs.example.com';
    domainInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    domainInputs[1].dispatchEvent(new Event('blur', { bubbles: true }));

    const addFieldButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.aobx-domain__add-field-btn')
    );
    addFieldButtons.forEach((button) =>
      button.dispatchEvent(new Event('click', { bubbles: true }))
    );

    const refreshedDomainInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('.aobx-domain__domain-input')
    );
    refreshedDomainInputs[0].value = '   ';
    refreshedDomainInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    refreshedDomainInputs[0].dispatchEvent(new Event('blur', { bubbles: true }));

    vi.runAllTimers();
    expect(() => controller?.collect()).toThrowError();
    expect(document.querySelector('.aobx-table__global-errors')).toBeTruthy();

    const duplicateDomainInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('.aobx-domain__domain-input')
    );
    duplicateDomainInputs[0].value = 'Docs.Example.com';
    duplicateDomainInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    duplicateDomainInputs[0].dispatchEvent(new Event('blur', { bubbles: true }));

    vi.runAllTimers();
    expect(() => controller?.collect()).toThrowError();
    expect(document.querySelector('.aobx-table__global-errors')).toBeTruthy();
  });
  it('rejects duplicate domain rules for the same content type', () => {
    const addDomainRule = () => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (candidate) => candidate.textContent?.includes('添加域名规则')
      );
      expect(button).toBeTruthy();
      button?.dispatchEvent(new Event('click', { bubbles: true }));
    };

    addDomainRule();
    addDomainRule();

    const domainInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('.aobx-domain__domain-input')
    );
    expect(domainInputs).toHaveLength(2);
    domainInputs.forEach((input) => {
      input.value = 'docs.example.com';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    });

    vi.runAllTimers();
    expect(() => controller?.collect()).toThrowError();
    const cardErrors = Array.from(document.querySelectorAll('.aobx-domain__errors li')).map(
      (node) => node.textContent ?? ''
    );
    const globalWarning = document.querySelector('.aobx-table__global-errors')?.textContent ?? '';
    expect(cardErrors.length > 0 || globalWarning.length > 0).toBe(true);
  });
  it('shows invalid-name and missing-mode errors with warning banner', () => {
    const row = createCustomField('1invalid_name');
    const rowId = requireRowId(row, 'Missing invalid row id');
    const refreshedRow = document.querySelector<HTMLElement>(`div[data-row-id="${rowId}"]`);
    const checkboxes = Array.from(
      refreshedRow?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []
    );
    const enabledCheckbox = checkboxes.find((checkbox) => checkbox.checked) ?? checkboxes[0];
    expect(enabledCheckbox).toBeTruthy();
    if (!enabledCheckbox) {
      throw new Error('Expected enabled checkbox');
    }
    enabledCheckbox.checked = false;
    enabledCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    vi.runAllTimers();
    expect(() => controller?.collect()).toThrowError();
    expect(document.querySelector('.aobx-table__global-errors')).toBeTruthy();
    expect(
      document.querySelectorAll('.aobx-table__global-errors, .yaml-row-errors li').length
    ).toBeGreaterThan(0);
  });

  it('preserves trimmed valuePath for valid domain entries', () => {
    const addDomainRuleButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('添加域名规则'));
    expect(addDomainRuleButton).toBeTruthy();
    addDomainRuleButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const domainInput = document.querySelector<HTMLInputElement>('.aobx-domain__domain-input');
    expect(domainInput).toBeTruthy();
    if (!domainInput) {
      throw new Error('Expected domain input');
    }
    domainInput.value = 'sub.example.com';
    domainInput.dispatchEvent(new Event('input', { bubbles: true }));
    domainInput.dispatchEvent(new Event('blur', { bubbles: true }));

    const addFieldButton = document.querySelector<HTMLButtonElement>('.aobx-domain__add-field-btn');
    expect(addFieldButton).toBeTruthy();
    addFieldButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const valuePathInput = document.querySelector<HTMLInputElement>(
      '.aobx-domain__value-path-input'
    );
    expect(valuePathInput).toBeTruthy();
    if (!valuePathInput) {
      throw new Error('Expected domain value path input');
    }
    valuePathInput.value = 'meta.path';
    valuePathInput.dispatchEvent(new Event('input', { bubbles: true }));
    valuePathInput.dispatchEvent(new Event('blur', { bubbles: true }));

    if (!controller) {
      throw new Error('Controller missing');
    }
    const overrides = controller.collect();
    const fields = overrides?.contentTypes?.article?.domainOverrides?.['sub.example.com'];
    expect(fields?.[0]?.valuePath).toBe('meta.path');
  });

  it('normalizes domain duplicates by case and whitespace into validation errors', () => {
    const addDomainRule = () => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (candidate) => candidate.textContent?.includes('添加域名规则')
      );
      expect(button).toBeTruthy();
      button?.dispatchEvent(new Event('click', { bubbles: true }));
    };

    addDomainRule();
    addDomainRule();

    const domainInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('.aobx-domain__domain-input')
    );
    expect(domainInputs).toHaveLength(2);
    domainInputs[0].value = ' DOCS.EXAMPLE.COM ';
    domainInputs[1].value = 'docs.example.com';
    domainInputs.forEach((input) => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    });

    vi.runAllTimers();
    expect(() => controller?.collect()).toThrowError();
    const errors = Array.from(
      document.querySelectorAll('.aobx-domain__errors li, .aobx-table__global-errors')
    ).map((node) => node.textContent ?? '');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('clears validation errors after deleting an invalid custom row', () => {
    createCustomField('custom_keep_after_delete');
    const invalidRow = createCustomField('1bad_name');

    vi.runAllTimers();
    expect(() => controller?.collect()).toThrowError();
    expect(document.querySelector('.aobx-table__global-errors')).toBeTruthy();

    const deleteButton = Array.from(invalidRow.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.title === 'Delete'
    );
    expect(deleteButton).toBeTruthy();
    deleteButton?.dispatchEvent(new Event('click', { bubbles: true }));

    if (!controller) {
      throw new Error('Controller missing');
    }
    const overrides = controller.collect();
    const customNames = (overrides?.contentTypes?.article?.customFields ?? []).map(
      (field) => field.name
    );
    expect(customNames).toContain('custom_keep_after_delete');
    expect(customNames).not.toContain('1bad_name');
    expect(document.querySelector('.aobx-table__global-errors')).toBeNull();
  });

  it('keeps advanced valuePath when toggled open and accepts trimmed array defaults', () => {
    const row = createCustomField('custom_with_source_path');
    const rowId = requireRowId(row, 'Missing advanced row id');

    const advancedToggle = Array.from(row.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => /Show source|Hide source/.test(button.textContent ?? '')
    );
    expect(advancedToggle).toBeTruthy();
    advancedToggle?.dispatchEvent(new Event('click', { bubbles: true }));

    const refreshedRow = document.querySelector<HTMLElement>(`div[data-row-id="${rowId}"]`);
    const advancedInput =
      refreshedRow?.querySelector<HTMLInputElement>('.aobx-table__advanced-input') ?? null;
    expect(advancedInput).toBeTruthy();
    if (!advancedInput) {
      throw new Error('Expected advanced value path input');
    }
    advancedInput.value = 'meta.path';
    advancedInput.dispatchEvent(new Event('input', { bubbles: true }));
    advancedInput.dispatchEvent(new Event('blur', { bubbles: true }));

    const typeSelect = Array.from(
      refreshedRow?.querySelectorAll<HTMLSelectElement>('select') ?? []
    ).find((select) => Array.from(select.options).some((option) => option.value === 'array'));
    expect(typeSelect).toBeTruthy();
    if (!typeSelect) {
      throw new Error('Expected type select');
    }
    typeSelect.value = 'array';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const finalRow = document.querySelector<HTMLElement>(`div[data-row-id="${rowId}"]`);
    const arrayInput =
      finalRow?.querySelector<HTMLInputElement>('.aobx-table__array-input') ?? null;
    expect(arrayInput).toBeTruthy();
    if (!arrayInput) {
      throw new Error('Expected array input');
    }
    arrayInput.value = ' one ; two ; three ';
    arrayInput.dispatchEvent(new Event('input', { bubbles: true }));
    arrayInput.dispatchEvent(new Event('blur', { bubbles: true }));

    if (!controller) {
      throw new Error('Controller missing');
    }
    const overrides = controller.collect();
    const field = (overrides?.contentTypes?.article?.customFields ?? []).find(
      (item) => item.name === 'custom_with_source_path'
    );
    expect(field?.valuePath).toBe('meta.path');
    expect(field?.defaultValue).toEqual(['one', 'two', 'three']);
  });

  it('throws when tableHost is missing and safely no-ops render lookup fallbacks', () => {
    expect(() => createYamlConfigController({ tableHost: null })).toThrow(
      '[YamlConfigController] tableHost is required.'
    );

    const host = document.getElementById('yamlConfigTable');
    const add = document.getElementById('yamlAddFieldBtn');
    const domain = document.getElementById('yamlDomainOverrides');
    host?.remove();
    add?.remove();
    domain?.remove();

    const state = (
      createYamlConfigController({
        tableHost: document.createElement('div'),
        domainHost: null,
        addFieldButton: null,
        onDirty: vi.fn()
      }) as unknown as { controller: { render: (initial: YamlConfigOverrides | null) => void } }
    ).controller;
    expect(() => state.render(null)).not.toThrow();
  });

  it('normalizes advanced valuePath and array defaults while preserving base-order collection', () => {
    const firstRow = createCustomField('z_last');
    const secondRow = createCustomField('a_first');
    const firstId = requireRowId(firstRow, 'Expected first row id');
    const secondId = requireRowId(secondRow, 'Expected second row id');

    const firstToggle = Array.from(firstRow.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => /Show source|Hide source/.test(button.textContent ?? '')
    );
    firstToggle?.dispatchEvent(new Event('click', { bubbles: true }));
    const firstRefreshed = document.querySelector<HTMLElement>(`div[data-row-id="${firstId}"]`);
    const advancedInput =
      firstRefreshed?.querySelector<HTMLInputElement>('.aobx-table__advanced-input') ?? null;
    expect(advancedInput).toBeTruthy();
    if (!advancedInput) throw new Error('Missing advanced input');
    advancedInput.value = '   ';
    advancedInput.dispatchEvent(new Event('input', { bubbles: true }));
    advancedInput.dispatchEvent(new Event('blur', { bubbles: true }));
    expect(advancedInput.value).toBe('');
    advancedInput.value = ' meta.author ';
    advancedInput.dispatchEvent(new Event('input', { bubbles: true }));
    advancedInput.dispatchEvent(new Event('blur', { bubbles: true }));
    expect(advancedInput.value).toBe('meta.author');

    const secondRefreshed = document.querySelector<HTMLElement>(`div[data-row-id="${secondId}"]`);
    const typeSelect = Array.from(
      secondRefreshed?.querySelectorAll<HTMLSelectElement>('select') ?? []
    ).find((select) => Array.from(select.options).some((option) => option.value === 'array'));
    if (!typeSelect) throw new Error('Missing type select');
    typeSelect.value = 'array';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const secondFinal = document.querySelector<HTMLElement>(`div[data-row-id="${secondId}"]`);
    const arrayInput =
      secondFinal?.querySelector<HTMLInputElement>('.aobx-table__array-input') ?? null;
    if (!arrayInput) throw new Error('Missing array input');
    arrayInput.value = ' one ;; two ; ; three ;  ';
    arrayInput.dispatchEvent(new Event('input', { bubbles: true }));
    arrayInput.dispatchEvent(new Event('blur', { bubbles: true }));
    expect(arrayInput.value).toBe('one; two; three');

    const sortArticle = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Article'
    );
    sortArticle?.dispatchEvent(new Event('click', { bubbles: true }));

    if (!controller) throw new Error('Controller missing');
    const overrides = controller.collect();
    const customNames = (overrides?.contentTypes?.article?.customFields ?? []).map(
      (field) => field.name
    );
    expect(customNames.slice(-2)).toEqual(['z_last', 'a_first']);
    const zLast = (overrides?.contentTypes?.article?.customFields ?? []).find(
      (field) => field.name === 'z_last'
    );
    const aFirst = (overrides?.contentTypes?.article?.customFields ?? []).find(
      (field) => field.name === 'a_first'
    );
    expect(zLast?.valuePath).toBe('meta.author');
    expect(aFirst?.defaultValue).toEqual(['one', 'two', 'three']);
  });

  it('clears warning banner after removing duplicate domain rules normalized by whitespace and case', () => {
    const addDomainRule = () => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (candidate) => candidate.textContent?.includes('添加域名规则')
      );
      button?.dispatchEvent(new Event('click', { bubbles: true }));
    };
    addDomainRule();
    addDomainRule();

    const domainInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('.aobx-domain__domain-input')
    );
    domainInputs[0].value = ' Docs.Example.com ';
    domainInputs[1].value = 'docs.example.com';
    domainInputs.forEach((input) => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    });

    expect(() => controller?.collect()).toThrowError();
    expect(document.querySelector('.aobx-table__global-errors')).toBeTruthy();

    const cards = Array.from(document.querySelectorAll<HTMLElement>('.aobx-domain__card'));
    const deleteButton = Array.from(
      cards[1]?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).find((button) => button.title === 'Delete' || button.textContent?.includes('删除'));
    deleteButton?.dispatchEvent(new Event('click', { bubbles: true }));

    expect(() => controller?.collect()).toThrowError();
  });

  it('disables custom row move buttons while sort or filter mode is active', () => {
    const row = createCustomField('custom_move_blocked');
    const rowId = requireRowId(row, 'Missing row id');

    const getMoveButtons = () => {
      const currentRow = document.querySelector<HTMLElement>(`div[data-row-id="${rowId}"]`);
      return Array.from(currentRow?.querySelectorAll<HTMLButtonElement>('button') ?? []).filter(
        (button) => {
          const text = button.textContent?.trim() ?? '';
          return text === '↑' || text === '↓';
        }
      );
    };

    const filterButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Article'
    );
    expect(filterButton).toBeTruthy();
    filterButton?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(getMoveButtons().every((button) => button.disabled)).toBe(true);

    filterButton?.dispatchEvent(new Event('click', { bubbles: true }));
    const sortButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) =>
        button.textContent?.trim() === 'Article ↑' || button.textContent?.trim() === 'Article'
    );
    sortButton?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(getMoveButtons().every((button) => button.disabled)).toBe(true);
  });

  it('clears domain valuePath validation after trimming spaces away', () => {
    const addDomainRuleButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('添加域名规则'));
    addDomainRuleButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const domainInput = document.querySelector<HTMLInputElement>('.aobx-domain__domain-input');
    if (!domainInput) throw new Error('Expected domain input');
    domainInput.value = 'docs.example.com';
    domainInput.dispatchEvent(new Event('input', { bubbles: true }));
    domainInput.dispatchEvent(new Event('blur', { bubbles: true }));

    const addFieldButton = document.querySelector<HTMLButtonElement>('.aobx-domain__add-field-btn');
    addFieldButton?.dispatchEvent(new Event('click', { bubbles: true }));

    const valuePathInput = document.querySelector<HTMLInputElement>(
      '.aobx-domain__value-path-input'
    );
    if (!valuePathInput) throw new Error('Expected valuePath input');
    valuePathInput.value = 'invalid path';
    valuePathInput.dispatchEvent(new Event('input', { bubbles: true }));
    valuePathInput.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(() => controller?.collect()).toThrowError();
    expect(document.querySelector('.aobx-table__global-errors, .aobx-domain__errors')).toBeTruthy();

    valuePathInput.value = 'meta.author';
    valuePathInput.dispatchEvent(new Event('input', { bubbles: true }));
    valuePathInput.dispatchEvent(new Event('blur', { bubbles: true }));

    if (!controller) throw new Error('Controller missing');
    const overrides = controller.collect();
    expect(
      overrides.contentTypes?.article?.domainOverrides?.['docs.example.com']?.[0]
    ).toMatchObject({ valuePath: 'meta.author' });
  });

  it('clears normalized duplicate-domain errors after editing one rule to a unique host', () => {
    const addDomainRule = () => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (candidate) => candidate.textContent?.includes('添加域名规则')
      );
      button?.dispatchEvent(new Event('click', { bubbles: true }));
    };

    addDomainRule();
    addDomainRule();

    const domainInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('.aobx-domain__domain-input')
    );
    const addFieldButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.aobx-domain__add-field-btn')
    );
    domainInputs[0].value = ' Docs.Example.com ';
    domainInputs[1].value = 'docs.example.com';
    domainInputs.forEach((input) => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    addFieldButtons.forEach((button) => {
      button.dispatchEvent(new Event('click', { bubbles: true }));
    });

    expect(() => controller?.collect()).toThrowError();
    expect(document.querySelector('.aobx-table__global-errors')).toBeTruthy();

    domainInputs[1].value = ' api.example.com ';
    domainInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    domainInputs[1].dispatchEvent(new Event('blur', { bubbles: true }));

    if (!controller) throw new Error('Controller missing');
    const overrides = controller.collect();
    const domains = Object.keys(overrides.contentTypes?.article?.domainOverrides ?? {});
    expect(domains).toEqual(['Docs.Example.com', 'api.example.com']);
    expect(document.querySelectorAll('.aobx-domain__errors')).toHaveLength(0);
  });

  it('clears stale default values when switching custom field types before collect', () => {
    const row = createCustomField('type_switch_field');
    const rowId = requireRowId(row, 'Missing type-switch row id');
    const getRow = () => document.querySelector<HTMLElement>(`div[data-row-id="${rowId}"]`);

    let currentRow = getRow();
    const textInput = Array.from(
      currentRow?.querySelectorAll<HTMLInputElement>('input[type="text"]') ?? []
    ).find((input) => input.value === 'type_switch_field');
    const defaultInput = Array.from(
      currentRow?.querySelectorAll<HTMLInputElement>('input[type="text"]') ?? []
    ).find(
      (input) => input !== textInput && !input.classList.contains('aobx-table__advanced-input')
    );
    const typeSelect = currentRow?.querySelector<HTMLSelectElement>('select');
    if (!defaultInput || !typeSelect) throw new Error('Missing editable controls');

    defaultInput.value = '123';
    defaultInput.dispatchEvent(new Event('input', { bubbles: true }));
    defaultInput.dispatchEvent(new Event('blur', { bubbles: true }));

    typeSelect.value = 'boolean';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    currentRow = getRow();
    const booleanInput = Array.from(
      currentRow?.querySelectorAll<HTMLInputElement>('input[type="text"]') ?? []
    ).find((input) => input.value !== 'type_switch_field');
    expect(booleanInput?.value ?? '').toBe('');
    if (!booleanInput) throw new Error('Missing boolean input');
    booleanInput.value = 'true';
    booleanInput.dispatchEvent(new Event('input', { bubbles: true }));
    booleanInput.dispatchEvent(new Event('blur', { bubbles: true }));

    if (!controller) throw new Error('Controller missing');
    const field = controller
      .collect()
      ?.contentTypes?.article?.customFields?.find((item) => item.name === 'type_switch_field');
    expect(field).toMatchObject({ type: 'boolean', defaultValue: true });
  });

  it('keeps trimmed advanced valuePath while toggling row type and filtering collect order', () => {
    const row = createCustomField('value_path_switch');
    const rowId = requireRowId(row, 'Missing advanced row id');
    const getRow = () => document.querySelector<HTMLElement>(`div[data-row-id="${rowId}"]`);

    const advancedToggle = Array.from(
      getRow()?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).find((button) => /Show source|Hide source/.test(button.textContent ?? ''));
    advancedToggle?.dispatchEvent(new Event('click', { bubbles: true }));

    let currentRow = getRow();
    let advancedInput =
      currentRow?.querySelector<HTMLInputElement>('.aobx-table__advanced-input') ?? null;
    const typeSelect = currentRow?.querySelector<HTMLSelectElement>('select');
    if (!advancedInput || !typeSelect) throw new Error('Missing advanced controls');
    advancedInput.value = ' meta.author ';
    advancedInput.dispatchEvent(new Event('input', { bubbles: true }));
    advancedInput.dispatchEvent(new Event('blur', { bubbles: true }));

    typeSelect.value = 'array';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    currentRow = getRow();
    advancedInput =
      currentRow?.querySelector<HTMLInputElement>('.aobx-table__advanced-input') ?? null;
    const arrayInput =
      currentRow?.querySelector<HTMLInputElement>('.aobx-table__array-input') ?? null;
    if (!advancedInput || !arrayInput) throw new Error('Missing post-switch controls');
    expect(advancedInput.value).toBe('meta.author');
    arrayInput.value = ' one\n\n two ; three ';
    arrayInput.dispatchEvent(new Event('input', { bubbles: true }));
    arrayInput.dispatchEvent(new Event('blur', { bubbles: true }));

    const filterButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Article'
    );
    filterButton?.dispatchEvent(new Event('click', { bubbles: true }));

    if (!controller) throw new Error('Controller missing');
    const field = controller
      .collect()
      ?.contentTypes?.article?.customFields?.find((item) => item.name === 'value_path_switch');
    expect(field).toMatchObject({
      type: 'array',
      valuePath: 'meta.author',
      defaultValue: ['one two', 'three']
    });
  });

  it('clears global warnings after deleting an invalid custom row', () => {
    const addButton = document.getElementById('yamlAddFieldBtn');
    if (!addButton) throw new Error('Expected add button');

    const before = new Set(
      Array.from(document.querySelectorAll<HTMLElement>('div[data-row-id]')).map((row) =>
        requireRowId(row, 'Missing row id')
      )
    );
    addButton.dispatchEvent(new Event('click', { bubbles: true }));

    const invalidRow = Array.from(document.querySelectorAll<HTMLElement>('div[data-row-id]')).find(
      (row) => !before.has(requireRowId(row, 'Missing invalid row id'))
    );
    if (!invalidRow) throw new Error('Expected invalid row');

    expect(() => controller?.collect()).toThrowError();
    expect(document.querySelector('.aobx-table__global-errors')).toBeTruthy();

    const deleteButton = Array.from(invalidRow.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.title === 'Delete' || button.textContent === '×'
    );
    deleteButton?.dispatchEvent(new Event('click', { bubbles: true }));

    expect(() => controller?.collect()).not.toThrow();
    expect(document.querySelector('.aobx-table__global-errors')).toBeFalsy();
  });

  it('omits empty valuePath after clearing advanced input back to blank', () => {
    const row = createCustomField('blank_value_path');
    const rowId = requireRowId(row, 'Missing blank valuePath row id');
    const getRow = () => document.querySelector<HTMLElement>(`div[data-row-id="${rowId}"]`);

    const advancedToggle = Array.from(
      getRow()?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).find((button) => /Show source|Hide source/.test(button.textContent ?? ''));
    advancedToggle?.dispatchEvent(new Event('click', { bubbles: true }));

    let advancedInput =
      getRow()?.querySelector<HTMLInputElement>('.aobx-table__advanced-input') ?? null;
    if (!advancedInput) throw new Error('Missing advanced input');
    advancedInput.value = ' meta.author ';
    advancedInput.dispatchEvent(new Event('input', { bubbles: true }));
    advancedInput.dispatchEvent(new Event('blur', { bubbles: true }));

    advancedInput =
      getRow()?.querySelector<HTMLInputElement>('.aobx-table__advanced-input') ?? null;
    if (!advancedInput) throw new Error('Missing advanced input after first blur');
    advancedInput.value = '   ';
    advancedInput.dispatchEvent(new Event('input', { bubbles: true }));
    advancedInput.dispatchEvent(new Event('blur', { bubbles: true }));

    if (!controller) throw new Error('Controller missing');
    const field = controller
      .collect()
      ?.contentTypes?.article?.customFields?.find((item) => item.name === 'blank_value_path');
    expect(field?.valuePath).toBeUndefined();
  });

  it('normalizes array defaults by removing empty segments from mixed separators', () => {
    const row = createCustomField('mixed_array_segments');
    const rowId = requireRowId(row, 'Missing mixed array row id');
    const getRow = () => document.querySelector<HTMLElement>(`div[data-row-id="${rowId}"]`);

    const typeSelect = getRow()?.querySelector<HTMLSelectElement>('select');
    if (!typeSelect) throw new Error('Missing type select');
    typeSelect.value = 'array';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const arrayInput =
      getRow()?.querySelector<HTMLInputElement>('.aobx-table__array-input') ?? null;
    if (!arrayInput) throw new Error('Missing array input');
    arrayInput.value = ' alpha ;; , \n beta , , ; gamma ; ';
    arrayInput.dispatchEvent(new Event('input', { bubbles: true }));
    arrayInput.dispatchEvent(new Event('blur', { bubbles: true }));

    if (!controller) throw new Error('Controller missing');
    const field = controller
      .collect()
      ?.contentTypes?.article?.customFields?.find((item) => item.name === 'mixed_array_segments');
    expect(field?.defaultValue).toEqual(['alpha', 'beta', 'gamma']);
    expect(arrayInput.value).toBe('alpha; beta; gamma');
  });

  it('clears duplicate-domain warnings after deleting one conflicting rule', () => {
    const addRule = () => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (candidate) => candidate.textContent?.includes('添加域名规则')
      );
      button?.dispatchEvent(new Event('click', { bubbles: true }));
    };

    addRule();
    addRule();

    const domainInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('.aobx-domain__domain-input')
    );
    const addFieldButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.aobx-domain__add-field-btn')
    );
    domainInputs[0].value = ' Docs.Example.com ';
    domainInputs[1].value = 'docs.example.com';
    domainInputs.forEach((input) => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    addFieldButtons.forEach((button) =>
      button.dispatchEvent(new Event('click', { bubbles: true }))
    );

    expect(() => controller?.collect()).toThrowError();
    expect(document.querySelector('.aobx-table__global-errors')).toBeTruthy();

    const removeButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.aobx-domain__remove-btn, .aobx-btn')
    ).filter((button) => button.textContent?.includes('删除规则'));
    removeButtons.at(-1)?.dispatchEvent(new Event('click', { bubbles: true }));

    expect(() => controller?.collect()).not.toThrow();
    expect(document.querySelectorAll('.aobx-domain__errors')).toHaveLength(0);
  });

  it('clears stale default values when switching custom field types repeatedly', () => {
    const row = createCustomField('switch_default_reset');
    const rowId = requireRowId(row, 'Missing switch row id');
    const getRow = () => document.querySelector<HTMLElement>(`div[data-row-id="${rowId}"]`);

    let currentRow = getRow();
    const typeSelect = Array.from(
      currentRow?.querySelectorAll<HTMLSelectElement>('select') ?? []
    ).find((select) => Array.from(select.options).some((option) => option.value === 'array'));
    if (!typeSelect) throw new Error('Missing type select');

    const textInput = currentRow?.querySelector<HTMLInputElement>(
      '.aobx-table__value-container input:not(.aobx-table__array-input)'
    );
    if (!textInput) throw new Error('Missing text default input');
    textInput.value = 'alpha';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));
    textInput.dispatchEvent(new Event('blur', { bubbles: true }));

    typeSelect.value = 'number';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    currentRow = getRow();
    expect(
      currentRow?.querySelector<HTMLInputElement>(
        '.aobx-table__value-container input:not(.aobx-table__array-input)'
      )?.value ?? ''
    ).toBe('');

    const numberInput = currentRow?.querySelector<HTMLInputElement>(
      '.aobx-table__value-container input:not(.aobx-table__array-input)'
    );
    if (!numberInput) throw new Error('Missing numeric default input');
    numberInput.value = '42';
    numberInput.dispatchEvent(new Event('input', { bubbles: true }));
    numberInput.dispatchEvent(new Event('blur', { bubbles: true }));

    typeSelect.value = 'text';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    currentRow = getRow();
    expect(
      currentRow?.querySelector<HTMLInputElement>(
        '.aobx-table__value-container input:not(.aobx-table__array-input)'
      )?.value ?? ''
    ).toBe('');

    if (!controller) throw new Error('Controller missing');
    const field = controller
      .collect()
      ?.contentTypes?.article?.customFields?.find((item) => item.name === 'switch_default_reset');
    expect(field).toMatchObject({ type: 'text' });
    expect(field).not.toHaveProperty('defaultValue');
  });
});

describe('yamlConfigTable pure validation helpers', () => {
  const tableLabels = {
    errors: {
      nameRequired: 'Field name is required',
      namePattern: 'Invalid name',
      nameDuplicate: 'Duplicate field name',
      typeRequired: 'Select a field type.',
      modeRequired: 'Enable at least one content type.',
      valueInvalid: 'Default value does not match the field type.',
      valuePathInvalid: 'Value path cannot contain spaces.'
    },
    warnings: {
      unresolvedErrors: 'Fix the highlighted errors before saving.'
    }
  };

  const domainLabels = {
    errors: {
      domainRequired: 'Domain required',
      domainDuplicate: 'Duplicate domain',
      fieldRequired: 'Field required',
      fieldDuplicate: 'Duplicate field',
      fieldUnsupported: 'Unsupported field:',
      valueInvalid: 'Invalid value:',
      valuePathInvalid: 'Value path invalid'
    },
    warnings: {
      unresolvedErrors: 'Fix domain errors before saving.'
    }
  };

  const makeRow = (overrides: Partial<FieldRow> = {}): FieldRow => ({
    id: overrides.id ?? 'row-1',
    name: overrides.name ?? 'custom_field',
    type: overrides.type ?? 'text',
    defaultValue: overrides.defaultValue ?? '',
    enabled: overrides.enabled ?? createToggleMap(true),
    supported: overrides.supported ?? createToggleMap(true),
    builtIn: overrides.builtIn ?? false,
    isCustom: overrides.isCustom ?? true,
    required: overrides.required ?? false,
    valuePath: overrides.valuePath,
    originTypes: overrides.originTypes ?? new Set()
  });

  it('validates duplicate custom names and invalid default/valuePath without DOM', () => {
    const result = validateYamlConfig({
      rows: [
        makeRow({ id: 'row-1', name: 'dup_name', defaultValue: 'abc', type: 'number' }),
        makeRow({
          id: 'row-2',
          name: 'dup_name',
          enabled: createToggleMap(false),
          valuePath: 'bad path'
        })
      ],
      domainEntries: [],
      tableLabels,
      domainLabels,
      isFieldAvailableForContentType: () => true
    });

    expect(result.rowErrors.get('row-1')).toContain('Duplicate field name');
    expect(result.rowErrors.get('row-1')).toContain('Default value does not match the field type.');
    expect(result.rowErrors.get('row-2')).toContain('Duplicate field name');
    expect(result.rowErrors.get('row-2')).toContain('Enable at least one content type.');
    expect(result.rowErrors.get('row-2')).toContain('Value path cannot contain spaces.');
  });

  it('normalizes duplicate domains by trimmed lowercase keys without DOM', () => {
    const domainEntries: DomainOverrideEntry[] = [
      {
        id: 'entry-1',
        domain: ' Docs.Example.com ',
        contentType: 'article',
        fields: [{ id: 'field-1', name: 'title', type: 'text', enabled: true, defaultValue: '' }]
      },
      {
        id: 'entry-2',
        domain: 'docs.example.com',
        contentType: 'article',
        fields: [{ id: 'field-2', name: 'title', type: 'text', enabled: true, defaultValue: '' }]
      }
    ];

    const result = validateYamlConfig({
      rows: [makeRow({ name: 'title', builtIn: true, isCustom: false })],
      domainEntries,
      tableLabels,
      domainLabels,
      isFieldAvailableForContentType: () => true
    });

    expect(result.domainErrors.get('entry-2')).toContain('Duplicate domain');
  });

  it('parses boolean, number, and array defaults via the pure normalizer', () => {
    expect(parseDefaultValueWithValidation('boolean', 'TRUE')).toEqual({ value: true });
    expect(parseDefaultValueWithValidation('number', '12.5')).toEqual({ value: 12.5 });
    expect(parseDefaultValueWithValidation('array', 'one ; two,, three')).toEqual({
      value: ['one', 'two', 'three']
    });
  });
});
