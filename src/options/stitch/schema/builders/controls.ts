import type { ActionDescriptor, DynamicValue, NodeSchema, SelectOption } from '../../types';
import { element } from './primitives';
import { classNames } from './classNames';

interface BoundInputOptions {
  bind?: string;
  value?: DynamicValue<string | number>;
  mono?: boolean;
  type?: DynamicValue<string>;
  placeholder?: DynamicValue<string>;
  className?: DynamicValue<string>;
  dataset?: DynamicValue<Record<string, string | number | boolean>>;
  disabled?: DynamicValue<boolean>;
  min?: DynamicValue<string | number>;
  max?: DynamicValue<string | number>;
  step?: DynamicValue<string | number>;
  onInput?: DynamicValue<ActionDescriptor>;
  onChange?: DynamicValue<ActionDescriptor>;
  onFocus?: DynamicValue<ActionDescriptor>;
  onBlur?: DynamicValue<ActionDescriptor>;
  onClick?: DynamicValue<ActionDescriptor>;
  onKeyUp?: DynamicValue<ActionDescriptor>;
  onSelect?: DynamicValue<ActionDescriptor>;
  onMouseEnter?: DynamicValue<ActionDescriptor>;
}

interface BoundTextareaOptions {
  bind?: string;
  value?: DynamicValue<string | number>;
  placeholder?: DynamicValue<string>;
  className?: DynamicValue<string>;
  dataset?: DynamicValue<Record<string, string | number | boolean>>;
  disabled?: DynamicValue<boolean>;
  onInput?: DynamicValue<ActionDescriptor>;
  onChange?: DynamicValue<ActionDescriptor>;
  onFocus?: DynamicValue<ActionDescriptor>;
  onBlur?: DynamicValue<ActionDescriptor>;
}

interface BoundSelectOptions {
  bind?: string;
  value?: DynamicValue<string | number>;
  options: DynamicValue<SelectOption[]>;
  className?: DynamicValue<string>;
  disabled?: DynamicValue<boolean>;
  onChange?: DynamicValue<ActionDescriptor>;
}

interface BoundSwitchOptions {
  bind?: string;
  checked?: DynamicValue<boolean>;
  disabled?: DynamicValue<boolean>;
  compact?: DynamicValue<boolean>;
  stateText?: DynamicValue<string>;
  onClick?: DynamicValue<ActionDescriptor>;
  onChange?: DynamicValue<ActionDescriptor>;
}

export function boundInput(options: BoundInputOptions): NodeSchema {
  return {
    kind: 'input',
    ...options
  };
}

export function boundTextarea(options: BoundTextareaOptions): NodeSchema {
  return {
    kind: 'textarea',
    ...options
  };
}

export function boundSelect(options: BoundSelectOptions): NodeSchema {
  return {
    kind: 'select',
    ...options
  };
}

export function boundSwitch(options: BoundSwitchOptions): NodeSchema {
  return {
    kind: 'switch',
    ...options
  };
}

export function templateBoundInput(field: string): NodeSchema {
  const updateAction: ActionDescriptor = {
    id: 'template:updateValue',
    args: [field],
    valueFrom: 'target.value'
  };

  return boundInput({
    bind: `templateValues.${field}`,
    mono: true,
    dataset: { templateField: field },
    onMouseEnter: { id: 'template:setActiveField', args: [field] },
    onFocus: { id: 'template:setActiveField', args: [field] },
    onInput: updateAction,
    onChange: updateAction
  });
}

export function routingBoundInput(
  index: number,
  field: string,
  value: string,
  options: Omit<BoundInputOptions, 'value' | 'onChange'> = {}
): NodeSchema {
  return boundInput({
    value,
    ...options,
    onChange: {
      id: 'routing:updateField',
      args: [index, field],
      valueFrom: 'target.value'
    }
  });
}

export function routingBoundSelect(
  index: number,
  field: string,
  value: string,
  selectOptions: DynamicValue<SelectOption[]>,
  className?: DynamicValue<string>
): NodeSchema {
  return boundSelect({
    value,
    options: selectOptions,
    ...(className ? { className } : {}),
    onChange: {
      id: 'routing:updateField',
      args: [index, field],
      valueFrom: 'target.value'
    }
  });
}

export function helperText(
  text: DynamicValue<string | number>,
  className = classNames.common.surfaceHelperText
): NodeSchema {
  return element('div', {
    className,
    text
  });
}
