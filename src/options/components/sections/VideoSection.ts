import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import { DEFAULT_OPTIONS } from '@shared/config';
import { getOptionsController } from '../../app/optionsControllerContext';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import { DaisyButton } from '../shared/DaisyButton';
import { DaisyCard } from '../shared/DaisyCard';
import { DaisyCheckbox } from '../shared/DaisyCheckbox';
import { DaisyInput } from '../shared/DaisyInput';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';

const VIDEO_DEFAULTS = DEFAULT_OPTIONS.video ?? {
  floatingPromptEnabled: true,
  promptButtonLabel: '开启视频笔记',
  promptShortcut: 'Alt+V'
};
const SUPPORTED_VIDEO_PLATFORMS: Array<{ id: string; name: string; description: string }> = [
  {
    id: 'youtube',
    name: 'YouTube',
    description: '支持 watch / short 页面，自动识别浮动提示按钮，点击即可进入视频笔记模式。'
  },
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    description: '支持 BV/AV 视频页，保留弹幕区域空间并附带快捷键提示。'
  }
];

export class VideoSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private floatingPromptToggle: HTMLInputElement | null = null;
  private promptLabelInput: HTMLInputElement | null = null;
  private promptShortcutInput: HTMLInputElement | null = null;
  private formSectionBinding: FormSectionHandlers | null = null;
  private unsubscribeRepo: (() => void) | null = null;

  private readonly handleToggleChange = (): void => {
    const controller = getOptionsController();
    controller?.scheduleAutoSave();
  };

  private readonly handlePromptInputChange = (): void => {
    const controller = getOptionsController();
    controller?.scheduleAutoSave();
  };

  constructor(container: HTMLElement, optionsRepo?: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo ?? resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  }

  protected renderWithState(): HTMLElement {
    this.container.classList.add('aobx-section', 'bg-base-100', 'border', 'border-base-300', 'rounded-lg', 'p-[clamp(22px,2.5vw,32px)]', 'shadow-card');
    const header = this.buildHeader();
    const body = this.buildBody();

    this.container.replaceChildren(header, body);
    this.registerFormIntegration();
    this.subscribeToRepository();
    return this.container;
  }

  override destroy(): void {
    if (this.floatingPromptToggle) {
      this.floatingPromptToggle.removeEventListener('change', this.handleToggleChange);
      this.floatingPromptToggle = null;
    }
    this.promptLabelInput = null;
    this.promptShortcutInput = null;

    if (this.formSectionBinding) {
      const registry = this.requireFormRegistry();
      registry.unregister('video', this.formSectionBinding);
      this.formSectionBinding = null;
    }
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;

    super.destroy();
  }

  private buildHeader(): HTMLElement {
    const header = this.createElement('div', 'grid gap-2 mb-6');

    const titleWrapper = this.createElement('div', 'flex items-center gap-2');
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold text-base-content m-0';
    title.textContent = this.messages?.videoConfigTitle ?? '视频模式';
    titleWrapper.append(title);

    const subtitle = this.createElement('div', 'text-sm text-base-content/60');
    subtitle.textContent =
      this.messages?.videoConfigHint ?? '可在视频网站自动提示进入视频笔记模式';

    header.append(titleWrapper, subtitle);
    return header;
  }

  private buildBody(): HTMLElement {
    const wrapper = this.createElement('div', 'mt-6 space-y-6');
    const settings = this.createElement('div', 'grid gap-6');

    settings.append(
      this.buildFloatingPromptSetting(),
      this.buildPromptCustomizationSetting(),
      this.buildSupportedPlatformsCard(),
      this.buildActionRow()
    );
    wrapper.append(settings);
    return wrapper;
  }

  private buildFloatingPromptSetting(): HTMLElement {
    const setting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0');
    const control = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const checkboxHost = this.createElement('div');
    const checkboxComponent = new DaisyCheckbox(checkboxHost);
    const checkbox = checkboxComponent.render({
      id: 'videoFloatingPrompt',
      label: this.messages?.videoFloatingPromptLabel ?? '在视频网站显示浮动提示按钮'
    });
    control.append(checkboxHost);

    const hint = this.createElement('div', 'w-full text-xs text-base-content/60 mt-1');
    hint.textContent =
      this.messages?.videoFloatingPromptHint ??
      '支持 YouTube 与哔哩哔哩，默认在右下角显示提醒，点击即可开启视频模式。';

    checkbox.addEventListener('change', this.handleToggleChange);
    this.floatingPromptToggle = checkbox;

    setting.append(control, hint);
    return setting;
  }

  private buildPromptCustomizationSetting(): HTMLElement {
    const setting = this.createElement(
      'div',
      'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]'
    );
    const label = this.createElement('div', 'text-sm text-base-content/60 font-semibold');
    label.textContent = this.messages?.videoConfigHint ?? '浮动提示文案与快捷键';

    const controls = this.createElement('div', 'grid gap-4 lg:grid-cols-2');

    const promptLabelControl = this.createElement('div', 'flex flex-col gap-2');
    const promptLabelTitle = this.createElement('div', 'text-sm font-medium text-base-content');
    promptLabelTitle.textContent = this.messages?.videoConfigTitle ?? '提示按钮文案';
    const labelInputHost = this.createElement('div', 'w-full');
    // ✅ Stage 3 Week 3: Migrated video prompt label to DaisyInput (VideoSection)
    const labelInput = new DaisyInput(labelInputHost).render({
      type: 'text',
      variant: 'bordered',
      size: 'md',
      placeholder: '例如：开启视频笔记',
      value: VIDEO_DEFAULTS.promptButtonLabel,
      onChange: () => this.handlePromptInputChange(),
      onBlur: (value) => {
        if (this.promptLabelInput) {
          this.promptLabelInput.value = this.resolvePromptLabel(value);
        }
      }
    });
    labelInput.id = 'videoPromptLabel';
    this.promptLabelInput = labelInput;
    promptLabelControl.append(promptLabelTitle, labelInputHost);
    const promptLabelHint = this.createElement('p', 'text-xs text-base-content/60 m-0');
    promptLabelHint.textContent =
      '将显示在浮动按钮的 aria-label，用于屏幕阅读器与悬浮提示。';
    promptLabelControl.append(promptLabelHint);

    const shortcutControl = this.createElement('div', 'flex flex-col gap-2');
    const shortcutTitle = this.createElement('div', 'text-sm font-medium text-base-content');
    shortcutTitle.textContent = '提示快捷键';
    const shortcutInputHost = this.createElement('div', 'w-full');
    // ✅ Stage 3 Week 3: Migrated video shortcut input to DaisyInput (VideoSection)
    const shortcutInput = new DaisyInput(shortcutInputHost).render({
      type: 'text',
      variant: 'bordered',
      size: 'md',
      placeholder: '例如：Alt+V',
      value: VIDEO_DEFAULTS.promptShortcut,
      onChange: () => this.handlePromptInputChange(),
      onBlur: (value) => {
        if (this.promptShortcutInput) {
          this.promptShortcutInput.value = this.resolvePromptShortcut(value);
        }
      }
    });
    shortcutInput.id = 'videoPromptShortcut';
    this.promptShortcutInput = shortcutInput;
    shortcutControl.append(shortcutTitle, shortcutInputHost);
    const shortcutHint = this.createElement('p', 'text-xs text-base-content/60 m-0');
    shortcutHint.textContent =
      '会显示在悬浮提示中，建议使用 Alt/Cmd 组合键，便于记忆。';
    shortcutControl.append(shortcutHint);

    controls.append(promptLabelControl, shortcutControl);
    setting.append(label, controls);
    return setting;
  }

  private buildSupportedPlatformsCard(): HTMLElement {
    const host = this.createElement('div', 'w-full');
    const card = new DaisyCard(host);
    const body = this.createElement('div', 'space-y-3');
    const list = this.createElement('ul', 'list-none p-0 m-0 space-y-3');
    for (const platform of SUPPORTED_VIDEO_PLATFORMS) {
      const item = this.createElement(
        'li',
        ['flex', 'flex-col', 'gap-1', 'border', 'border-base-300', 'rounded-lg', 'p-3'].join(' ')
      );
      const title = this.createElement(
        'span',
        ['text-sm', 'font-semibold', 'text-base-content', 'flex', 'items-center', 'gap-2'].join(' ')
      );
      title.textContent = platform.name;
      const badge = this.createElement(
        'span',
        [
          'text-[11px]',
          'uppercase',
          'tracking-wide',
          'bg-base-200',
          'text-base-content/70',
          'px-2',
          'py-0.5',
          'rounded-full'
        ].join(' ')
      );
      badge.textContent = 'SUPPORTED';
      title.append(badge);
      const description = this.createElement('p', 'text-xs text-base-content/70 m-0 leading-relaxed');
      description.textContent = platform.description;
      item.append(title, description);
      list.append(item);
    }
    body.append(list);
    card.render({
      title: '已适配平台',
      body
    });
    return host;
  }

  private buildActionRow(): HTMLElement {
    const actions = this.createElement(
      'div',
      ['flex', 'flex-wrap', 'gap-3', 'items-center', 'border-t', 'border-base-300', 'pt-4'].join(' ')
    );

    const enableHost = this.createElement('div');
    new DaisyButton(enableHost).render({
      label: '启用视频笔记',
      variant: 'primary',
      size: 'sm',
      iconName: 'Play',
      onClick: () => {
        if (this.floatingPromptToggle) {
          this.floatingPromptToggle.checked = true;
        }
        this.handleToggleChange();
      }
    });

    const saveHost = this.createElement('div');
    new DaisyButton(saveHost).render({
      label: '保存视频配置',
      variant: 'secondary',
      size: 'sm',
      iconName: 'Save',
      onClick: () => {
        const controller = getOptionsController();
        controller?.scheduleAutoSave();
      }
    });

    actions.append(enableHost, saveHost);
    return actions;
  }

  private applySnapshot(options: StoredOptions): void {
    const video = options.video;
    if (this.floatingPromptToggle) {
      this.floatingPromptToggle.checked = video?.floatingPromptEnabled ?? true;
    }
    if (this.promptLabelInput) {
      this.promptLabelInput.value = this.resolvePromptLabel(video?.promptButtonLabel);
    }
    if (this.promptShortcutInput) {
      this.promptShortcutInput.value = this.resolvePromptShortcut(video?.promptShortcut);
    }
  }

  private collectChanges(previous: StoredOptions | null): Partial<CompleteOptions> {
    const previousVideo = previous?.video;
    const floatingPromptEnabled = this.floatingPromptToggle?.checked ?? previousVideo?.floatingPromptEnabled ?? true;
    const promptButtonLabel = this.resolvePromptLabel(this.promptLabelInput?.value ?? previousVideo?.promptButtonLabel);
    const promptShortcut = this.resolvePromptShortcut(this.promptShortcutInput?.value ?? previousVideo?.promptShortcut);

    const partial: Partial<CompleteOptions> = {
      video: {
        floatingPromptEnabled,
        promptButtonLabel,
        promptShortcut
      }
    };
    this.persistVideo(partial);
    return partial;
  }

  private registerFormIntegration(): void {
    const registry = this.requireFormRegistry();
    if (this.formSectionBinding) {
      registry.unregister('video', this.formSectionBinding);
    }

    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    };

    registry.register('video', binding);
    this.formSectionBinding = binding;
  }

  private resolvePromptLabel(input?: string): string {
    const trimmed = input?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : VIDEO_DEFAULTS.promptButtonLabel;
  }

  private resolvePromptShortcut(input?: string): string {
    const trimmed = input?.trim();
    const normalized = trimmed ? trimmed.toUpperCase() : '';
    return normalized.length > 0 ? normalized : VIDEO_DEFAULTS.promptShortcut;
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = this.optionsRepo.onChange((options) => {
      this.applySnapshot(options);
    });
  }

  private persistVideo(partial: Partial<CompleteOptions>): void {
    void this.optionsRepo
      .set(partial)
      .catch((error) => {
        console.error('[VideoSection] Failed to persist video options via repository:', error);
      });
  }
}
