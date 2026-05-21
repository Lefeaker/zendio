export function bindYamlClick(element: HTMLElement, handler: () => void): void {
  element.addEventListener('click', handler);
}

export function bindYamlToggle(
  element: HTMLDetailsElement,
  handler: (open: boolean) => void
): void {
  element.addEventListener('toggle', () => handler(element.open));
}

export function bindYamlInputValue(
  input: HTMLInputElement,
  handler: (value: string) => void
): void {
  input.addEventListener('input', (event) => {
    handler((event.target as HTMLInputElement).value);
  });
}

export function bindYamlInputBlur(
  input: HTMLInputElement,
  handler: (value: string, target: HTMLInputElement) => void
): void {
  input.addEventListener('blur', (event) => {
    const target = event.target as HTMLInputElement;
    handler(target.value, target);
  });
}

export function bindYamlSelectValue<T extends string>(
  select: HTMLSelectElement,
  handler: (value: T) => void
): void {
  select.addEventListener('change', (event) => {
    handler((event.target as HTMLSelectElement).value as T);
  });
}

export function bindYamlCheckboxValue(
  input: HTMLInputElement,
  handler: (checked: boolean) => void
): void {
  input.addEventListener('change', (event) => {
    handler((event.target as HTMLInputElement).checked);
  });
}
