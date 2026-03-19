import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { getOptionsController } from '../../app/optionsControllerContext';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';

export class DeepResearchSection extends BaseSection<SectionRenderContext> {
  private pureModeToggle: HTMLInputElement | null = null;
  private formSectionBinding: FormSectionHandlers | null = null;

  private readonly handleToggleChange = (): void => {
    const controller = getOptionsController();
    controller?.scheduleAutoSave();
  };

  protected renderWithState(): HTMLElement {
    this.container.classList.add('aobx-section', 'bg-base-100', 'border', 'border-base-300', 'rounded-lg', 'p-[clamp(22px,2.5vw,32px)]', 'shadow-card');
    const header = this.buildHeader();
    const body = this.buildBody();

    this.container.replaceChildren(header, body);
    this.registerFormIntegration();
    return this.container;
  }

  override destroy(): void {
    if (this.pureModeToggle) {
      this.pureModeToggle.removeEventListener('change', this.handleToggleChange);
      this.pureModeToggle = null;
    }

    if (this.formSectionBinding) {
      const registry = this.requireFormRegistry();
      registry.unregister('deepResearch', this.formSectionBinding);
      this.formSectionBinding = null;
    }

    super.destroy();
  }

  private buildHeader(): HTMLElement {
    const header = this.createElement('div', 'grid gap-2 mb-6');

    const titleWrapper = this.createElement('div', 'flex items-center gap-2');
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold text-base-content m-0';
    title.textContent = this.messages?.deepResearchConfigTitle ?? 'Gemini Deep Research 配置';
    titleWrapper.append(title);

    const subtitle = this.createElement('div', 'text-sm text-base-content/60');
    subtitle.textContent =
      this.messages?.deepResearchConfigHint ?? '自定义 Deep Research 报告的捕捉方式';

    header.append(titleWrapper, subtitle);
    return header;
  }

  private buildBody(): HTMLElement {
    const wrapper = this.createElement('div', 'mt-6 space-y-6');
    const settings = this.createElement('div', 'grid gap-6');

    settings.append(this.buildToggleSetting(), this.buildWarningNote());
    wrapper.append(settings);
    return wrapper;
  }

  private buildToggleSetting(): HTMLElement {
    const setting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0');
    const control = this.createElement('div', 'flex flex-wrap justify-start gap-2');

    const checkboxLabel = this.createElement(
      'label',
      ['inline-flex', 'items-center', 'gap-2', 'text-sm', 'text-base-content', 'cursor-pointer'].join(' ')
    );
    // ✅ Stage 3 Week 4: Using DaisyUI checkbox classes for Deep Research toggle (DeepResearchSection)
    // ⏸️ Stage 3 Month 3: Upgrade to DaisySwitch component pending Zag.js integration
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'deepResearchPureMode';
    checkbox.className = 'checkbox checkbox-accent w-[18px] h-[18px]';
    checkboxLabel.append(
      checkbox,
      document.createTextNode(this.messages?.pureModeLabel ?? '提纯模式（只捕捉报告内容）')
    );
    control.append(checkboxLabel);

    const hint = this.createElement('div', 'w-full text-xs text-base-content/60 mt-1');
    hint.textContent =
      this.messages?.pureModeHint ?? '启用后，只捕捉 Deep Research 报告内容，不包含对话消息。';

    checkbox.addEventListener('change', this.handleToggleChange);
    this.pureModeToggle = checkbox;

    setting.append(control, hint);
    return setting;
  }

  private buildWarningNote(): HTMLElement {
    // ✅ Phase 1 DaisyUI migration: 使用 .alert 基类替代手动样式
    const warning = this.createElement('div', 'alert alert-warning text-sm my-3');
    warning.textContent =
      this.messages?.multipleReportsInfo ??
      'Gemini 一次只能显示一个完整报告。如需保存多个报告，请分别打开每个报告并点击剪藏。';
    return warning;
  }

  private applySnapshot(options: StoredOptions): void {
    const pureMode = options.deepResearch?.pureMode ?? false;
    if (this.pureModeToggle) {
      this.pureModeToggle.checked = pureMode;
    }
  }

  private collectChanges(previous: StoredOptions | null): Partial<CompleteOptions> {
    const previousSection = previous?.deepResearch;
    const pureMode = this.pureModeToggle?.checked ?? previousSection?.pureMode ?? false;
    return {
      deepResearch: {
        pureMode
      }
    };
  }

  private registerFormIntegration(): void {
    const registry = this.requireFormRegistry();
    if (this.formSectionBinding) {
      registry.unregister('deepResearch', this.formSectionBinding);
    }

    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    };

    registry.register('deepResearch', binding);
    this.formSectionBinding = binding;
  }
}
