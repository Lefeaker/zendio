import { BaseComponent } from './BaseComponent';

export type InputType = 'text' | 'password' | 'number' | 'email' | 'url';
export type InputSize = 'sm' | 'md' | 'lg';
export type InputVariant = 'normal' | 'bordered' | 'ghost';

export interface InputProps {
  type?: InputType;
  size?: InputSize;
  variant?: InputVariant;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  onChange?: (value: string, event: Event) => void;
  onBlur?: (value: string, event: Event) => void;
}

const INPUT_VARIANT_CLASS: Record<InputVariant, string> = {
  normal: '', // DaisyUI 基础样式，无需额外类名
  bordered: 'input-bordered',
  ghost: 'input-ghost'
};

const INPUT_SIZE_CLASS: Record<InputSize, string> = {
  sm: 'input-sm',
  md: '',
  lg: 'input-lg'
};

/**
 * DaisyUI input wrapper with size/variant presets and change hooks.
 */
export class DaisyInput extends BaseComponent<InputProps> {
  render(props: InputProps): HTMLInputElement {
    this.assertActive();

    const input = this.createElement('input');
    input.type = props.type ?? 'text';
    input.className = this.composeClassNames(props);
    input.disabled = Boolean(props.disabled);
    input.required = Boolean(props.required);

    if (typeof props.placeholder === 'string') {
      input.placeholder = props.placeholder;
    }

    if (typeof props.value !== 'undefined') {
      input.value = props.value;
    }

    if (props.ariaLabel) {
      input.setAttribute('aria-label', props.ariaLabel);
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

    this.container.replaceChildren(input);
    return input;
  }

  private composeClassNames(props: InputProps): string {
    const variant = props.variant ?? 'bordered';
    const size = props.size ?? 'md';
    const classes = ['input', INPUT_VARIANT_CLASS[variant], INPUT_SIZE_CLASS[size]];
    return classes.filter(Boolean).join(' ').trim();
  }
}
