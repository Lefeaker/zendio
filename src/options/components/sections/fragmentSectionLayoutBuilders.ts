import type { FragmentClipperOptions } from '@shared/types/options';
import { UiInput as DaisyInput } from '@ui/primitives/input';
import { UiCheckbox as DaisyCheckbox } from '@ui/primitives/checkbox';
import { UiSelect as DaisySelect } from '@ui/primitives/select';
import type {
  FragmentSectionLayoutRefs,
  FragmentSectionMessagesLike
} from './fragmentSectionLayout';

export interface FragmentLayoutBuilderParams {
  createElement: (tag: keyof HTMLElementTagNameMap, className?: string) => HTMLElement;
  messages: FragmentSectionMessagesLike | null;
  defaults: FragmentClipperOptions;
  modifierKeys: Array<FragmentClipperOptions['selectionModifierKeys'][number]>;
  contextModes: Array<FragmentClipperOptions['contextMode']>;
  resolveModifierLabel: (
    key: FragmentClipperOptions['selectionModifierKeys'][number]
  ) => string;
  refs: FragmentSectionLayoutRefs;
}

export function buildCheckboxSetting(
  params: FragmentLayoutBuilderParams,
  inputId: string,
  refKey:
    | 'footnoteCheckbox'
    | 'captureContextCheckbox'
    | 'keyboardShortcutsCheckbox',
  copy: { label: string; hint: string }
): HTMLElement {
  const { createElement, refs } = params;
  const setting = createElement(
    'div',
    'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0'
  );
  const control = createElement('div', 'flex flex-wrap justify-start gap-2');
  const checkboxHost = createElement('div');
  const input = new DaisyCheckbox(checkboxHost).render({ id: inputId, label: copy.label });
  control.append(checkboxHost);
  const hint = createElement('div', 'w-full text-xs text-base-content/60 mt-1');
  hint.textContent = copy.hint;
  setting.append(control, hint);
  refs[refKey] = input;
  return setting;
}

export function buildModifierToggleSetting(params: FragmentLayoutBuilderParams): HTMLElement {
  const { createElement, messages, refs } = params;
  const setting = createElement(
    'div',
    'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0'
  );
  const control = createElement('div', 'flex flex-wrap justify-start gap-2');
  const checkboxHost = createElement('div');
  const input = new DaisyCheckbox(checkboxHost).render({
    id: 'fragmentModifierToggle',
    label: messages?.fragmentModifierToggleLabel ?? '启用辅助键触发剪藏/阅读操作'
  });
  control.append(checkboxHost);
  const hint = createElement('div', 'w-full text-xs text-base-content/60 mt-1');
  hint.textContent =
    messages?.fragmentModifierToggleDescription ??
    '按住所选的辅助键并拖动鼠标选择文本时，将自动打开剪藏窗口或添加阅读模式高亮。';
  setting.append(control, hint);
  refs.modifierToggle = input;
  return setting;
}

export function buildModifierKeysSetting(params: FragmentLayoutBuilderParams): HTMLElement {
  const { createElement, messages, modifierKeys, resolveModifierLabel, refs } = params;
  const setting = createElement(
    'div',
    'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0'
  );
  setting.id = 'fragmentModifierKeysGroup';
  setting.style.display = 'none';
  refs.modifierKeysGroup = setting;

  const label = createElement('div', 'text-sm text-base-content/60 font-semibold');
  label.textContent = messages?.fragmentModifierKeysLabel ?? '辅助键设置';

  const control = createElement('div', 'flex flex-wrap gap-2');
  modifierKeys.forEach((key) => {
    const toggleHost = createElement('div');
    const checkbox = new DaisyCheckbox(toggleHost).render({ label: resolveModifierLabel(key) });
    checkbox.setAttribute('data-fragment-modifier-key', key);
    control.append(toggleHost);
    refs.modifierKeyCheckboxes.push(checkbox);
  });

  const hint = createElement('div', 'w-full text-xs text-base-content/60 mt-1');
  hint.textContent =
    messages?.fragmentModifierKeysDescription ??
    '同时按下所有选中的辅助键才会触发自动剪藏或阅读高亮。';

  setting.append(label, control, hint);
  return setting;
}

export function buildContextLengthSetting(params: FragmentLayoutBuilderParams): HTMLElement {
  const { createElement, messages, defaults, refs } = params;
  const setting = createElement(
    'div',
    'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0'
  );
  setting.id = 'fragmentContextLengthGroup';
  setting.style.display = 'none';
  refs.contextLengthGroup = setting;

  const label = createElement('label', 'text-sm text-base-content/60 font-semibold');
  label.setAttribute('for', 'fragmentContextLength');
  label.textContent = messages?.fragmentContextLengthLabel ?? '上下文长度';

  const field = createElement('div', 'flex flex-wrap justify-start gap-2');
  const inputHost = createElement('div', 'w-full');
  const input = new DaisyInput(inputHost).render({
    type: 'number',
    variant: 'bordered',
    size: 'md',
    value: String(defaults.contextLength ?? 200),
    disabled: true
  });
  input.id = 'fragmentContextLength';
  input.min = '1';
  input.step = '1';
  refs.contextLengthInput = input;
  field.append(inputHost);

  const hint = createElement('div', 'w-full text-xs text-base-content/60 mt-1');
  hint.textContent =
    messages?.fragmentContextLengthHint ?? '控制上下文捕捉的最大长度；建议在 50~1000 之间。';

  setting.append(label, field, hint);
  return setting;
}

export function buildContextModeSetting(params: FragmentLayoutBuilderParams): HTMLElement {
  const { createElement, messages, defaults, contextModes, refs } = params;
  const setting = createElement(
    'div',
    'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0'
  );
  setting.id = 'fragmentContextModeGroup';
  setting.style.display = 'none';
  refs.contextModeGroup = setting;

  const label = createElement('label', 'text-sm text-base-content/60 font-semibold');
  label.setAttribute('for', 'fragmentContextMode');
  label.textContent = messages?.fragmentContextModeLabel ?? '上下文单位';

  const selectWrapper = createElement('div', 'flex flex-wrap justify-start gap-2 w-full');
  const selectHost = createElement('div', 'w-full');
  const select = new DaisySelect(selectHost).render({
    id: 'fragmentContextMode',
    value: defaults.contextMode ?? 'chars',
    disabled: true,
    className: 'min-h-[36px]',
    options: contextModes.map((mode) => ({
      value: mode,
      label:
        mode === 'sentences'
          ? (messages?.fragmentContextModeSentences ?? '按句子数')
          : (messages?.fragmentContextModeChars ?? '按字符数')
    }))
  });
  refs.contextModeSelect = select;
  selectWrapper.append(selectHost);

  const hint = createElement('div', 'w-full text-xs text-base-content/60 mt-1');
  hint.textContent =
    messages?.fragmentContextModeHint ??
    '字符模式会按剩余字符补齐，高亮更精确；句子模式按完整句子扩展。';

  setting.append(label, selectWrapper, hint);
  return setting;
}

export function buildExamplesSetting(
  createElement: (tag: keyof HTMLElementTagNameMap, className?: string) => HTMLElement,
  messages: FragmentSectionMessagesLike | null
): HTMLElement {
  const setting = createElement(
    'div',
    'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0'
  );
  const hintRow = createElement(
    'div',
    'grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))] mt-3'
  );

  hintRow.append(
    buildExampleCard({
      createElement,
      title: messages?.fragmentFootnoteExampleTitle ?? '脚注格式示例：',
      content: `${messages?.fragmentFootnoteExampleContent ?? '这是选中的文本内容'}[^1]\n\n[^1]: ${messages?.fragmentFootnoteExampleComment ?? '这是我的评论'}`
    }),
    buildExampleCard({
      createElement,
      title: messages?.fragmentContextHighlightExampleTitle ?? '上下文高亮示例：',
      content:
        messages?.fragmentContextHighlightExampleContent ??
        '前面的上下文 ==这是选中的文本== 后面的上下文'
    })
  );

  setting.append(hintRow);
  return setting;
}

function buildExampleCard(params: {
  createElement: (tag: keyof HTMLElementTagNameMap, className?: string) => HTMLElement;
  title: string;
  content: string;
}): HTMLElement {
  const { createElement, title, content } = params;
  const card = createElement(
    'div',
    'bg-base-100 border border-base-300 rounded-lg p-4 shadow-sm text-sm text-base-content leading-relaxed'
  );
  const cardTitle = document.createElement('strong');
  cardTitle.textContent = title;
  const code = document.createElement('code');
  code.className = 'block whitespace-pre-wrap bg-base-200 p-2 rounded mt-2 font-mono text-xs';
  code.textContent = content;
  card.append('✨ ', cardTitle, document.createElement('br'), code);
  return card;
}
