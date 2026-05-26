export function el<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: {
    className?: string;
    text?: string;
    dataset?: Record<string, string | undefined>;
  } = {}
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (options.className !== undefined) {
    element.className = options.className;
  }
  if (options.text !== undefined) {
    element.textContent = options.text;
  }
  if (options.dataset) {
    Object.entries(options.dataset).forEach(([key, value]) => {
      if (value !== undefined) {
        element.dataset[key] = value;
      }
    });
  }
  return element;
}

export function button(options: {
  className: string;
  text: string;
  disabled?: boolean;
  onClick: (event: MouseEvent) => void;
}): HTMLButtonElement {
  const element = el('button', { className: options.className, text: options.text });
  element.type = 'button';
  element.disabled = options.disabled ?? false;
  element.addEventListener('click', options.onClick);
  return element;
}

export function textInput(options: {
  className: string;
  value: string;
  dataset: Record<string, string | undefined>;
  placeholder?: string;
  onInput: (value: string) => void;
}): HTMLInputElement {
  const input = el('input', { className: options.className, dataset: options.dataset });
  input.value = options.value;
  if (options.placeholder !== undefined) {
    input.placeholder = options.placeholder;
  }
  input.addEventListener('input', () => {
    options.onInput(input.value);
  });
  return input;
}

export function selectInput<T extends string>(options: {
  className: string;
  value: T;
  disabled?: boolean;
  options: Array<{ value: T; label: string }>;
  dataset?: Record<string, string | undefined>;
  onChange: (value: T) => void;
}): HTMLSelectElement {
  const select =
    options.dataset === undefined
      ? el('select', { className: options.className })
      : el('select', { className: options.className, dataset: options.dataset });
  select.disabled = options.disabled ?? false;
  options.options.forEach((item) => {
    const option = el('option', { text: item.label });
    option.value = item.value;
    option.selected = options.value === item.value;
    select.append(option);
  });
  select.addEventListener('change', () => {
    const selected = options.options.find((item) => item.value === select.value)?.value;
    options.onChange(selected ?? options.value);
  });
  return select;
}
