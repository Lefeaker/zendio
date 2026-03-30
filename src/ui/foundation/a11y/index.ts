export { FocusTrapController, type FocusTrapOptions } from '@content/shared/focusTrap';
export type { InputValidationState } from '../types';

export function applyValidationA11y(
  element: HTMLElement,
  validationState: 'default' | 'success' | 'error' = 'default',
  describedBy?: string
): void {
  if (describedBy) {
    element.setAttribute('aria-describedby', describedBy);
  }

  if (validationState === 'error') {
    element.setAttribute('aria-invalid', 'true');
    return;
  }

  element.removeAttribute('aria-invalid');
}

export function applyButtonBusyState(
  element: HTMLButtonElement,
  options: { disabled?: boolean; loading?: boolean }
): void {
  const disabled = Boolean(options.disabled || options.loading);
  element.disabled = disabled;

  if (disabled) {
    element.setAttribute('aria-disabled', 'true');
  } else {
    element.removeAttribute('aria-disabled');
  }

  if (options.loading) {
    element.classList.add('loading');
    element.setAttribute('aria-busy', 'true');
  } else {
    element.classList.remove('loading');
    element.removeAttribute('aria-busy');
  }
}
