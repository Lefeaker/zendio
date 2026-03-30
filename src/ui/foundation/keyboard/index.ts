export type KeyboardModifierKey = 'alt' | 'meta' | 'ctrl' | 'shift';

const DEFAULT_LABELS: Record<KeyboardModifierKey, string> = {
  alt: 'Option / Alt',
  meta: 'Command',
  ctrl: 'Control',
  shift: 'Shift'
};

export function getKeyboardModifierLabel(key: KeyboardModifierKey): string {
  return DEFAULT_LABELS[key];
}

export function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

export function matchesModifierCombo(
  event: Pick<KeyboardEvent, 'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey'>,
  keys: KeyboardModifierKey[]
): boolean {
  return keys.every((key) => {
    switch (key) {
      case 'alt':
        return event.altKey;
      case 'meta':
        return event.metaKey;
      case 'ctrl':
        return event.ctrlKey;
      case 'shift':
        return event.shiftKey;
      default:
        return false;
    }
  });
}
