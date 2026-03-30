import { applyValidationA11y } from '../../foundation/a11y';
import type { DataAttributes, InputValidationState } from '../../foundation/types';

export interface PrimitiveSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  dir?: 'ltr' | 'rtl' | 'auto';
  dataAttributes?: DataAttributes;
}

export interface PrimitiveSelectProps {
  id?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  value?: string;
  disabled?: boolean;
  className?: string;
  validationState?: InputValidationState;
  dataAttributes?: DataAttributes;
  options: PrimitiveSelectOption[];
  onChange?: (value: string, event: Event) => void;
}

export function createSelectElement(props: PrimitiveSelectProps): HTMLSelectElement {
  const select = document.createElement('select');
  const validationClass =
    props.validationState === 'success'
      ? 'select-success'
      : props.validationState === 'error'
        ? 'select-error'
        : '';
  select.className = [
    'select',
    'select-bordered',
    'w-full',
    'min-h-[40px]',
    'bg-base-100',
    'text-base-content',
    'transition-colors',
    'focus:outline-none',
    'focus:border-accent/60',
    'focus:ring-2',
    'focus:ring-accent/20',
    validationClass,
    props.className ?? ''
  ]
    .filter(Boolean)
    .join(' ');

  if (props.id) {
    select.id = props.id;
  }
  if (props.ariaLabel) {
    select.setAttribute('aria-label', props.ariaLabel);
  }
  applyValidationA11y(select, props.validationState ?? 'default', props.ariaDescribedBy);
  if (props.dataAttributes) {
    for (const [key, value] of Object.entries(props.dataAttributes)) {
      select.dataset[key] = value;
    }
  }
  select.disabled = Boolean(props.disabled);

  const fragment = document.createDocumentFragment();
  for (const optionConfig of props.options) {
    const option = document.createElement('option');
    option.value = optionConfig.value;
    option.textContent = optionConfig.label;
    option.disabled = Boolean(optionConfig.disabled);
    if (optionConfig.dir) {
      option.dir = optionConfig.dir;
    }
    if (optionConfig.dataAttributes) {
      for (const [key, value] of Object.entries(optionConfig.dataAttributes)) {
        option.dataset[key] = value;
      }
    }
    fragment.append(option);
  }
  select.append(fragment);

  if (typeof props.value === 'string') {
    select.value = props.value;
  }

  if (props.onChange) {
    select.addEventListener('change', (event) => {
      props.onChange?.((event.target as HTMLSelectElement).value, event);
    });
  }

  return select;
}

export class UiSelect {
  constructor(private readonly host: HTMLElement) {}

  render(props: PrimitiveSelectProps): HTMLSelectElement {
    const select = createSelectElement(props);
    this.host.replaceChildren(select);
    return select;
  }
}
