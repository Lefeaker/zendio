import type { CompleteOptions, FragmentClipperOptions, StoredOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import { configProvider } from '@shared/config';
import { getOptionsController } from '../../app/optionsControllerContext';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import { registerFragmentShortcutsHighlighter, unregisterFragmentShortcutsHighlighter } from '../sectionRegistry';
import { DaisyInput } from '../shared/DaisyInput';
import { DaisyCheckbox } from '../shared/DaisyCheckbox';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';

const FRAGMENT_DEFAULTS = configProvider.getFragmentClipperDefaults();
const MODIFIER_KEYS: Array<FragmentClipperOptions['selectionModifierKeys'][number]> = ['alt', 'meta', 'ctrl', 'shift'];
const CONTEXT_MODES: Array<FragmentClipperOptions['contextMode']> = ['chars', 'sentences'];

interface EventBinding {
  target: EventTarget;
  type: string;
  handler: EventListener;
}

export class FragmentSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private footnoteCheckbox: HTMLInputElement | null = null;
  private captureContextCheckbox: HTMLInputElement | null = null;
  private modifierToggle: HTMLInputElement | null = null;
  private modifierKeysGroup: HTMLElement | null = null;
  private modifierKeyCheckboxes: HTMLInputElement[] = [];
  private keyboardShortcutsCheckbox: HTMLInputElement | null = null;
  private contextLengthGroup: HTMLElement | null = null;
  private contextModeGroup: HTMLElement | null = null;
  private contextLengthInput: HTMLInputElement | null = null;
  private contextModeSelect: HTMLSelectElement | null = null;
  private highlightCleanup: (() => void) | null = null;
  private isRegistered = false;
  private formSectionBinding: FormSectionHandlers | null = null;
  private eventBindings: EventBinding[] = [];
  private unsubscribeRepo: (() => void) | null = null;

  constructor(container: HTMLElement, optionsRepo?: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo ?? resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  }

  protected renderWithState(_context: SectionRenderContext): HTMLElement {
    this.disposeListeners();
    this.container.classList.add('aobx-section', 'bg-base-100', 'border', 'border-base-300', 'rounded-lg', 'p-[clamp(22px,2.5vw,32px)]', 'shadow-card');

    const header = this.buildHeader();
    const body = this.buildBody();

    this.container.replaceChildren(header, body);
    this.registerHighlighter();
    this.bindEvents();
    this.registerFormIntegration();
    this.subscribeToRepository();
    return this.container;
  }

  override destroy(): void {
    this.disposeHighlight();
    this.disposeListeners();
    if (this.isRegistered) {
      unregisterFragmentShortcutsHighlighter(this.highlightShortcuts);
      this.isRegistered = false;
    }
    if (this.formSectionBinding) {
      const registry = this.requireFormRegistry();
      registry.unregister('fragmentClipper', this.formSectionBinding);
      this.formSectionBinding = null;
    }
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    super.destroy();
  }

  private registerFormIntegration(): void {
    const registry = this.requireFormRegistry();
    if (this.formSectionBinding) {
      registry.unregister('fragmentClipper', this.formSectionBinding);
    }

    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    };

    registry.register('fragmentClipper', binding);
    this.formSectionBinding = binding;
  }

  private bindEvents(): void {
    if (this.footnoteCheckbox) {
      this.bindEvent(this.footnoteCheckbox, 'change', this.handleValueChanged);
    }
    if (this.captureContextCheckbox) {
      this.bindEvent(this.captureContextCheckbox, 'change', this.handleCaptureContextChange);
    }
    if (this.modifierToggle) {
      this.bindEvent(this.modifierToggle, 'change', this.handleModifierToggleChange);
    }
    this.modifierKeyCheckboxes.forEach(checkbox => {
      this.bindEvent(checkbox, 'change', this.handleValueChanged);
    });
    if (this.keyboardShortcutsCheckbox) {
      this.bindEvent(this.keyboardShortcutsCheckbox, 'change', this.handleValueChanged);
    }
    if (this.contextLengthInput) {
      this.bindEvent(this.contextLengthInput, 'change', this.handleContextLengthChange);
      this.bindEvent(this.contextLengthInput, 'blur', this.handleContextLengthBlur);
    }
    if (this.contextModeSelect) {
      this.bindEvent(this.contextModeSelect, 'change', this.handleValueChanged);
    }
  }

  private bindEvent(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    this.eventBindings.push({ target, type, handler });
  }

  private disposeListeners(): void {
    this.eventBindings.forEach(({ target, type, handler }) => {
      target.removeEventListener(type, handler);
    });
    this.eventBindings = [];
    this.modifierKeyCheckboxes = [];
    this.footnoteCheckbox = null;
    this.captureContextCheckbox = null;
    this.modifierToggle = null;
    this.modifierKeysGroup = null;
    this.keyboardShortcutsCheckbox = null;
    this.contextLengthGroup = null;
    this.contextModeGroup = null;
    this.contextLengthInput = null;
    this.contextModeSelect = null;
  }

  private buildHeader(): HTMLElement {
    const header = this.createElement('div', 'grid gap-2 mb-6');

    const titleWrapper = this.createElement('div', 'flex items-center gap-2');
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold text-base-content m-0';
    title.textContent = this.messages?.fragmentConfigTitle ?? '片段剪藏配置';
    titleWrapper.append(title);

    const subtitle = this.createElement('div', 'text-sm text-base-content/60');
    subtitle.textContent =
      this.messages?.fragmentConfigHint ?? '自定义选中文本剪藏的格式和行为';

    header.append(titleWrapper, subtitle);
    return header;
  }

  private buildBody(): HTMLElement {
    const wrapper = this.createElement('div', 'mt-6 space-y-6');
    const settings = this.createElement('div', 'grid gap-6');

    settings.append(
      this.buildCheckboxSetting(
        'fragmentUseFootnote',
        this.messages?.fragmentUseFootnoteLabel ?? '使用脚注格式（推荐）',
        this.messages?.fragmentUseFootnoteHint ??
        '启用后，评论将以 Obsidian 脚注格式保存，兼容 Sidebar Highlights 插件。'
      ),
      this.buildCheckboxSetting(
        'fragmentCaptureContext',
        this.messages?.captureContextLabel ?? '捕捉上下文（该功能尚不稳定）',
        this.messages?.fragmentCaptureContextHint ??
        '启用后，会捕捉选中文字周围的上下文，并用 ==高亮== 标记实际选中的部分。'
      ),
      this.buildModifierToggleSetting(),
      this.buildModifierKeysSetting(),
      this.buildContextLengthSetting(),
      this.buildContextModeSetting(),
      this.buildCheckboxSetting(
        'fragmentKeyboardShortcutsEnabled',
        this.messages?.fragmentKeyboardShortcutsLabel ?? '启用剪藏对话框快捷键',
        this.messages?.fragmentKeyboardShortcutsHint ??
        '在剪藏对话框中：双击回车进入阅读模式，Cmd+回车（Mac）或 Alt+回车（Windows）直接剪藏。'
      ),
      this.buildExamplesSetting()
    );
    // ⏸️ Stage 3 Month 3: YAML editor pending Monaco/CodeMirror integration
    // 片段 YAML 表单将随 Month 3 富文本编辑器引入后统一迁移。

    wrapper.append(settings);
    return wrapper;
  }

  private buildCheckboxSetting(inputId: string, labelText: string, hintText: string): HTMLElement {
    const setting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0');
    const control = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const checkboxHost = this.createElement('div');
    const checkboxComponent = new DaisyCheckbox(checkboxHost);
    const input = checkboxComponent.render({
      id: inputId,
      label: labelText
    });
    control.append(checkboxHost);
    const hint = this.createElement('div', 'w-full text-xs text-base-content/60 mt-1');
    hint.textContent = hintText;
    setting.append(control, hint);

    if (inputId === 'fragmentUseFootnote') {
      this.footnoteCheckbox = input;
    } else if (inputId === 'fragmentCaptureContext') {
      this.captureContextCheckbox = input;
    } else if (inputId === 'fragmentKeyboardShortcutsEnabled') {
      this.keyboardShortcutsCheckbox = input;
    }

    return setting;
  }

  private buildModifierToggleSetting(): HTMLElement {
    const setting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0');
    const control = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const checkboxLabel = this.createElement(
      'label',
      ['inline-flex', 'items-center', 'gap-2', 'text-sm', 'text-base-content', 'cursor-pointer'].join(' ')
    );
    // ✅ Phase 1 DaisyUI migration: 使用 .checkbox 基类
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'fragmentModifierToggle';
    input.className = 'checkbox checkbox-accent w-[18px] h-[18px]';
    checkboxLabel.append(
      input,
      document.createTextNode(
        this.messages?.fragmentModifierToggleLabel ?? '启用辅助键触发剪藏/阅读操作'
      )
    );
    control.append(checkboxLabel);
    const hint = this.createElement('div', 'w-full text-xs text-base-content/60 mt-1');
    hint.textContent =
      this.messages?.fragmentModifierToggleDescription ??
      '按住所选的辅助键并拖动鼠标选择文本时，将自动打开剪藏窗口或添加阅读模式高亮。';
    setting.append(control, hint);
    this.modifierToggle = input;
    return setting;
  }

  private buildModifierKeysSetting(): HTMLElement {
    const setting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');
    setting.id = 'fragmentModifierKeysGroup';
    setting.style.display = 'none';
    this.modifierKeysGroup = setting;

    const label = this.createElement('div', ['text-sm', 'text-base-content/60', 'font-semibold'].join(' '));
    label.textContent = this.messages?.fragmentModifierKeysLabel ?? '辅助键设置';

    const control = this.createElement('div', 'flex flex-wrap gap-2');
    MODIFIER_KEYS.forEach((key) => {
      const toggle = this.createElement(
        'label',
        ['inline-flex', 'items-center', 'gap-2', 'text-sm', 'text-base-content', 'cursor-pointer'].join(' ')
      );
      // ✅ Phase 1 DaisyUI migration: 使用 .checkbox 基类
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'checkbox checkbox-accent w-[18px] h-[18px]';
      checkbox.setAttribute('data-fragment-modifier-key', key);
      toggle.append(
        checkbox,
        document.createTextNode(
          this.resolveModifierLabel(key)
        )
      );
      control.append(toggle);
      this.modifierKeyCheckboxes.push(checkbox);
    });

    const hint = this.createElement('div', 'w-full text-xs text-base-content/60 mt-1');
    hint.textContent =
      this.messages?.fragmentModifierKeysDescription ??
      '同时按下所有选中的辅助键才会触发自动剪藏或阅读高亮。';

    setting.append(label, control, hint);
    return setting;
  }

  private buildContextLengthSetting(): HTMLElement {
    const setting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');
    setting.id = 'fragmentContextLengthGroup';
    setting.style.display = 'none';
    this.contextLengthGroup = setting;

    const label = this.createElement('label', 'text-sm text-base-content/60 font-semibold');
    label.setAttribute('for', 'fragmentContextLength');
    label.textContent = this.messages?.fragmentContextLengthLabel ?? '上下文长度';

    const field = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const inputHost = this.createElement('div', 'w-full');
    // ✅ Stage 3 Week 3: Migrated context length input to DaisyInput (FragmentSection)
    const contextLengthInput = new DaisyInput(inputHost).render({
      type: 'number',
      variant: 'bordered',
      size: 'md',
      value: String(FRAGMENT_DEFAULTS.contextLength ?? 200),
      disabled: true
    });
    contextLengthInput.id = 'fragmentContextLength';
    contextLengthInput.min = '1';
    contextLengthInput.step = '1';
    this.contextLengthInput = contextLengthInput;
    field.append(inputHost);

    const hint = this.createElement('div', 'w-full text-xs text-base-content/60 mt-1');
    hint.textContent =
      this.messages?.fragmentContextLengthHint ??
      '控制上下文捕捉的最大长度；建议在 50~1000 之间。';

    setting.append(label, field, hint);
    return setting;
  }

  private buildContextModeSetting(): HTMLElement {
    const setting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');
    setting.id = 'fragmentContextModeGroup';
    setting.style.display = 'none';
    this.contextModeGroup = setting;

    const label = this.createElement('label', 'text-sm text-base-content/60 font-semibold');
    label.setAttribute('for', 'fragmentContextMode');
    label.textContent = this.messages?.fragmentContextModeLabel ?? '上下文单位';

    const selectWrapper = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    // ✅ Phase 1 DaisyUI migration: 使用 .select 基类
    const select = document.createElement('select');
    select.id = 'fragmentContextMode';
    select.className = 'select select-bordered w-full min-h-[36px]';
    CONTEXT_MODES.forEach((mode) => {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent =
        mode === 'sentences'
          ? this.messages?.fragmentContextModeSentences ?? '按句子数'
          : this.messages?.fragmentContextModeChars ?? '按字符数';
      select.append(option);
    });
    select.value = FRAGMENT_DEFAULTS.contextMode ?? 'chars';
    select.disabled = true;
    this.contextModeSelect = select;
    selectWrapper.append(select);

    const hint = this.createElement('div', 'w-full text-xs text-base-content/60 mt-1');
    hint.textContent =
      this.messages?.fragmentContextModeHint ??
      '字符模式会按剩余字符补齐，高亮更精确；句子模式按完整句子扩展。';

    setting.append(label, selectWrapper, hint);
    return setting;
  }

  private resolveModifierLabel(key: FragmentClipperOptions['selectionModifierKeys'][number]): string {
    switch (key) {
      case 'alt':
        return this.messages?.fragmentModifierKeyAlt ?? 'Option / Alt';
      case 'meta':
        return this.messages?.fragmentModifierKeyMeta ?? 'Command';
      case 'ctrl':
        return this.messages?.fragmentModifierKeyCtrl ?? 'Control';
      case 'shift':
        return this.messages?.fragmentModifierKeyShift ?? 'Shift';
      default:
        return key;
    }
  }

  private buildExamplesSetting(): HTMLElement {
    const setting = this.createElement(
      'div',
      [
        'grid',
        'grid-cols-[minmax(0,1fr)]',
        'gap-3',
        'py-4',
        'border-t',
        'border-base-300',
        'items-start',
        'first:border-t-0',
        'first:pt-0'
      ].join(' ')
    );
    const hintRow = this.createElement(
      'div',
      ['grid', 'gap-3', 'grid-cols-[repeat(auto-fit,minmax(220px,1fr))]', 'mt-3'].join(' ')
    );

    const footnoteExample = this.createElement(
      'div',
      [
        'bg-base-100',
        'border',
        'border-base-300',
        'rounded-lg',
        'p-4',
        'shadow-sm',
        'text-sm',
        'text-base-content',
        'leading-relaxed'
      ].join(' ')
    );
    const footnoteTitle = document.createElement('strong');
    footnoteTitle.textContent =
      this.messages?.fragmentFootnoteExampleTitle ?? '脚注格式示例：';
    const footnoteCode = document.createElement('code');
    footnoteCode.className = [
      'block',
      'whitespace-pre-wrap',
      'bg-base-200',
      'p-2',
      'rounded',
      'mt-2',
      'font-mono',
      'text-xs'
    ].join(' ');
    footnoteCode.textContent = `${this.messages?.fragmentFootnoteExampleContent ?? '这是选中的文本内容'}[^1]

[^1]: ${this.messages?.fragmentFootnoteExampleComment ?? '这是我的评论'}`;
    footnoteExample.append('✨ ', footnoteTitle, document.createElement('br'), footnoteCode);

    const contextExample = this.createElement(
      'div',
      [
        'bg-base-100',
        'border',
        'border-base-300',
        'rounded-lg',
        'p-4',
        'shadow-sm',
        'text-sm',
        'text-base-content',
        'leading-relaxed'
      ].join(' ')
    );
    const contextTitle = document.createElement('strong');
    contextTitle.textContent =
      this.messages?.fragmentContextHighlightExampleTitle ?? '上下文高亮示例：';
    const contextCode = document.createElement('code');
    contextCode.className = [
      'block',
      'whitespace-pre-wrap',
      'bg-base-200',
      'p-2',
      'rounded',
      'mt-2',
      'font-mono',
      'text-xs'
    ].join(' ');
    contextCode.textContent =
      this.messages?.fragmentContextHighlightExampleContent ??
      '前面的上下文 ==这是选中的文本== 后面的上下文';
    contextExample.append('✨ ', contextTitle, document.createElement('br'), contextCode);

    hintRow.append(footnoteExample, contextExample);
    setting.append(hintRow);
    return setting;
  }

  private highlightShortcuts = (): boolean => {
    const checkbox = this.container.querySelector<HTMLInputElement>('#fragmentKeyboardShortcutsEnabled');
    const target =
      checkbox?.closest<HTMLElement>('.grid') ?? // Assuming .grid is the setting container
      checkbox?.closest<HTMLElement>('label') ??
      checkbox ??
      null;

    if (!target) {
      return false;
    }

    this.disposeHighlight();

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    const originalStyle = target.getAttribute('style') ?? '';
    target.style.cssText += `
      background-color: rgba(139, 92, 246, 0.1) !important;
      border: 2px solid rgba(139, 92, 246, 0.3) !important;
      border-radius: 4px !important;
      transition: all 0.3s ease !important;
    `;

    const timer = window.setTimeout(() => {
      target.setAttribute('style', originalStyle);
      this.highlightCleanup = null;
    }, 3000);

    this.highlightCleanup = () => {
      window.clearTimeout(timer);
      target.setAttribute('style', originalStyle);
      this.highlightCleanup = null;
    };

    return true;
  };

  private disposeHighlight(): void {
    if (this.highlightCleanup) {
      this.highlightCleanup();
      this.highlightCleanup = null;
    }
  }

  private registerHighlighter(): void {
    if (this.isRegistered) {
      unregisterFragmentShortcutsHighlighter(this.highlightShortcuts);
    }
    registerFragmentShortcutsHighlighter(this.highlightShortcuts);
    this.isRegistered = true;
  }

  private handleValueChanged = (): void => {
    const controller = getOptionsController();
    controller?.scheduleAutoSave();
  };

  private handleCaptureContextChange = (): void => {
    const enabled = Boolean(this.captureContextCheckbox?.checked);
    this.updateContextControlsVisibility(enabled);
    this.handleValueChanged();
  };

  private handleModifierToggleChange = (): void => {
    const enabled = Boolean(this.modifierToggle?.checked);
    this.updateModifierGroupVisibility(enabled);
    this.handleValueChanged();
  };

  private updateModifierGroupVisibility(enabled: boolean): void {
    if (this.modifierKeysGroup) {
      this.modifierKeysGroup.style.display = enabled ? 'grid' : 'none';
    }
  }

  private updateContextControlsVisibility(enabled: boolean): void {
    const displayValue = enabled ? 'grid' : 'none';
    if (this.contextLengthGroup) {
      this.contextLengthGroup.style.display = displayValue;
    }
    if (this.contextModeGroup) {
      this.contextModeGroup.style.display = displayValue;
    }
    if (this.contextLengthInput) {
      this.contextLengthInput.disabled = !enabled;
    }
    if (this.contextModeSelect) {
      this.contextModeSelect.disabled = !enabled;
    }
  }

  private handleContextLengthChange = (): void => {
    this.normalizeContextLength();
    this.handleValueChanged();
  };

  private handleContextLengthBlur = (): void => {
    this.normalizeContextLength();
  };

  private normalizeContextLength(previous?: number): number {
    const fallback = previous ?? FRAGMENT_DEFAULTS.contextLength ?? 200;
    if (!this.contextLengthInput) {
      return fallback;
    }
    const parsed = Number.parseInt(this.contextLengthInput.value.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      this.contextLengthInput.value = String(fallback);
      return fallback;
    }
    this.contextLengthInput.value = String(parsed);
    return parsed;
  }

  private applySnapshot(options: StoredOptions): void {
    const fragment = options.fragmentClipper ?? ({} as FragmentClipperOptions);

    if (this.footnoteCheckbox) {
      this.footnoteCheckbox.checked = fragment.useFootnoteFormat ?? FRAGMENT_DEFAULTS.useFootnoteFormat;
    }
    if (this.captureContextCheckbox) {
      this.captureContextCheckbox.checked = fragment.captureContext ?? FRAGMENT_DEFAULTS.captureContext;
    }
    if (this.keyboardShortcutsCheckbox) {
      this.keyboardShortcutsCheckbox.checked =
        fragment.keyboardShortcutsEnabled ?? FRAGMENT_DEFAULTS.keyboardShortcutsEnabled;
    }
    if (this.modifierToggle) {
      this.modifierToggle.checked = fragment.selectionModifierEnabled ?? FRAGMENT_DEFAULTS.selectionModifierEnabled;
    }
    if (this.contextLengthInput) {
      const nextLength =
        typeof fragment.contextLength === 'number' && fragment.contextLength > 0
          ? fragment.contextLength
          : FRAGMENT_DEFAULTS.contextLength ?? 200;
      this.contextLengthInput.value = String(nextLength);
    }
    if (this.contextModeSelect) {
      const mode = fragment.contextMode ?? FRAGMENT_DEFAULTS.contextMode ?? 'chars';
      this.contextModeSelect.value = CONTEXT_MODES.includes(mode) ? mode : 'chars';
    }

    const configuredKeys = Array.isArray(fragment.selectionModifierKeys)
      ? fragment.selectionModifierKeys
      : FRAGMENT_DEFAULTS.selectionModifierKeys;
    this.modifierKeyCheckboxes.forEach(checkbox => {
      const key = checkbox.dataset.fragmentModifierKey as FragmentClipperOptions['selectionModifierKeys'][number] | undefined;
      checkbox.checked = key ? configuredKeys.includes(key) : false;
    });
    this.updateModifierGroupVisibility(Boolean(this.modifierToggle?.checked));
    this.updateContextControlsVisibility(Boolean(this.captureContextCheckbox?.checked));
  }

  private collectChanges(previous: StoredOptions | null): Partial<CompleteOptions> {
    const previousFragment = previous?.fragmentClipper;
    const resolvedContextLength = this.normalizeContextLength(previousFragment?.contextLength);
    const modeValue = this.contextModeSelect?.value ?? previousFragment?.contextMode ?? FRAGMENT_DEFAULTS.contextMode ?? 'chars';
    const resolvedContextMode: FragmentClipperOptions['contextMode'] = CONTEXT_MODES.includes(
      modeValue as FragmentClipperOptions['contextMode']
    )
      ? (modeValue as FragmentClipperOptions['contextMode'])
      : 'chars';
    const selectionKeys = this.modifierKeyCheckboxes
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.dataset.fragmentModifierKey)
      .filter((key): key is FragmentClipperOptions['selectionModifierKeys'][number] => {
        return Boolean(key) && MODIFIER_KEYS.includes(key as FragmentClipperOptions['selectionModifierKeys'][number]);
      });

    const partial: Partial<CompleteOptions> = {
      fragmentClipper: {
        useFootnoteFormat: this.footnoteCheckbox?.checked ?? previousFragment?.useFootnoteFormat ?? true,
        captureContext: this.captureContextCheckbox?.checked ?? previousFragment?.captureContext ?? false,
        contextLength: resolvedContextLength,
        contextMode: resolvedContextMode,
        selectionModifierEnabled: this.modifierToggle?.checked ?? previousFragment?.selectionModifierEnabled ?? false,
        selectionModifierKeys: [...selectionKeys],
        keyboardShortcutsEnabled:
          this.keyboardShortcutsCheckbox?.checked ?? previousFragment?.keyboardShortcutsEnabled ?? true
      }
    };
    this.persistFragmentClipper(partial);
    return partial;
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = this.optionsRepo.onChange((options) => {
      this.applySnapshot(options);
    });
  }

  private persistFragmentClipper(partial: Partial<CompleteOptions>): void {
    void this.optionsRepo
      .set(partial)
      .catch((error) => {
        console.error('[FragmentSection] Failed to persist fragment clipper options via repository:', error);
      });
  }
}
