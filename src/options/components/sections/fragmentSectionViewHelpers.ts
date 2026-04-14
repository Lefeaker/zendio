import { getKeyboardModifierLabel } from '@ui/foundation/keyboard';
import type { FragmentClipperOptions } from '@shared/types/options';
import type { FragmentSectionLayoutRefs } from './fragmentSectionLayout';

export function createEmptyFragmentLayoutRefs(): FragmentSectionLayoutRefs {
  return {
    footnoteCheckbox: null,
    captureContextCheckbox: null,
    modifierToggle: null,
    modifierKeysGroup: null,
    modifierKeyCheckboxes: [],
    keyboardShortcutsCheckbox: null,
    contextLengthGroup: null,
    contextModeGroup: null,
    contextLengthInput: null,
    contextModeSelect: null
  };
}

export function resolveFragmentModifierLabel(args: {
  key: FragmentClipperOptions['selectionModifierKeys'][number];
  messages: Record<string, string | undefined> | null | undefined;
}): string {
  const { key, messages } = args;
  switch (key) {
    case 'alt':
      return messages?.fragmentModifierKeyAlt ?? getKeyboardModifierLabel('alt');
    case 'meta':
      return messages?.fragmentModifierKeyMeta ?? getKeyboardModifierLabel('meta');
    case 'ctrl':
      return messages?.fragmentModifierKeyCtrl ?? getKeyboardModifierLabel('ctrl');
    case 'shift':
      return messages?.fragmentModifierKeyShift ?? getKeyboardModifierLabel('shift');
    default:
      return key;
  }
}
