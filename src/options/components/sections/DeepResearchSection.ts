import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { getOptionsController } from '../../app/optionsControllerContext';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import { createCheckboxElement as createDaisyCheckboxElement } from '@ui/primitives/checkbox';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';

export class DeepResearchSection extends BaseSection<SectionRenderContext> {
  private pureModeToggle: HTMLInputElement | null = null;

  private readonly handleToggleChange = (): void => {
    const controller = getOptionsController();
    controller?.scheduleAutoSave();
  };

  protected renderWithState(): HTMLElement {
    this.applySectionChrome();
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

    this.unregisterManagedFormSection();

    super.destroy();
  }

  private buildHeader(): HTMLElement {
    return this.buildSectionHeader({
      title: this.messages?.deepResearchConfigTitle ?? 'Gemini Deep Research 配置',
      description: this.messages?.deepResearchConfigHint ?? '自定义 Deep Research 报告的捕捉方式',
      titleClassName: 'm-0 text-2xl font-semibold tracking-tight',
      descriptionClassName: 'text-base-content/60 text-md'
    });
  }

  private buildBody(): HTMLElement {
    const wrapper = this.createSectionBody();
    const settings = this.createSectionSettings();

    settings.append(this.buildToggleSetting(), this.buildWarningNote());
    wrapper.append(settings);
    return wrapper;
  }

  private buildToggleSetting(): HTMLElement {
    const setting = this.createSettingRow(
      'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0'
    );
    const control = this.createElement('div', 'flex flex-wrap justify-start gap-2');

    const { root, input } = createDaisyCheckboxElement({
      id: 'deepResearchPureMode',
      label: this.messages?.pureModeLabel ?? '提纯模式（只捕捉报告内容）'
    });
    control.append(root);

    const hint = this.createElement('div', 'w-full text-xs text-base-content/60 mt-1');
    hint.textContent =
      this.messages?.pureModeHint ?? '启用后，只捕捉 Deep Research 报告内容，不包含对话消息。';

    input.addEventListener('change', this.handleToggleChange);
    this.pureModeToggle = input;

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
    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    };
    this.registerManagedFormSection('deepResearch', binding);
  }
}
