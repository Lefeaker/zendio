/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCustomField,
  mountController,
  requireOverrides,
  requireRowId,
  type YamlConfigController
} from './yamlConfigTable.helpers';

describe('yamlConfigTable persistence', () => {
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

    const overrides = requireOverrides(controller.collect());
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

    const overrides = requireOverrides(controller.collect());
    const articleCustom = overrides?.contentTypes?.article?.customFields ?? [];
    expect(articleCustom.map((field) => field.name)).toEqual([
      'status',
      'custom_beta',
      'custom_alpha'
    ]);
    expect(firstId).not.toEqual(secondId);
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
    const overrides = requireOverrides(controller.collect());
    const articleCustom = overrides?.contentTypes?.article?.customFields ?? [];
    const field = articleCustom.find((item) => item.name === 'custom_array_values');
    expect(field?.defaultValue).toEqual(['alpha', 'beta', 'gamma', 'delta']);
    expect(arrayInput.value).toBe('alpha; beta; gamma; delta');
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
    const overrides = requireOverrides(controller.collect());
    const customNames = (overrides.contentTypes?.article?.customFields ?? []).map(
      (field) => field.name
    );
    expect(customNames).toContain('custom_keep');
    expect(customNames).not.toContain('custom_delete');
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
    const overrides = requireOverrides(controller.collect());
    expect(overrides.contentTypes?.article?.domainOverrides?.['video.example.com']).toEqual([
      expect.objectContaining({ name: 'tags', defaultValue: ['alpha', 'beta', 'gamma'] })
    ]);
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
    const overrides = requireOverrides(controller.collect());
    const fields = overrides?.contentTypes?.article?.domainOverrides?.['sub.example.com'];
    expect(fields?.[0]?.valuePath).toBe('meta.path');
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
    const overrides = requireOverrides(controller.collect());
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
});
