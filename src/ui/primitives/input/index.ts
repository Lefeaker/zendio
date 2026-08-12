import { applyValidationA11y } from '../../foundation/a11y';
import type { DataAttributes, InputValidationState } from '../../foundation/types';

export type InputType = string;
export type InputSize = 'sm' | 'md' | 'lg';
export type InputVariant = 'normal' | 'bordered' | 'ghost';
export type { InputValidationState } from '../../foundation/types';

export interface InputProps {
  id?: string;
  type?: InputType | undefined;
  size?: InputSize;
  variant?: InputVariant;
  placeholder?: string | undefined;
  value?: string;
  disabled?: boolean | undefined;
  required?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  className?: string | undefined;
  validationState?: InputValidationState;
  dataAttributes?: DataAttributes;
  dataset?: Record<string, string | number | boolean> | undefined;
  onChange?: (value: string, event: Event) => void;
  onBlur?: (value: string, event: Event) => void;
  readOnly?: boolean | undefined;
  min?: string | number | undefined;
  max?: string | number | undefined;
  step?: string | number | undefined;
  onInput?: ((event: Event) => void) | undefined;
  onFocus?: ((event: Event) => void) | undefined;
  onClick?: ((event: MouseEvent) => void) | undefined;
  onKeyUp?: ((event: KeyboardEvent) => void) | undefined;
  onSelect?: ((event: Event) => void) | undefined;
  onMouseEnter?: ((event: MouseEvent) => void) | undefined;
  onNativeChange?: ((event: Event) => void) | undefined;
  classSlots?: readonly string[] | undefined;
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
  input.className = (
    props.classSlots ?? [
      'input',
      INPUT_VARIANT_CLASS[props.variant ?? 'bordered'],
      INPUT_SIZE_CLASS[props.size ?? 'md'],
      INPUT_VALIDATION_CLASS[props.validationState ?? 'default'],
      props.className ?? ''
    ]
  )
    .filter(Boolean)
    .join(' ')
    .trim();
  input.disabled = Boolean(props.disabled);
  input.required = Boolean(props.required);
  input.readOnly = Boolean(props.readOnly);
  if (props.min !== undefined) input.min = String(props.min);
  if (props.max !== undefined) input.max = String(props.max);
  if (props.step !== undefined) input.step = String(props.step);

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

  for (const attributes of [props.dataAttributes, props.dataset]) {
    if (!attributes) continue;
    for (const [key, value] of Object.entries(attributes)) {
      input.dataset[key] = String(value);
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
  if (props.onInput) input.addEventListener('input', props.onInput);
  if (props.onFocus) input.addEventListener('focus', props.onFocus);
  if (props.onClick) input.addEventListener('click', props.onClick);
  if (props.onKeyUp) input.addEventListener('keyup', props.onKeyUp);
  if (props.onSelect) input.addEventListener('select', props.onSelect);
  if (props.onMouseEnter) input.addEventListener('mouseenter', props.onMouseEnter);
  if (props.onNativeChange) input.addEventListener('change', props.onNativeChange);

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
