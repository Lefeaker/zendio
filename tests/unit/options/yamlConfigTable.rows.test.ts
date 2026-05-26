/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCustomField,
  mountController,
  requireOverrides,
  requireRowId,
  type YamlConfigController
} from './yamlConfigTable.helpers';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';

describe('yamlConfigTable rows', () => {
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
    const overrides = requireOverrides(controller.collect());
    const articleCustom = overrides?.contentTypes?.article?.customFields ?? [];
    expect(articleCustom.map((field) => field.name)).toContain('custom_beta_keep');
    expect(articleCustom.map((field) => field.name)).not.toContain('custom_alpha_delete');
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
    const overrides = requireOverrides(controller.collect());
    const articleCustom = (overrides?.contentTypes?.article?.customFields ?? [])
      .map((field) => field.name)
      .filter((name) => name.startsWith('custom_'));
    expect(articleCustom).toEqual(['custom_second', 'custom_first']);
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
    const overrides = requireOverrides(controller.collect());
    const field = (overrides?.contentTypes?.article?.customFields ?? []).find(
      (item) => item.name === 'custom_with_source_path'
    );
    expect(field?.valuePath).toBe('meta.path');
    expect(field?.defaultValue).toEqual(['one', 'two', 'three']);
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
