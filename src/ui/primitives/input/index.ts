import { applyValidationA11y } from '../../foundation/a11y';
import type { DataAttributes, InputValidationState } from '../../foundation/types';

export type InputType = 'text' | 'password' | 'number' | 'email' | 'url';
export type InputSize = 'sm' | 'md' | 'lg';
export type InputVariant = 'normal' | 'bordered' | 'ghost';
export type { InputValidationState } from '../../foundation/types';

export interface InputProps {
  id?: string;
  type?: InputType;
  size?: InputSize;
  variant?: InputVariant;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  className?: string;
  validationState?: InputValidationState;
  dataAttributes?: DataAttributes;
  onChange?: (value: string, event: Event) => void;
  onBlur?: (value: string, event: Event) => void;
}

const INPUT_VARIANT_CLASS: Record<InputVariant, string> = {
  normal: '',
  bordered: 'input-bordered',
  ghost: 'input-ghost'
};

const INPUT_SIZE_CLASS: Record<InputSize, string> = {
  sm: 'input-sm',
  md: '',
  lg: 'input-lg'
};

const INPUT_VALIDATION_CLASS: Record<InputValidationState, string> = {
  default: '',
  success: 'input-success',
  error: 'input-error'
};

export function createInputElement(props: InputProps): HTMLInputElement {
  const input = document.createElement('input');
  input.type = props.type ?? 'text';
  input.className = [
    'input',
    INPUT_VARIANT_CLASS[props.variant ?? 'bordered'],
    INPUT_SIZE_CLASS[props.size ?? 'md'],
    INPUT_VALIDATION_CLASS[props.validationState ?? 'default'],
    props.className ?? ''
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  input.disabled = Boolean(props.disabled);
  input.required = Boolean(props.required);

  if (props.id) {
    input.id = props.id;
  }
  if (typeof props.placeholder === 'string') {
    input.placeholder = props.placeholder;
  }
  if (typeof props.value !== 'undefined') {
    input.value = props.value;
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
    input.addEventListener('input', (event) => {
      props.onChange?.((event.target as HTMLInputElement).value, event);
    });
  }
  if (props.onBlur) {
    input.addEventListener('blur', (event) => {
      props.onBlur?.((event.target as HTMLInputElement).value, event);
    });
  }

  return input;
}

export class UiInput {
  constructor(private readonly host: HTMLElement) {}

  render(props: InputProps): HTMLInputElement {
    const input = createInputElement(props);
    this.host.replaceChildren(input);
    return input;
  }
}
