import { createInputElement } from '../../primitives/input';
import {
  createOptionsHintText,
  createLayoutElement,
  createOptionsPanel
} from '../../primitives/layout';
import {
  ARRAY_INPUT_PLACEHOLDER,
  type FieldRow,
  type RowActions,
  type YamlConfigTableLabels
} from './yamlConfigTableTypes';
import { formatArrayValue } from './yamlConfigTableStateModel';
import { bindYamlInputBlur, bindYamlInputValue } from './yamlConfigTableRendererEvents';

export function buildYamlDefaultValueEditor(
  row: FieldRow,
  labels: YamlConfigTableLabels,
  actions: RowActions
): HTMLElement {
  const container = createLayoutElement({ className: 'aobx-table__value-container' });
  const initialValue = row.defaultValue ?? '';

  if (row.type === 'array') {
    const placeholderRaw = labels.arrayPlaceholder.trim();
    const input = createInputElement({
      type: 'text',
      placeholder: placeholderRaw.includes(';') ? placeholderRaw : ARRAY_INPUT_PLACEHOLDER,
      value: formatArrayValue(initialValue),
      disabled: row.builtIn,
      className: 'w-full min-h-[36px] disabled:opacity-50 aobx-table__array-input'
    });
    bindYamlInputValue(input, (value) => actions.onDefaultValueInput(row, value));
    bindYamlInputBlur(input, (value, target) => {
      actions.onDefaultValueBlur(row, value);
      target.value = row.defaultValue ?? '';
    });
    container.append(input);
    return container;
  }

  const input = createInputElement({
    type: 'text',
    value: initialValue,
    placeholder: labels.valuePlaceholder,
    disabled: row.builtIn,
    className: 'w-full min-h-[36px] disabled:opacity-50'
  });
  bindYamlInputValue(input, (value) => actions.onDefaultValueInput(row, value));
  bindYamlInputBlur(input, (value, target) => {
    actions.onDefaultValueBlur(row, value);
    target.value = row.defaultValue ?? '';
  });
  container.append(input);
  return container;
}

export function buildYamlAdvancedPanel(
  row: FieldRow,
  labels: YamlConfigTableLabels,
  actions: RowActions
): HTMLElement {
  const panel = createOptionsPanel({
    className:
      'col-span-full mt-2 grid gap-2 rounded border border-base-300 bg-base-200 p-3 text-sm'
  });
  panel.style.gridColumn = '1 / -1';

  const label = createLayoutElement({
    tag: 'label',
    className: 'aobx-table__advanced-label'
  });
  const inputId = `yaml-advanced-${row.id}`;
  label.setAttribute('for', inputId);
  label.textContent = labels.valuePathLabel;

  const input = createInputElement({
    id: inputId,
    type: 'text',
    placeholder: labels.valuePathPlaceholder,
    value: row.valuePath ?? '',
    className: 'w-full min-h-[36px] aobx-table__advanced-input'
  });
  bindYamlInputValue(input, (value) => actions.onAdvancedValuePathInput(row, value));
  bindYamlInputBlur(input, (value, target) => {
    actions.onAdvancedValuePathBlur(row, value);
    target.value = row.valuePath ?? '';
  });

  const hint = createOptionsHintText({
    className: 'aobx-table__advanced-hint',
    text: labels.valuePathHint
  });
  panel.append(label, input, hint);

  if (labels.valuePathExamples.trim()) {
    const examples = createLayoutElement({
      tag: 'details',
      className: 'aobx-table__advanced-examples'
    });
    const summary = createLayoutElement({
      tag: 'summary',
      textContent: labels.valuePathExamplesTitle
    });
    const code = createLayoutElement({
      tag: 'pre',
      className: 'aobx-table__advanced-examples-body',
      textContent: labels.valuePathExamples
    });
    examples.append(summary, code);
    panel.append(examples);
  }

  return panel;
}
