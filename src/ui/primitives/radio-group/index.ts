import { BaseComponent } from '../../foundation/lifecycle/BaseComponent';

export interface DaisyRadioOption {
  value: string;
  label: string;
  srLabel?: string;
  swatchClassName?: string;
}

export interface DaisyRadioGroupProps {
  id?: string;
  value: string;
  ariaLabelledBy?: string;
  options: DaisyRadioOption[];
  onChange?: (value: string, event: Event) => void;
}

/**
 * Button-based radio group retained as a UI primitive after old shared entry removal.
 */
export class DaisyRadioGroup extends BaseComponent<DaisyRadioGroupProps> {
  render(props: DaisyRadioGroupProps): HTMLDivElement {
    this.assertActive();

    const group = this.createElement('div', 'flex flex-wrap gap-2');
    group.setAttribute('role', 'radiogroup');
    if (props.id) {
      group.id = props.id;
    }
    if (props.ariaLabelledBy) {
      group.setAttribute('aria-labelledby', props.ariaLabelledBy);
    }
    group.dataset.selectedTheme = props.value;

    for (const [index, option] of props.options.entries()) {
      const button = this.createElement(
        'button',
        'btn w-8 h-8 rounded-full border border-base-300 p-0 cursor-pointer transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 relative overflow-hidden'
      );
      button.type = 'button';
      button.dataset.theme = option.value;
      button.setAttribute('role', 'radio');

      const isSelected = option.value === props.value;
      button.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      button.tabIndex = isSelected ? 0 : index === 0 ? 0 : -1;

      if (isSelected) {
        button.classList.add('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-surface-0');
      }

      const swatch = this.createElement(
        'span',
        `block w-full h-full rounded-full ${option.swatchClassName ?? ''}`.trim()
      );
      const text = this.createElement('span', 'sr-only');
      text.textContent = option.srLabel ?? option.label;
      button.append(swatch, text);

      if (props.onChange) {
        button.addEventListener('click', (event) => {
          props.onChange?.(option.value, event);
        });
      }

      group.append(button);
    }

    this.container.replaceChildren(group);
    return group;
  }
}
