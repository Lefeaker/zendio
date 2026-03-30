import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import { getOptionsController } from '../../app/optionsControllerContext';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import { UiBadge as DaisyBadge } from '../../../ui/primitives/badge';
import { UiCheckbox as DaisyCheckbox } from '../../../ui/primitives/checkbox';
import { UiInput as DaisyInput } from '../../../ui/primitives/input';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';

export class AiSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private userNameInput: HTMLInputElement | null = null;
  private timestampToggle: HTMLInputElement | null = null;
  private timestampHint: HTMLElement | null = null;
  private unsubscribeFromRepo: (() => void) | null = null;

  constructor(container: HTMLElement, optionsRepo: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo;
  }

  protected renderWithState(_context: SectionRenderContext): HTMLElement {
    this.dispose();
    this.applySectionChrome();
    this.container.replaceChildren(this.buildHeader(), this.buildBody());
    this.registerFormIntegration();
    this.subscribeToRepository();
    return this.container;
  }

  override destroy(): void {
    this.dispose();
    super.destroy();
  }

  private dispose(): void {
    this.unregisterManagedFormSection();
    if (this.userNameInput) {
      this.userNameInput.removeEventListener('input', this.handleInput);
      this.userNameInput = null;
    }
    if (this.unsubscribeFromRepo) {
      this.unsubscribeFromRepo();
      this.unsubscribeFromRepo = null;
    }
    this.timestampToggle = null;
    this.timestampHint = null;
  }

  private buildHeader(): HTMLElement {
    return this.buildSectionHeader({
      title: this.messages?.aiChatConfigTitle ?? 'AI 对话剪藏配置',
      description: this.messages?.aiChatConfigHint ?? '识别各平台对话结构，控制时间戳与高亮策略',
      titleClassName: 'm-0 text-2xl font-semibold tracking-tight',
      descriptionClassName: 'text-base-content/60 text-md'
    });
  }

  private buildBody(): HTMLElement {
    const wrapper = this.createSectionBody();
    const settings = this.createSectionSettings();

    const platformsSetting = this.createElement(
      'div',
      'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0'
    );
    platformsSetting.append(this.buildPlatformsDetails());
    settings.append(platformsSetting);

    const nameSetting = this.createSettingRow();
    const nameLabel = this.createElement('div', 'text-sm text-base-content/60 font-semibold');
    nameLabel.textContent = this.messages?.userNameLabel ?? '用户名称';
    const nameControl = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const nameInputHost = this.createElement('div', 'w-full');
    const daisyNameInput = new DaisyInput(nameInputHost);
    // ✅ Stage 3 Week 2: Migrated to DaisyInput (AiSection)
    const nameInput = daisyNameInput.render({
      type: 'text',
      placeholder: this.messages?.userNamePlaceholder ?? 'USER',
      variant: 'bordered',
      size: 'md',
      onChange: () => this.handleInput()
    });
    nameInput.id = 'aiUserName';
    nameInput.setAttribute('data-i18n-placeholder', 'userNamePlaceholder');
    this.userNameInput = nameInput;
    nameControl.append(nameInputHost);
    const nameHint = this.createElement('div', 'w-full text-xs text-base-content/60 mt-1');
    nameHint.textContent =
      this.messages?.userNameHint ?? '自定义用户消息的显示名称，默认为 "USER"。';
    nameSetting.append(nameLabel, nameControl, nameHint);
    settings.append(nameSetting);

    settings.append(this.buildTimestampSetting());

    this.syncTimestampPolicy();

    wrapper.append(settings);
    return wrapper;
  }

  private buildTimestampSetting(): HTMLElement {
    const setting = this.createSettingRow();
    const labelText = this.messages?.includeTimestampsLabel ?? 'Include message timestamps';
    const hintText =
      this.messages?.includeTimestampsHint ?? 'Show send time after each message (if available)';
    const label = this.createElement('div', 'text-sm text-base-content/60 font-semibold');
    label.textContent = labelText;

    const control = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const checkboxHost = this.createElement('div');
    const checkboxComponent = new DaisyCheckbox(checkboxHost);
    const checkbox = checkboxComponent.render({
      id: 'aiIncludeTimestamps',
      label: labelText,
      disabled: true
    });
    control.append(checkboxHost);

    // ✅ Phase 1 DaisyUI migration: 使用 .alert 基类替代手动样式
    const hint = this.createElement('p', 'alert alert-info text-sm my-3');
    hint.textContent = hintText;

    setting.append(label, control, hint);
    this.timestampToggle = checkbox;
    this.timestampHint = hint;
    return setting;
  }

  private registerFormIntegration(): void {
    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    };
    this.registerManagedFormSection('aiChat', binding);
  }

  private buildPlatformsDetails(): HTMLElement {
    const details = document.createElement('details');
    details.className = 'border border-base-300 rounded-md bg-base-200 p-3';

    const summary = document.createElement('summary');
    summary.className = 'font-semibold cursor-pointer list-none text-accent mb-2 marker:hidden';
    summary.textContent = this.messages?.aiSupportedPlatformsToggle ?? '查看适配AI平台';
    details.append(summary);

    const tagList = this.createElement('div', 'flex flex-wrap gap-2');

    const platforms: Array<{ name: string; url: string }> = [
      { name: 'ChatGPT', url: 'https://chatgpt.com/' },
      { name: 'Claude', url: 'https://claude.ai/' },
      { name: 'Gemini', url: 'https://gemini.google.com/app' },
      { name: 'Kimi', url: 'https://kimi.moonshot.cn/' },
      { name: 'DeepSeek', url: 'https://chat.deepseek.com/' },
      { name: 'Tongyi', url: 'https://tongyi.aliyun.com/' },
      { name: 'Doubao', url: 'https://www.doubao.com/chat/' },
      { name: 'Monica', url: 'https://monica.im/' }
    ];

    for (const { name, url } of platforms) {
      const link = document.createElement('a');
      link.className =
        'no-underline transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 rounded-md';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const badgeHost = document.createElement('span');
      const badge = new DaisyBadge(badgeHost);
      badge.render({
        label: name,
        variant: 'accent',
        size: 'sm'
      });
      link.append(badgeHost);
      tagList.append(link);
    }

    details.append(tagList);
    return details;
  }

  private handleInput = (): void => {
    const controller = getOptionsController();
    controller?.scheduleAutoSave();
  };

  private applySnapshot(options: StoredOptions | CompleteOptions): void {
    const aiChat = options.aiChat;
    if (this.userNameInput) {
      this.userNameInput.value = aiChat?.userName ?? 'USER';
    }
    if (this.timestampToggle) {
      this.timestampToggle.checked = Boolean(aiChat?.includeTimestamps);
      this.timestampToggle.disabled = false;
    }
    this.syncTimestampPolicy();
  }

  private collectChanges(previous: StoredOptions | null): Partial<CompleteOptions> {
    const previousAiChat = previous?.aiChat;
    const userName =
      (this.userNameInput?.value ?? previousAiChat?.userName ?? 'USER').trim() || 'USER';
    const partial: Partial<CompleteOptions> = {
      aiChat: {
        includeTimestamps: false,
        userName
      }
    };
    this.persistAiChat(partial);
    return partial;
  }

  syncTimestampPolicy(): void {
    if (this.timestampToggle) {
      this.timestampToggle.checked = false;
      this.timestampToggle.disabled = true;
    }
    if (this.timestampHint) {
      this.timestampHint.hidden = false;
    }
  }

  private subscribeToRepository(): void {
    this.unsubscribeFromRepo?.();
    this.unsubscribeFromRepo = this.optionsRepo.onChange((options) => {
      this.applySnapshot(options);
    });
  }

  private persistAiChat(update: Partial<CompleteOptions>): void {
    void this.optionsRepo.set(update).catch((error) => {
      console.error('[AiSection] Failed to persist AI chat options via repository:', error);
    });
  }
}
