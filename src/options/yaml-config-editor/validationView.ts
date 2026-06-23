import { el } from './dom';
import { FALLBACK_YAML_EDITOR_LABELS, type YamlEditorLabels } from './labels';
import type { YamlEditorValidation, YamlEditorValidationError } from './types';

function formatError(error: YamlEditorValidationError, labels: YamlEditorLabels): string {
  if (error.code === 'default_invalid' && error.message in labels.errors) {
    return labels.errors[error.message] ?? labels.errors.default_invalid ?? error.message;
  }
  return labels.errors[error.code] ?? error.message;
}

function renderErrorList(
  errors: YamlEditorValidationError[],
  className: string,
  labels: YamlEditorLabels
) {
  const list = el('ul', { className });
  Array.from(new Set(errors.map((error) => formatError(error, labels)))).forEach((message) => {
    list.append(el('li', { text: message }));
  });
  return list;
}

export function renderYamlEditorValidation(
  container: HTMLElement | null,
  validation: YamlEditorValidation | null,
  labels: YamlEditorLabels = FALLBACK_YAML_EDITOR_LABELS
): void {
  if (!container) {
    return;
  }
  container
    .querySelectorAll('.yaml-row-errors, .yaml-domain-error-list')
    .forEach((node) => node.remove());
  container.querySelectorAll('.is-invalid').forEach((node) => node.classList.remove('is-invalid'));

  const global = container.querySelector<HTMLElement>('[data-yaml-errors="global"]');
  if (global) {
    global.replaceChildren();
    if (validation && !validation.valid) {
      global.append(
        el('p', {
          className: 'yaml-global-error-list',
          text: labels.table.invalidWarning
        })
      );
    }
    if (validation?.globalErrors.length) {
      global.append(renderErrorList(validation.globalErrors, 'yaml-global-error-list', labels));
    }
  }

  Object.entries(validation?.fieldErrors ?? {}).forEach(([fieldId, errors]) => {
    const row = Array.from(container.querySelectorAll<HTMLElement>('[data-field-ids]')).find(
      (candidate) => (candidate.dataset.fieldIds ?? '').split(' ').includes(fieldId)
    );
    if (!row) {
      return;
    }
    row.classList.add('is-invalid');
    row
      .querySelector<HTMLTableCellElement>('td:last-child')
      ?.append(renderErrorList(errors, 'yaml-row-errors', labels));
  });

  Object.entries(validation?.domainErrors ?? {}).forEach(([entryId, errors]) => {
    const card = Array.from(container.querySelectorAll<HTMLElement>('[data-domain-rule-id]')).find(
      (candidate) => candidate.dataset.domainRuleId === entryId
    );
    card?.classList.add('is-invalid');
    card
      ?.querySelector<HTMLElement>('[data-yaml-domain-errors]')
      ?.append(renderErrorList(errors, 'yaml-domain-error-list', labels));
  });
}
