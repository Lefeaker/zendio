import {
  ARRAY_INPUT_PLACEHOLDER,
  type DomainFieldRendererActions,
  type DomainFieldRow,
  type YamlConfigDomainLabels
} from './yamlConfigTableTypes';
import { createInputElement } from '../../primitives/input';
import { createLayoutElement } from '../../primitives/layout';
import { formatArrayValue } from './yamlConfigTableStateModel';
import { bindYamlInputBlur, bindYamlInputValue } from './yamlConfigTableRendererEvents';

export function buildDomainFieldValueEditor(
  field: DomainFieldRow,
  labels: YamlConfigDomainLabels,
  actions: DomainFieldRendererActions
): HTMLElement {
  const container = createLayoutElement({ className: 'aobx-domain__field-body' });
  container.append(buildDefaultValueInput(field, labels, actions));

  const valuePathLabel = createLayoutElement({
    tag: 'label',
    className: 'aobx-domain__value-path-label',
    textContent: labels.valuePathLabel
  });
  const valuePathInput = createInputElement({
    type: 'text',
    placeholder: labels.valuePathPlaceholder,
    value: field.valuePath ?? '',
    className: 'w-full min-h-[36px] aobx-domain__value-path-input'
  });
  bindYamlInputValue(valuePathInput, (value) => actions.onDomainFieldValuePathInput(field, value));
  bindYamlInputBlur(valuePathInput, (value, target) => {
    actions.onDomainFieldValuePathBlur(field, value);
    target.value = field.valuePath ?? '';
  });
  container.append(valuePathLabel, valuePathInput);
  return container;
}

function buildDefaultValueInput(
  field: DomainFieldRow,
  labels: YamlConfigDomainLabels,
  actions: DomainFieldRendererActions
): HTMLElement {
  const valueContainer = createLayoutElement({ className: 'aobx-table__value-container' });
  const isArray = field.type === 'array';
  const placeholderRaw = labels.arrayPlaceholder.trim();
  const input = createInputElement({
    type: 'text',
    placeholder: isArray
      ? placeholderRaw.includes(';')
        ? placeholderRaw
        : ARRAY_INPUT_PLACEHOLDER
      : labels.valuePlaceholder,
    value: isArray ? formatArrayValue(field.defaultValue ?? '') : (field.defaultValue ?? ''),
    className: isArray
      ? 'w-full min-h-[36px] aobx-table__array-input'
      : 'w-full min-h-[36px] aobx-input'
  });

  bindYamlInputValue(input, (value) => actions.onDomainFieldDefaultInput(field, value));
  bindYamlInputBlur(input, (value, target) => {
    actions.onDomainFieldDefaultBlur(field, value);
    target.value = field.defaultValue ?? '';
  });
  valueContainer.append(input);
  return valueContainer;
}
