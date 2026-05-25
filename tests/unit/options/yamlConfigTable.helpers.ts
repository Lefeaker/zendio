import { vi } from 'vitest';
import {
  createYamlConfigController,
  type YamlConfigController
} from '../../../src/ui/domains/yaml-config/yamlConfigTable';
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

export function mountController(): YamlConfigController {
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

export function requireRowId(row: HTMLElement, errorMessage: string): string {
  const { rowId } = row.dataset;
  if (!rowId) {
    throw new Error(errorMessage);
  }
  return rowId;
}

export function requireOverrides(overrides: YamlConfigOverrides | null): YamlConfigOverrides {
  if (!overrides) {
    throw new Error('Expected collected YAML overrides');
  }
  return overrides;
}

export function createCustomField(name: string): HTMLElement {
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

export type { YamlConfigController };
