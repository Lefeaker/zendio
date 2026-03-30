import { applyValidationA11y } from '../../foundation/a11y';
import type { DataAttributes } from '../../foundation/types';

export interface CheckboxProps {
  id?: string;
  label?: string;
  checked?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  validationState?: 'default' | 'error';
  dataAttributes?: DataAttributes;
  labelClassName?: string;
  inputClassName?: string;
  onChange?: (checked: boolean, event: Event) => void;
}

export interface CheckboxRenderResult {
  root: HTMLLabelElement;
  input: HTMLInputElement;
}

export function createCheckboxElement(props: CheckboxProps): CheckboxRenderResult {
  const label = document.createElement('label');
  label.className = [
    'inline-flex',
    'items-center',
    'gap-2',
    'text-sm',
    'text-base-content',
    props.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
    props.labelClassName ?? ''
  ]
    .filter(Boolean)
    .join(' ');

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = [
    'checkbox',
    props.validationState === 'error' ? 'checkbox-error' : 'checkbox-accent',
    'w-[18px]',
    'h-[18px]',
    props.inputClassName ?? ''
  ]
    .filter(Boolean)
    .join(' ');
  input.checked = Boolean(props.checked);
  input.disabled = Boolean(props.disabled);

  if (props.id) {
    input.id = props.id;
  }
  if (props.ariaLabel) {
    input.setAttribute('aria-label', props.ariaLabel);
  }
  applyValidationA11y(input, props.validationState ?? 'default', props.ariaDescribedBy);
  if (props.dataAttributes) {
    for (const [key, value] of Object.entries(props.dataAttributes)) {
      input.dataset[key] = value;
    }
  }
  if (props.onChange) {
    input.addEventListener('change', (event) => {
      props.onChange?.((event.target as HTMLInputElement).checked, event);
    });
  }

  label.append(input);
  if (props.label) {
    const text = document.createElement('span');
    text.textContent = props.label;
    label.append(text);
  }

  return { root: label, input };
}

export class UiCheckbox {
  constructor(private readonly host: HTMLElement) {}

  render(props: CheckboxProps): HTMLInputElement {
    const { root, input } = createCheckboxElement(props);
    this.host.replaceChildren(root);
    return input;
  }
}
