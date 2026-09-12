import type { DataAttributes } from '../../foundation/types';

export interface TextareaProps {
  id?: string;
  value?: string | undefined;
  rows?: number;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  ariaLabel?: string;
  className?: string | undefined;
  dataAttributes?: DataAttributes;
  dataset?: Record<string, string | number | boolean> | undefined;
  onChange?: (value: string, event: Event) => void;
  onBlur?: (value: string, event: Event) => void;
  readOnly?: boolean | undefined;
  onInput?: ((event: Event) => void) | undefined;
  onFocus?: ((event: Event) => void) | undefined;
  onNativeChange?: ((event: Event) => void) | undefined;
  classSlots?: readonly string[] | undefined;
}

export function createTextareaElement(props: TextareaProps): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.className = (
    props.classSlots ?? [
      'textarea',
      'textarea-bordered',
      'w-full',
      'min-h-[80px]',
      'text-sm',
      'leading-relaxed',
      props.className ?? ''
    ]
  )
    .filter(Boolean)
    .join(' ');

  if (props.id) {
    textarea.id = props.id;
  }
  if (typeof props.rows === 'number') {
    textarea.rows = props.rows;
  }
  if (typeof props.value === 'string') {
    textarea.value = props.value;
  }
  if (typeof props.placeholder === 'string') {
    textarea.placeholder = props.placeholder;
  }
  textarea.disabled = Boolean(props.disabled);
  textarea.readOnly = Boolean(props.readOnly);
  if (props.ariaLabel) {
    textarea.setAttribute('aria-label', props.ariaLabel);
  }
  for (const attributes of [props.dataAttributes, props.dataset]) {
    if (!attributes) continue;
    for (const [key, value] of Object.entries(attributes)) {
      textarea.dataset[key] = String(value);
    }
  }
  if (props.onChange) {
    textarea.addEventListener('input', (event) => {
      props.onChange?.((event.target as HTMLTextAreaElement).value, event);
    });
  }
  if (props.onBlur) {
    textarea.addEventListener('blur', (event) => {
      props.onBlur?.((event.target as HTMLTextAreaElement).value, event);
    });
  }
  if (props.onInput) textarea.addEventListener('input', props.onInput);
  if (props.onFocus) textarea.addEventListener('focus', props.onFocus);
  if (props.onNativeChange) textarea.addEventListener('change', props.onNativeChange);
  return textarea;
}

export class UiTextarea {
  constructor(private readonly host: HTMLElement) {}

  render(props: TextareaProps): HTMLTextAreaElement {
    const textarea = createTextareaElement(props);
    this.host.replaceChildren(textarea);
    return textarea;
  }
}
