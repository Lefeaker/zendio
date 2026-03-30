export interface FormFieldPatternOptions {
  label?: string;
  control: HTMLElement;
  hint?: string;
  error?: string;
  className?: string;
}

export function createFormFieldPattern(options: FormFieldPatternOptions): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = ['grid gap-2', options.className ?? ''].filter(Boolean).join(' ');

  if (options.label) {
    const label = document.createElement('label');
    label.className = 'text-sm font-medium text-base-content';
    label.textContent = options.label;
    wrapper.append(label);
  }

  wrapper.append(options.control);

  if (options.error) {
    const error = document.createElement('p');
    error.className = 'text-xs text-error';
    error.textContent = options.error;
    wrapper.append(error);
  } else if (options.hint) {
    const hint = document.createElement('p');
    hint.className = 'text-xs text-base-content/60';
    hint.textContent = options.hint;
    wrapper.append(hint);
  }

  return wrapper;
}
