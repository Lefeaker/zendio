import type { FragmentClipperOptions } from '@shared/types/options';

export interface FragmentSectionMessagesLike {
  fragmentConfigTitle?: string;
  fragmentConfigHint?: string;
  fragmentUseFootnoteLabel?: string;
  fragmentUseFootnoteHint?: string;
  captureContextLabel?: string;
  fragmentCaptureContextHint?: string;
  fragmentModifierToggleLabel?: string;
  fragmentModifierToggleDescription?: string;
  fragmentModifierKeysLabel?: string;
  fragmentModifierKeysDescription?: string;
  fragmentContextLengthLabel?: string;
  fragmentContextLengthHint?: string;
  fragmentContextModeLabel?: string;
  fragmentContextModeHint?: string;
  fragmentContextModeSentences?: string;
  fragmentContextModeChars?: string;
  fragmentKeyboardShortcutsLabel?: string;
  fragmentKeyboardShortcutsHint?: string;
  fragmentFootnoteExampleTitle?: string;
  fragmentFootnoteExampleContent?: string;
  fragmentFootnoteExampleComment?: string;
  fragmentContextHighlightExampleTitle?: string;
  fragmentContextHighlightExampleContent?: string;
}

export interface FragmentSectionLayoutRefs {
  footnoteCheckbox: HTMLInputElement | null;
  captureContextCheckbox: HTMLInputElement | null;
  modifierToggle: HTMLInputElement | null;
  modifierKeysGroup: HTMLElement | null;
  modifierKeyCheckboxes: HTMLInputElement[];
  keyboardShortcutsCheckbox: HTMLInputElement | null;
  contextLengthGroup: HTMLElement | null;
  contextModeGroup: HTMLElement | null;
  contextLengthInput: HTMLInputElement | null;
  contextModeSelect: HTMLSelectElement | null;
}

export interface FragmentLayoutBuilderParams {
  createElement: (tag: keyof HTMLElementTagNameMap, className?: string) => HTMLElement;
  messages: FragmentSectionMessagesLike | null;
  defaults: FragmentClipperOptions;
  modifierKeys: Array<FragmentClipperOptions['selectionModifierKeys'][number]>;
  contextModes: Array<FragmentClipperOptions['contextMode']>;
  resolveModifierLabel: (key: FragmentClipperOptions['selectionModifierKeys'][number]) => string;
  refs: FragmentSectionLayoutRefs;
}
