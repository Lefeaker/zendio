import type { FragmentClipperOptions } from '@shared/types/options';
import {
  buildCheckboxSetting,
  buildContextLengthSetting,
  buildContextModeSetting,
  buildExamplesSetting,
  buildModifierKeysSetting,
  buildModifierToggleSetting,
  type FragmentLayoutBuilderParams
} from './fragmentSectionLayoutBuilders';

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

export interface BuildBodyParams {
  createElement: (tag: keyof HTMLElementTagNameMap, className?: string) => HTMLElement;
  createSectionBody: () => HTMLElement;
  createSectionSettings: () => HTMLElement;
  messages: FragmentSectionMessagesLike | null;
  defaults: FragmentClipperOptions;
  modifierKeys: Array<FragmentClipperOptions['selectionModifierKeys'][number]>;
  contextModes: Array<FragmentClipperOptions['contextMode']>;
  resolveModifierLabel: (
    key: FragmentClipperOptions['selectionModifierKeys'][number]
  ) => string;
}

export function buildFragmentSectionBody(
  params: BuildBodyParams
): { body: HTMLElement; refs: FragmentSectionLayoutRefs } {
  const { createSectionBody, createSectionSettings } = params;
  const refs: FragmentSectionLayoutRefs = {
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

  const wrapper = createSectionBody();
  const settings = createSectionSettings();
  const builderParams: FragmentLayoutBuilderParams = { ...params, refs };
  settings.append(
    buildCheckboxSetting(builderParams, 'fragmentUseFootnote', 'footnoteCheckbox', {
      label: params.messages?.fragmentUseFootnoteLabel ?? '使用脚注格式（推荐）',
      hint:
        params.messages?.fragmentUseFootnoteHint ??
        '启用后，评论将以 Obsidian 脚注格式保存，兼容 Sidebar Highlights 插件。'
    }),
    buildCheckboxSetting(builderParams, 'fragmentCaptureContext', 'captureContextCheckbox', {
      label: params.messages?.captureContextLabel ?? '捕捉上下文（该功能尚不稳定）',
      hint:
        params.messages?.fragmentCaptureContextHint ??
        '启用后，会捕捉选中文字周围的上下文，并用 ==高亮== 标记实际选中的部分。'
    }),
    buildModifierToggleSetting(builderParams),
    buildModifierKeysSetting(builderParams),
    buildContextLengthSetting(builderParams),
    buildContextModeSetting(builderParams),
    buildCheckboxSetting(
      builderParams,
      'fragmentKeyboardShortcutsEnabled',
      'keyboardShortcutsCheckbox',
      {
        label: params.messages?.fragmentKeyboardShortcutsLabel ?? '启用剪藏对话框快捷键',
        hint:
          params.messages?.fragmentKeyboardShortcutsHint ??
          '在剪藏对话框中：双击回车进入阅读模式，Cmd+回车（Mac）或 Alt+回车（Windows）直接剪藏。'
      }
    ),
    buildExamplesSetting(params.createElement, params.messages)
  );

  wrapper.append(settings);
  return { body: wrapper, refs };
}

export function updateModifierGroupVisibility(
  refs: FragmentSectionLayoutRefs,
  enabled: boolean
): void {
  if (refs.modifierKeysGroup) {
    refs.modifierKeysGroup.style.display = enabled ? 'grid' : 'none';
  }
}

export function updateContextControlsVisibility(
  refs: FragmentSectionLayoutRefs,
  enabled: boolean
): void {
  const displayValue = enabled ? 'grid' : 'none';
  if (refs.contextLengthGroup) {
    refs.contextLengthGroup.style.display = displayValue;
  }
  if (refs.contextModeGroup) {
    refs.contextModeGroup.style.display = displayValue;
  }
  if (refs.contextLengthInput) {
    refs.contextLengthInput.disabled = !enabled;
  }
  if (refs.contextModeSelect) {
    refs.contextModeSelect.disabled = !enabled;
  }
}

export function highlightFragmentShortcutControl(
  refs: FragmentSectionLayoutRefs,
  setCleanup: (cleanup: (() => void) | null) => void
): boolean {
  const checkbox = refs.keyboardShortcutsCheckbox;
  const target = checkbox?.closest<HTMLElement>('.grid') ?? checkbox?.closest<HTMLElement>('label') ?? checkbox ?? null;
  if (!target) {
    return false;
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const originalStyle = target.getAttribute('style') ?? '';
  target.style.cssText += `
    background-color: rgba(139, 92, 246, 0.1) !important;
    border: 2px solid rgba(139, 92, 246, 0.3) !important;
    border-radius: 4px !important;
    transition: all 0.3s ease !important;
  `;

  const timer = window.setTimeout(() => {
    target.setAttribute('style', originalStyle);
    setCleanup(null);
  }, 3000);

  setCleanup(() => {
    window.clearTimeout(timer);
    target.setAttribute('style', originalStyle);
    setCleanup(null);
  });

  return true;
}
