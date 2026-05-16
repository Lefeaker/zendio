import type { Messages } from '@i18n';

export function getMessage(
  messages: Messages | null,
  key: keyof Messages,
  fallback: string
): string {
  const value = messages?.[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export function setButtonBusy(button: HTMLButtonElement | null, busy: boolean): void {
  if (!button) {
    return;
  }
  button.disabled = busy;
  if (busy) {
    button.setAttribute('aria-busy', 'true');
  } else {
    button.removeAttribute('aria-busy');
  }
}
