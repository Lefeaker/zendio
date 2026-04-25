import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';
import type {
  CompleteOptions,
  FragmentClipperOptions,
  FragmentContextMode,
  FragmentModifierKey,
  StoredOptions
} from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import type { BaseWidgetProps, WidgetMountContract, WidgetRuntime } from './contracts';
import { asOptionsSnapshot, clearWidgetContainer, createElement, notifyWidgetDirty } from './utils';

const FRAGMENT_DEFAULTS: FragmentClipperOptions = DEFAULT_OPTIONS.fragmentClipper ?? {
  useFootnoteFormat: true,
  captureContext: false,
  contextLength: 200,
  contextMode: 'chars',
  selectionModifierEnabled: false,
  selectionModifierKeys: [],
  keyboardShortcutsEnabled: true
};
const MODIFIER_KEYS: readonly FragmentModifierKey[] = ['alt', 'meta', 'ctrl', 'shift'];
const CONTEXT_MODES: readonly FragmentContextMode[] = ['chars', 'sentences'];

export interface FragmentSettingsWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class FragmentSettingsWidget
  implements
    WidgetMountContract<
      FragmentSettingsWidgetProps,
      Partial<CompleteOptions>,
      StoredOptions | CompleteOptions | null
    >
{
  private container: HTMLElement | null = null;
  private props: FragmentSettingsWidgetProps = {};
  private runtime: WidgetRuntime | undefined;
  private useFootnoteCheckbox: HTMLInputElement | null = null;
  private captureContextCheckbox: HTMLInputElement | null = null;
  private contextLengthInput: HTMLInputElement | null = null;
  private contextModeSelect: HTMLSelectElement | null = null;
  private modifierToggle: HTMLInputElement | null = null;
  private modifierKeyButtons: HTMLButtonElement[] = [];
  private selectedModifierKeys: FragmentModifierKey[] = [];
  private keyboardShortcutsCheckbox: HTMLInputElement | null = null;
  private highlightCleanup: (() => void) | null = null;
  private unsubscribeRepo: (() => void) | null = null;

  constructor(private readonly optionsRepository?: IOptionsRepository) {}

  mount(container: HTMLElement, props: FragmentSettingsWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.props = props;
    this.runtime = runtime;
    this.render();
    this.applySnapshot(props.options ?? null);
    this.subscribeToRepository();
  }

  update(props: FragmentSettingsWidgetProps, runtime?: WidgetRuntime): void {
    const draft = this.collect();
    this.props = props;
    this.runtime = runtime ?? this.runtime;
    this.render();
    this.applySnapshot({ ...(props.options ?? {}), ...draft } as StoredOptions);
  }

  destroy(): void {
    this.disposeHighlight();
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    clearWidgetContainer(this.container);
    this.container = null;
    this.useFootnoteCheckbox = null;
    this.captureContextCheckbox = null;
    this.contextLengthInput = null;
    this.contextModeSelect = null;
    this.modifierToggle = null;
    this.modifierKeyButtons = [];
    this.selectedModifierKeys = [];
    this.keyboardShortcutsCheckbox = null;
  }

  collect(): Partial<CompleteOptions> {
    return {
      fragmentClipper: {
        useFootnoteFormat: this.useFootnoteCheckbox?.checked ?? FRAGMENT_DEFAULTS.useFootnoteFormat,
        captureContext: this.captureContextCheckbox?.checked ?? FRAGMENT_DEFAULTS.captureContext,
        contextLength: this.normalizeContextLength(),
        contextMode: this.normalizeContextMode(this.contextModeSelect?.value),
        selectionModifierEnabled:
          this.modifierToggle?.checked ?? FRAGMENT_DEFAULTS.selectionModifierEnabled,
        selectionModifierKeys: [...this.selectedModifierKeys],
        keyboardShortcutsEnabled:
          this.keyboardShortcutsCheckbox?.checked ?? FRAGMENT_DEFAULTS.keyboardShortcutsEnabled
      }
    };
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | null): void {
    const options = asOptionsSnapshot(snapshot);
    const fragment = options.fragmentClipper ?? FRAGMENT_DEFAULTS;

    if (this.useFootnoteCheckbox) {
      this.useFootnoteCheckbox.checked =
        fragment.useFootnoteFormat ?? FRAGMENT_DEFAULTS.useFootnoteFormat;
    }
    if (this.captureContextCheckbox) {
      this.captureContextCheckbox.checked =
        fragment.captureContext ?? FRAGMENT_DEFAULTS.captureContext;
    }
    if (this.contextLengthInput) {
      this.contextLengthInput.value = String(this.normalizeContextLength(fragment.contextLength));
    }
    if (this.contextModeSelect) {
      this.contextModeSelect.value = this.normalizeContextMode(fragment.contextMode);
    }
    if (this.modifierToggle) {
      this.modifierToggle.checked =
        fragment.selectionModifierEnabled ?? FRAGMENT_DEFAULTS.selectionModifierEnabled;
    }
    this.selectedModifierKeys = Array.isArray(fragment.selectionModifierKeys)
      ? fragment.selectionModifierKeys
      : FRAGMENT_DEFAULTS.selectionModifierKeys;
    if (this.keyboardShortcutsCheckbox) {
      this.keyboardShortcutsCheckbox.checked =
        fragment.keyboardShortcutsEnabled ?? FRAGMENT_DEFAULTS.keyboardShortcutsEnabled;
    }
    this.updateContextVisibility();
    this.updateModifierButtons();
  }

  highlightKeyboardShortcuts(): boolean {
    this.disposeHighlight();
    const target =
      this.keyboardShortcutsCheckbox?.closest<HTMLElement>('.schema-row') ??
      this.keyboardShortcutsCheckbox;
    if (!target) {
      return false;
    }
    target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    target.classList.add('schema-widget-highlight');
    const timer = window.setTimeout(() => {
      target.classList.remove('schema-widget-highlight');
      this.highlightCleanup = null;
    }, 3000);
    this.highlightCleanup = () => {
      window.clearTimeout(timer);
      target.classList.remove('schema-widget-highlight');
      this.highlightCleanup = null;
    };
    return true;
  }

  private render(): void {
    if (!this.container) {
      return;
    }

    this.modifierKeyButtons = [];
    const root = createElement('div', 'schema-widget-stack');
    root.append(
      this.buildCheckboxRow(
        this.props.messages?.fragmentUseFootnoteLabel ?? '使用脚注格式（推荐）',
        this.props.messages?.fragmentUseFootnoteHint ??
          '启用后，评论将以 Obsidian 脚注格式保存，兼容 Sidebar Highlights 插件。',
        (input) => {
          this.useFootnoteCheckbox = input;
        }
      ),
      this.buildContextRow(),
      this.buildModifierRow(),
      this.buildCheckboxRow(
        this.props.messages?.fragmentKeyboardShortcutsLabel ?? '启用剪藏对话框快捷键',
        this.props.messages?.fragmentKeyboardShortcutsHint ??
          '在剪藏对话框中：双击回车进入阅读模式，Cmd+回车或 Alt+回车直接剪藏。',
        (input) => {
          this.keyboardShortcutsCheckbox = input;
        }
      ),
      this.buildExamples()
    );
    this.container.replaceChildren(root);
  }

  private buildCheckboxRow(
    titleText: string,
    descriptionText: string,
    register: (input: HTMLInputElement) => void,
    afterChange?: () => void
  ): HTMLElement {
    const row = createElement('div', 'schema-row');
    const label = createElement('div', 'schema-row-label');
    const title = document.createElement('strong');
    title.textContent = titleText;
    const description = document.createElement('span');
    description.textContent = descriptionText;
    label.append(title, description);

    const control = createElement('div', 'schema-row-control');
    const switchLine = createElement('label', 'schema-switch-line');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'schema-switch-input';
    input.addEventListener('change', () => {
      afterChange?.();
      this.markDirty();
    });
    switchLine.append(input, createElement('span', 'schema-switch-slider'));
    control.append(switchLine);
    register(input);
    row.append(label, control);
    return row;
  }

  private buildContextRow(): HTMLElement {
    const row = createElement('div', 'schema-row');
    const label = createElement('div', 'schema-row-label');
    const title = document.createElement('strong');
    title.textContent = this.props.messages?.captureContextLabel ?? '捕捉上下文（该功能尚不稳定）';
    const description = document.createElement('span');
    description.textContent =
      this.props.messages?.fragmentCaptureContextHint ??
      '启用后，会捕捉选中文字周围的上下文，并用 ==高亮== 标记实际选中的部分。';
    label.append(title, description);

    const control = createElement('div', 'schema-row-control');
    const inline = createElement('div', 'fragment-context-inline');
    const switchLine = createElement('label', 'schema-switch-line');
    const captureToggle = document.createElement('input');
    captureToggle.type = 'checkbox';
    captureToggle.className = 'schema-switch-input';
    captureToggle.addEventListener('change', () => {
      this.updateContextVisibility();
      this.markDirty();
    });
    this.captureContextCheckbox = captureToggle;
    switchLine.append(captureToggle, createElement('span', 'schema-switch-slider'));
    inline.append(switchLine);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.className = 'schema-input';
    input.addEventListener('change', () => {
      this.normalizeContextLength();
      this.markDirty();
    });
    input.addEventListener('blur', () => this.normalizeContextLength());
    this.contextLengthInput = input;
    inline.append(
      this.buildInlineField(this.props.messages?.fragmentContextLengthLabel ?? '上下文长度', input)
    );

    const select = document.createElement('select');
    select.className = 'schema-select';
    CONTEXT_MODES.forEach((mode) => {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent =
        mode === 'sentences'
          ? (this.props.messages?.fragmentContextModeSentences ?? '句子')
          : (this.props.messages?.fragmentContextModeChars ?? '字符');
      select.append(option);
    });
    select.addEventListener('change', () => this.markDirty());
    this.contextModeSelect = select;
    inline.append(
      this.buildInlineField(this.props.messages?.fragmentContextModeLabel ?? '上下文单位', select)
    );

    control.append(inline);
    row.append(label, control);
    return row;
  }

  private buildModifierRow(): HTMLElement {
    const row = createElement('div', 'schema-row');
    const label = createElement('div', 'schema-row-label');
    const title = document.createElement('strong');
    title.textContent =
      this.props.messages?.fragmentModifierToggleLabel ?? '要求按住修饰键才显示片段剪藏按钮';
    const description = document.createElement('span');
    description.textContent =
      this.props.messages?.fragmentModifierToggleDescription ??
      '避免在普通选择文本时频繁出现剪藏按钮。';
    label.append(title, description);

    const control = createElement('div', 'schema-row-control');
    const inline = createElement('div', 'schema-stack modifier-key-inline');
    const switchLine = createElement('label', 'schema-switch-line');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'schema-switch-input';
    input.addEventListener('change', () => {
      this.updateModifierButtons();
      this.markDirty();
    });
    this.modifierToggle = input;
    switchLine.append(input, createElement('span', 'schema-switch-slider'));
    inline.append(switchLine);

    const chipRow = createElement('div', 'modifier-chip-row');
    MODIFIER_KEYS.forEach((key) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'schema-pill schema-chip-button';
      button.dataset.fragmentModifierKey = key;
      button.textContent = this.resolveModifierLabel(key);
      button.addEventListener('click', () => {
        this.toggleModifierKey(key);
        this.markDirty();
      });
      chipRow.append(button);
      this.modifierKeyButtons.push(button);
    });
    inline.append(chipRow);

    control.append(inline);
    row.append(label, control);
    return row;
  }

  private buildExamples(): HTMLElement {
    const grid = createElement('div', 'schema-mini-grid');
    const footnoteCard = createElement('div', 'schema-mini-card');
    const footnoteTitle = document.createElement('strong');
    footnoteTitle.textContent = this.props.messages?.fragmentFootnoteExampleTitle ?? '脚注格式示例';
    const footnote = document.createElement('code');
    footnote.textContent = `${this.props.messages?.fragmentFootnoteExampleContent ?? 'This is the selected text content'} [^1]\n\n[^1]: ${this.props.messages?.fragmentFootnoteExampleComment ?? 'This is my comment'}`;
    footnoteCard.append(footnoteTitle, footnote);

    const contextCard = createElement('div', 'schema-mini-card');
    const contextTitle = document.createElement('strong');
    contextTitle.textContent =
      this.props.messages?.fragmentContextHighlightExampleTitle ?? '上下文高亮示例';
    const context = document.createElement('code');
    context.textContent =
      this.props.messages?.fragmentContextHighlightExampleContent ??
      'Context before ==this is the selected text== context after';
    contextCard.append(contextTitle, context);

    grid.append(footnoteCard, contextCard);
    return grid;
  }

  private buildInlineField(labelText: string, controlNode: HTMLElement): HTMLElement {
    const field = createElement('label', 'schema-inline-field');
    const text = document.createElement('span');
    text.textContent = labelText;
    field.append(text, controlNode);
    return field;
  }

  private updateContextVisibility(): void {
    const enabled = Boolean(this.captureContextCheckbox?.checked);
    if (this.contextLengthInput) {
      this.contextLengthInput.disabled = !enabled;
    }
    if (this.contextModeSelect) {
      this.contextModeSelect.disabled = !enabled;
    }
  }

  private updateModifierButtons(): void {
    const enabled = Boolean(this.modifierToggle?.checked);
    this.modifierKeyButtons.forEach((button) => {
      const key = button.dataset.fragmentModifierKey as FragmentModifierKey | undefined;
      const isActive = key ? enabled && this.selectedModifierKeys.includes(key) : false;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  private toggleModifierKey(key: FragmentModifierKey): void {
    if (this.selectedModifierKeys.includes(key)) {
      this.selectedModifierKeys = this.selectedModifierKeys.filter((item) => item !== key);
    } else {
      this.selectedModifierKeys = [...this.selectedModifierKeys, key];
    }
    this.updateModifierButtons();
  }

  private normalizeContextLength(value?: number): number {
    const raw = value ?? Number.parseInt(this.contextLengthInput?.value.trim() ?? '', 10);
    const fallback = FRAGMENT_DEFAULTS.contextLength ?? 200;
    const normalized = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : fallback;
    if (this.contextLengthInput) {
      this.contextLengthInput.value = String(normalized);
    }
    return normalized;
  }

  private normalizeContextMode(value: unknown): FragmentContextMode {
    return CONTEXT_MODES.includes(value as FragmentContextMode)
      ? (value as FragmentContextMode)
      : (FRAGMENT_DEFAULTS.contextMode ?? 'chars');
  }

  private resolveModifierLabel(key: FragmentModifierKey): string {
    switch (key) {
      case 'alt':
        return this.props.messages?.fragmentModifierKeyAlt ?? 'Alt';
      case 'meta':
        return this.props.messages?.fragmentModifierKeyMeta ?? 'Cmd';
      case 'ctrl':
        return this.props.messages?.fragmentModifierKeyCtrl ?? 'Ctrl';
      case 'shift':
        return this.props.messages?.fragmentModifierKeyShift ?? 'Shift';
      default:
        return key;
    }
  }

  private markDirty(): void {
    notifyWidgetDirty(this.runtime, ['fragmentClipper']);
  }

  private disposeHighlight(): void {
    this.highlightCleanup?.();
    this.highlightCleanup = null;
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo =
      this.optionsRepository?.onChange((options) => {
        this.applySnapshot(options);
      }) ?? null;
  }
}
