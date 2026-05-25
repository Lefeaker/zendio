/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCustomField,
  mountController,
  requireOverrides,
  requireRowId,
  type YamlConfigController
} from './yamlConfigTable.helpers';
import { createYamlConfigController } from '../../../src/ui/domains/yaml-config/yamlConfigTable';
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
    const overrides = requireOverrides(controller.collect());
    expect(overrides?.contentTypes?.article?.domainOverrides).toBeUndefined();
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
    const overrides = requireOverrides(controller.collect());
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
    const overrides = requireOverrides(controller.collect());
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
    const overrides = requireOverrides(controller.collect());
    const customNames = (overrides?.contentTypes?.article?.customFields ?? []).map(
      (field) => field.name
    );
    expect(customNames).toContain('custom_keep_after_delete');
    expect(customNames).not.toContain('1bad_name');
    expect(document.querySelector('.aobx-table__global-errors')).toBeNull();
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
    const overrides = requireOverrides(controller.collect());
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
    const overrides = requireOverrides(controller.collect());
    const domains = Object.keys(overrides.contentTypes?.article?.domainOverrides ?? {});
    expect(domains).toEqual(['Docs.Example.com', 'api.example.com']);
    expect(document.querySelectorAll('.aobx-domain__errors')).toHaveLength(0);
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
