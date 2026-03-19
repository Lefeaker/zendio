import { BaseComponent } from './BaseComponent';

export interface CheckboxProps {
  id?: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onChange?: (checked: boolean, event: Event) => void;
}

/**
 * Minimal DaisyUI checkbox wrapper for labeled boolean settings.
 */
export class DaisyCheckbox extends BaseComponent<CheckboxProps> {
  render(props: CheckboxProps): HTMLInputElement {
    this.assertActive();

    const label = this.createElement(
      'label',
      ['inline-flex', 'items-center', 'gap-2', 'text-sm', 'text-base-content', 'cursor-pointer'].join(' ')
    );

    const input = this.createElement('input');
    input.type = 'checkbox';
    input.className = 'checkbox checkbox-accent w-[18px] h-[18px]';
    input.checked = Boolean(props.checked);
    input.disabled = Boolean(props.disabled);

    if (props.id) {
      input.id = props.id;
    }

    if (props.ariaLabel) {
      input.setAttribute('aria-label', props.ariaLabel);
    }

    if (props.onChange) {
      input.addEventListener('change', (event) => {
        props.onChange?.((event.target as HTMLInputElement).checked, event);
      });
    }

    const text = this.createElement('span');
    text.textContent = props.label;

    label.append(input, text);
    this.container.replaceChildren(label);
    return input;
  }
}
