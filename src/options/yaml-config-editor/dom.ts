type DatasetValue = string | number | boolean | null | undefined;

interface ElementOptions {
  className?: string;
  text?: string;
  dataset?: Record<string, DatasetValue>;
  disabled?: boolean;
  type?: string;
  value?: string;
  placeholder?: string;
}

function assignDataset(element: HTMLElement, dataset: Record<string, DatasetValue> = {}): void {
  Object.entries(dataset).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      element.dataset[key] = String(value);
    }
  });
}

export function clearElement<T extends HTMLElement>(element: T | null): T | null {
  element?.replaceChildren();
  return element;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  ...children: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.className) {
    element.className = options.className;
  }
  if (options.text !== undefined) {
    element.textContent = options.text;
  }
  if (options.disabled !== undefined && 'disabled' in element) {
    (element as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled =
      options.disabled;
  }
  if (options.type !== undefined && 'type' in element) {
    (element as HTMLButtonElement | HTMLInputElement).type = options.type;
  }
  if (options.value !== undefined && 'value' in element) {
    (element as HTMLInputElement | HTMLSelectElement).value = options.value;
  }
  if (options.placeholder !== undefined && 'placeholder' in element) {
    (element as HTMLInputElement).placeholder = options.placeholder;
  }
  assignDataset(element, options.dataset);
  children.forEach((child) => {
    if (child === null || child === undefined) {
      return;
    }
    element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return element;
}

export function button(options: {
  className: string;
  text: string;
  disabled?: boolean;
  onClick: (event: MouseEvent) => void;
}): HTMLButtonElement {
  const controlOptions: ElementOptions = {
    className: options.className,
    text: options.text,
    type: 'button'
  };
  if (options.disabled !== undefined) {
    controlOptions.disabled = options.disabled;
  }
  const control = el('button', controlOptions);
  control.addEventListener('click', options.onClick);
  return control;
}

export function textInput(options: {
  className: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  dataset?: Record<string, DatasetValue>;
  onInput: (value: string) => void;
}): HTMLInputElement {
  const inputOptions: ElementOptions = {
    className: options.className,
    value: options.value
  };
  if (options.disabled !== undefined) {
    inputOptions.disabled = options.disabled;
  }
  if (options.placeholder !== undefined) {
    inputOptions.placeholder = options.placeholder;
  }
  if (options.dataset !== undefined) {
    inputOptions.dataset = options.dataset;
  }
  const input = el('input', inputOptions);
  if (!options.disabled) {
    input.addEventListener('input', () => {
      options.onInput(input.value);
    });
  }
  return input;
}

export function selectInput<T extends string>(options: {
  className: string;
  value: T;
  disabled?: boolean;
  dataset?: Record<string, DatasetValue>;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}): HTMLSelectElement {
  const selectOptions: ElementOptions = {
    className: options.className
  };
  if (options.disabled !== undefined) {
    selectOptions.disabled = options.disabled;
  }
  if (options.dataset !== undefined) {
    selectOptions.dataset = options.dataset;
  }
  const select = el('select', selectOptions);
  options.options.forEach((item) => {
    const option = el('option', { value: item.value, text: item.label });
    option.value = item.value;
    select.append(option);
  });
  select.value = options.value;
  select.addEventListener('change', () => {
    options.onChange(select.value as T);
  });
  return select;
}
