export interface ToggleProps {
  id?: string;
  checked?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  onChange?: (checked: boolean, event: Event) => void;
}

export function createToggleElement(props: ToggleProps): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = ['toggle', 'toggle-primary', props.className ?? ''].filter(Boolean).join(' ');
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
  return input;
}

export class UiToggle {
  constructor(private readonly host: HTMLElement) {}

  render(props: ToggleProps): HTMLInputElement {
    const input = createToggleElement(props);
    this.host.replaceChildren(input);
    return input;
  }
}
