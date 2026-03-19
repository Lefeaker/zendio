import { BaseComponent } from './BaseComponent';

export interface DaisySelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  dir?: 'ltr' | 'rtl' | 'auto';
  dataAttributes?: Record<string, string>;
}

export interface DaisySelectProps {
  id?: string;
  ariaLabel?: string;
  value?: string;
  disabled?: boolean;
  options: DaisySelectOption[];
  onChange?: (value: string, event: Event) => void;
}

/**
 * Minimal DaisyUI-styled native select wrapper.
 */
export class DaisySelect extends BaseComponent<DaisySelectProps> {
  render(props: DaisySelectProps): HTMLSelectElement {
    this.assertActive();

    const select = this.createElement(
      'select',
      'select select-bordered w-full min-h-[40px] bg-base-100 text-base-content transition-colors focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20'
    );

    if (props.id) {
      select.id = props.id;
    }
    if (props.ariaLabel) {
      select.setAttribute('aria-label', props.ariaLabel);
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

    this.container.replaceChildren(select);
    return select;
  }
}
