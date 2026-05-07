import type { FragmentClipperOptions } from '@shared/types/options';
import type { FragmentSectionLayoutRefs } from './fragmentSectionLayout';

export interface EventBinding {
  target: EventTarget;
  type: string;
  handler: EventListener;
}

export function createFragmentSectionBindings(refs: FragmentSectionLayoutRefs) {
  return {
    footnoteCheckbox: refs.footnoteCheckbox,
    captureContextCheckbox: refs.captureContextCheckbox,
    modifierToggle: refs.modifierToggle,
    modifierKeyCheckboxes: refs.modifierKeyCheckboxes,
    keyboardShortcutsCheckbox: refs.keyboardShortcutsCheckbox,
    contextLengthInput: refs.contextLengthInput,
    contextModeSelect: refs.contextModeSelect
  };
}

export function bindFragmentSectionEvents(options: {
  refs: FragmentSectionLayoutRefs;
  onValueChanged: EventListener;
  onCaptureContextChange: EventListener;
  onModifierToggleChange: EventListener;
  onContextLengthChange: EventListener;
  onContextLengthBlur: EventListener;
}): EventBinding[] {
  const bindings: EventBinding[] = [];
  const bind = (target: EventTarget | null | undefined, type: string, handler: EventListener) => {
    if (!target) {
      return;
    }
    target.addEventListener(type, handler);
    bindings.push({ target, type, handler });
  };

  bind(options.refs.footnoteCheckbox, 'change', options.onValueChanged);
  bind(options.refs.captureContextCheckbox, 'change', options.onCaptureContextChange);
  bind(options.refs.modifierToggle, 'change', options.onModifierToggleChange);
  options.refs.modifierKeyCheckboxes.forEach((checkbox) => {
    bind(checkbox, 'change', options.onValueChanged);
  });
  bind(options.refs.keyboardShortcutsCheckbox, 'change', options.onValueChanged);
  bind(options.refs.contextLengthInput, 'change', options.onContextLengthChange);
  bind(options.refs.contextLengthInput, 'blur', options.onContextLengthBlur);
  bind(options.refs.contextModeSelect, 'change', options.onValueChanged);

  return bindings;
}
