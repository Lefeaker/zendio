import type { DataAttributes } from '../../foundation/types';

export interface TextareaProps {
  id?: string;
  value?: string;
  rows?: number;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  dataAttributes?: DataAttributes;
  onChange?: (value: string, event: Event) => void;
  onBlur?: (value: string, event: Event) => void;
}

export function createTextareaElement(props: TextareaProps): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.className = [
    'textarea',
    'textarea-bordered',
    'w-full',
    'min-h-[80px]',
    'text-sm',
    'leading-relaxed',
    props.className ?? ''
  ]
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
  if (props.ariaLabel) {
    textarea.setAttribute('aria-label', props.ariaLabel);
  }
  if (props.dataAttributes) {
    for (const [key, value] of Object.entries(props.dataAttributes)) {
      textarea.dataset[key] = value;
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
