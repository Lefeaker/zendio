import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import { getOptionsController } from '../../app/optionsControllerContext';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import { registerAiTimestampEnforcer, unregisterAiTimestampEnforcer } from '../sectionRegistry';
import { DaisyBadge } from '../shared/DaisyBadge';
import { DaisyCheckbox } from '../shared/DaisyCheckbox';
import { DaisyInput } from '../shared/DaisyInput';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';

export class AiSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private userNameInput: HTMLInputElement | null = null;
  private formSectionBinding: FormSectionHandlers | null = null;
  private timestampToggle: HTMLInputElement | null = null;
  private timestampHint: HTMLElement | null = null;
  private timestampEnforcer: (() => void) | null = null;
  private unsubscribeFromRepo: (() => void) | null = null;

  constructor(container: HTMLElement, optionsRepo?: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo ?? resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  }

  protected renderWithState(_context: SectionRenderContext): HTMLElement {
    this.dispose();
    this.container.classList.add('aobx-section', 'bg-base-100', 'border', 'border-base-300', 'rounded-lg', 'p-[clamp(22px,2.5vw,32px)]', 'shadow-card');
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
    if (this.formSectionBinding) {
      this.requireFormRegistry().unregister('aiChat', this.formSectionBinding);
      this.formSectionBinding = null;
    }
    if (this.timestampEnforcer) {
      unregisterAiTimestampEnforcer(this.timestampEnforcer);
      this.timestampEnforcer = null;
    }
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
    const header = this.createElement('div', 'grid gap-2 mb-6');

    const titleWrapper = this.createElement('div', 'flex items-center gap-2');
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold text-base-content m-0';
    title.textContent = this.messages?.aiChatConfigTitle ?? 'AI 对话剪藏配置';
    titleWrapper.append(title);

    const subtitle = this.createElement('div', 'text-sm text-base-content/60');
    subtitle.textContent =
      this.messages?.aiChatConfigHint ?? '识别各平台对话结构，控制时间戳与高亮策略';

    header.append(titleWrapper, subtitle);
    return header;
  }

  private buildBody(): HTMLElement {
    const wrapper = this.createElement('div', 'mt-6 space-y-6');
    const settings = this.createElement('div', 'grid gap-6');

    const platformsSetting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0');
    platformsSetting.append(this.buildPlatformsDetails());
    settings.append(platformsSetting);

    const nameSetting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');
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
    nameHint.textContent = this.messages?.userNameHint ?? '自定义用户消息的显示名称，默认为 "USER"。';
    nameSetting.append(nameLabel, nameControl, nameHint);
    settings.append(nameSetting);

    settings.append(this.buildTimestampSetting());

    this.timestampEnforcer = () => {
      this.enforceTimestampPolicy();
    };
    registerAiTimestampEnforcer(this.timestampEnforcer);
    this.enforceTimestampPolicy();

    wrapper.append(settings);
    return wrapper;
  }

  private buildTimestampSetting(): HTMLElement {
    const setting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');
    const labelText = this.messages?.includeTimestampsLabel ?? 'Include message timestamps';
    const hintText = this.messages?.includeTimestampsHint ?? 'Show send time after each message (if available)';
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
    const registry = this.requireFormRegistry();
    if (this.formSectionBinding) {
      registry.unregister('aiChat', this.formSectionBinding);
    }

    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    };

    registry.register('aiChat', binding);
    this.formSectionBinding = binding;
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
      link.className = 'no-underline transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 rounded-md';
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
    this.enforceTimestampPolicy();
  }

  private collectChanges(previous: StoredOptions | null): Partial<CompleteOptions> {
    const previousAiChat = previous?.aiChat;
    const userName = (this.userNameInput?.value ?? previousAiChat?.userName ?? 'USER').trim() || 'USER';
    const partial: Partial<CompleteOptions> = {
      aiChat: {
        includeTimestamps: false,
        userName
      }
    };
    this.persistAiChat(partial);
    return partial;
  }

  private enforceTimestampPolicy(): void {
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
