import type { CompleteOptions, FragmentClipperOptions, StoredOptions } from '@shared/types/options';

export interface FragmentSectionBindings {
  footnoteCheckbox: HTMLInputElement | null;
  captureContextCheckbox: HTMLInputElement | null;
  modifierToggle: HTMLInputElement | null;
  modifierKeyCheckboxes: HTMLInputElement[];
  keyboardShortcutsCheckbox: HTMLInputElement | null;
  contextLengthInput: HTMLInputElement | null;
  contextModeSelect: HTMLSelectElement | null;
}

export function normalizeFragmentContextLength(
  input: HTMLInputElement | null,
  fallback: number
): number {
  if (!input) {
    return fallback;
  }

  const parsed = Number.parseInt(input.value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    input.value = String(fallback);
    return fallback;
  }

  input.value = String(parsed);
  return parsed;
}

export function applyFragmentSectionSnapshot(params: {
  bindings: FragmentSectionBindings;
  options: StoredOptions;
  defaults: FragmentClipperOptions;
  contextModes: Array<FragmentClipperOptions['contextMode']>;
}): void {
  const { bindings, options, defaults, contextModes } = params;
  const fragment = options.fragmentClipper ?? ({} as FragmentClipperOptions);

  if (bindings.footnoteCheckbox) {
    bindings.footnoteCheckbox.checked = fragment.useFootnoteFormat ?? defaults.useFootnoteFormat;
  }
  if (bindings.captureContextCheckbox) {
    bindings.captureContextCheckbox.checked = fragment.captureContext ?? defaults.captureContext;
  }
  if (bindings.keyboardShortcutsCheckbox) {
    bindings.keyboardShortcutsCheckbox.checked =
      fragment.keyboardShortcutsEnabled ?? defaults.keyboardShortcutsEnabled;
  }
  if (bindings.modifierToggle) {
    bindings.modifierToggle.checked =
      fragment.selectionModifierEnabled ?? defaults.selectionModifierEnabled;
  }
  if (bindings.contextLengthInput) {
    const nextLength =
      typeof fragment.contextLength === 'number' && fragment.contextLength > 0
        ? fragment.contextLength
        : (defaults.contextLength ?? 200);
    bindings.contextLengthInput.value = String(nextLength);
  }
  if (bindings.contextModeSelect) {
    const mode = fragment.contextMode ?? defaults.contextMode ?? 'chars';
    bindings.contextModeSelect.value = contextModes.includes(mode) ? mode : 'chars';
  }

  const configuredKeys = Array.isArray(fragment.selectionModifierKeys)
    ? fragment.selectionModifierKeys
    : defaults.selectionModifierKeys;
  bindings.modifierKeyCheckboxes.forEach((checkbox) => {
    const key = checkbox.dataset.fragmentModifierKey as
      | FragmentClipperOptions['selectionModifierKeys'][number]
      | undefined;
    checkbox.checked = key ? configuredKeys.includes(key) : false;
  });
}

export function collectFragmentSectionChanges(params: {
  bindings: FragmentSectionBindings;
  previous: StoredOptions | null;
  defaults: FragmentClipperOptions;
  contextModes: Array<FragmentClipperOptions['contextMode']>;
  modifierKeys: Array<FragmentClipperOptions['selectionModifierKeys'][number]>;
}): Partial<CompleteOptions> {
  const { bindings, previous, defaults, contextModes, modifierKeys } = params;
  const previousFragment = previous?.fragmentClipper;
  const resolvedContextLength = normalizeFragmentContextLength(
    bindings.contextLengthInput,
    previousFragment?.contextLength ?? defaults.contextLength ?? 200
  );
  const modeValue =
    bindings.contextModeSelect?.value ??
    previousFragment?.contextMode ??
    defaults.contextMode ??
    'chars';
  const resolvedContextMode: FragmentClipperOptions['contextMode'] = contextModes.includes(
    modeValue as FragmentClipperOptions['contextMode']
  )
    ? (modeValue as FragmentClipperOptions['contextMode'])
    : 'chars';
  const selectionKeys = bindings.modifierKeyCheckboxes
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.dataset.fragmentModifierKey)
    .filter((key): key is FragmentClipperOptions['selectionModifierKeys'][number] => {
      return (
        Boolean(key) &&
        modifierKeys.includes(key as FragmentClipperOptions['selectionModifierKeys'][number])
      );
    });

  return {
    fragmentClipper: {
      useFootnoteFormat:
        bindings.footnoteCheckbox?.checked ?? previousFragment?.useFootnoteFormat ?? true,
      captureContext:
        bindings.captureContextCheckbox?.checked ?? previousFragment?.captureContext ?? false,
      contextLength: resolvedContextLength,
      contextMode: resolvedContextMode,
      selectionModifierEnabled:
        bindings.modifierToggle?.checked ?? previousFragment?.selectionModifierEnabled ?? false,
      selectionModifierKeys: [...selectionKeys],
      keyboardShortcutsEnabled:
        bindings.keyboardShortcutsCheckbox?.checked ??
        previousFragment?.keyboardShortcutsEnabled ??
        true
    }
  };
}
