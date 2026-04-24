import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';
import type { CompleteOptions, StoredOptions, VideoOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import type { BaseWidgetProps, WidgetMountContract, WidgetRuntime } from './contracts';
import { asOptionsSnapshot, clearWidgetContainer, createElement, notifyWidgetDirty } from './utils';

const VIDEO_DEFAULTS: VideoOptions = DEFAULT_OPTIONS.video ?? {
  floatingPromptEnabled: true,
  promptButtonLabel: '开启视频笔记',
  promptShortcut: 'Alt+V'
};

type VideoPlatform = 'youtube' | 'bilibili';
const VIDEO_PLATFORMS: readonly VideoPlatform[] = ['youtube', 'bilibili'];

export interface VideoSettingsWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class VideoSettingsWidget
  implements
    WidgetMountContract<
      VideoSettingsWidgetProps,
      Partial<CompleteOptions>,
      StoredOptions | CompleteOptions | null
    >
{
  private container: HTMLElement | null = null;
  private props: VideoSettingsWidgetProps = {};
  private runtime: WidgetRuntime | undefined;
  private floatingPromptToggle: HTMLInputElement | null = null;
  private promptLabelInput: HTMLInputElement | null = null;
  private promptShortcutInput: HTMLInputElement | null = null;
  private promptPosition: VideoOptions['promptPosition'] | null = null;
  private unsubscribeRepo: (() => void) | null = null;

  constructor(private readonly optionsRepository?: IOptionsRepository) {}

  mount(container: HTMLElement, props: VideoSettingsWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.props = props;
    this.runtime = runtime;
    this.render();
    this.applySnapshot(props.options ?? null);
    this.subscribeToRepository();
  }

  update(props: VideoSettingsWidgetProps, runtime?: WidgetRuntime): void {
    const draft = this.collect();
    this.props = props;
    this.runtime = runtime ?? this.runtime;
    this.render();
    this.applySnapshot({ ...(props.options ?? {}), ...draft } as StoredOptions);
  }

  destroy(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    clearWidgetContainer(this.container);
    this.container = null;
    this.floatingPromptToggle = null;
    this.promptLabelInput = null;
    this.promptShortcutInput = null;
    this.promptPosition = null;
  }

  collect(): Partial<CompleteOptions> {
    return {
      video: {
        floatingPromptEnabled:
          this.floatingPromptToggle?.checked ?? VIDEO_DEFAULTS.floatingPromptEnabled,
        promptButtonLabel: this.resolvePromptLabel(this.promptLabelInput?.value),
        promptShortcut: this.resolvePromptShortcut(this.promptShortcutInput?.value)
      }
    };
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | null): void {
    const options = asOptionsSnapshot(snapshot);
    const video = options.video ?? VIDEO_DEFAULTS;

    if (this.floatingPromptToggle) {
      this.floatingPromptToggle.checked =
        video.floatingPromptEnabled ?? VIDEO_DEFAULTS.floatingPromptEnabled;
    }
    if (this.promptLabelInput) {
      this.promptLabelInput.value = this.resolvePromptLabel(video.promptButtonLabel);
    }
    if (this.promptShortcutInput) {
      this.promptShortcutInput.value = this.resolvePromptShortcut(video.promptShortcut);
    }
    this.promptPosition = video.promptPosition ?? null;
  }

  private render(): void {
    if (!this.container) {
      return;
    }

    this.promptPosition = asOptionsSnapshot(this.props.options).video?.promptPosition ?? null;
    const root = createElement('div', 'schema-widget-stack');
    root.append(
      this.buildFloatingPromptRow(),
      this.buildPromptCustomizationRow(),
      this.buildSupportedPlatformsRow(),
      this.buildAdvancedPromptSchema()
    );
    this.container.replaceChildren(root);
  }

  private buildFloatingPromptRow(): HTMLElement {
    const row = createElement('div', 'schema-row');
    const label = createElement('div', 'schema-row-label');
    label.append(createElement('strong', undefined, undefined), createElement('span'));
    label.querySelector('strong')!.textContent =
      this.props.messages?.videoFloatingPromptLabel ?? '在视频网站显示浮动提示按钮';
    label.querySelector('span')!.textContent =
      this.props.messages?.videoFloatingPromptHint ??
      '支持 YouTube 与哔哩哔哩，默认在右下角显示提醒。';

    const control = createElement('div', 'schema-row-control');
    const switchLine = createElement('label', 'schema-switch-line');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'schema-switch-input';
    input.addEventListener('change', () => this.markDirty());
    this.floatingPromptToggle = input;
    switchLine.append(
      input,
      createElement('span', 'schema-switch-slider'),
      createElement('span', 'schema-switch-state')
    );
    switchLine.querySelector('.schema-switch-state')!.textContent =
      this.props.messages?.schemaCommonEnabledState ?? 'Enabled';
    control.append(switchLine);
    row.append(label, control);
    return row;
  }

  private buildPromptCustomizationRow(): HTMLElement {
    const row = createElement('div', 'schema-row');
    const label = createElement('div', 'schema-row-label');
    const title = document.createElement('strong');
    title.textContent =
      this.props.messages?.videoPromptCustomizationTitle ?? '浮动提示文案与快捷键';
    const description = document.createElement('span');
    description.textContent =
      this.props.messages?.videoPromptShortcutHint ??
      'promptButtonLabel 与 promptShortcut 会一起显示在视频模式入口提示里。';
    label.append(title, description);

    const control = createElement('div', 'schema-row-control');
    const grid = createElement('div', 'schema-inline-grid two');
    grid.append(
      this.buildTextField(
        this.props.messages?.videoPromptLabelTitle ?? '提示按钮文案',
        this.props.messages?.videoPromptLabelHint ??
          '将显示在浮动按钮的 aria-label，用于屏幕阅读器与悬浮提示。',
        this.props.messages?.videoPromptLabelPlaceholder ?? '例如：开启视频笔记',
        (input) => {
          this.promptLabelInput = input;
        }
      ),
      this.buildTextField(
        this.props.messages?.videoPromptShortcutTitle ?? '提示快捷键',
        this.props.messages?.videoPromptShortcutHint ??
          '会显示在悬浮提示中，建议使用 Alt/Cmd 组合键。',
        this.props.messages?.videoPromptShortcutPlaceholder ?? '例如：Alt+V',
        (input) => {
          this.promptShortcutInput = input;
        },
        () => {
          if (this.promptShortcutInput) {
            this.promptShortcutInput.value = this.resolvePromptShortcut(
              this.promptShortcutInput.value
            );
          }
        }
      )
    );
    control.append(grid);
    row.append(label, control);
    return row;
  }

  private buildTextField(
    labelText: string,
    hintText: string,
    placeholder: string,
    register: (input: HTMLInputElement) => void,
    onBlur?: () => void
  ): HTMLElement {
    const field = createElement('div', 'schema-field');
    const label = createElement('label', 'schema-field-label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'schema-input';
    input.placeholder = placeholder;
    input.addEventListener('input', () => this.markDirty());
    if (onBlur) {
      input.addEventListener('blur', onBlur);
    }
    const hint = createElement('div', 'schema-widget-hint');
    hint.textContent = hintText;
    register(input);
    field.append(label, input, hint);
    return field;
  }

  private buildSupportedPlatformsRow(): HTMLElement {
    const row = createElement('div', 'schema-row');
    const label = createElement('div', 'schema-row-label');
    const title = document.createElement('strong');
    title.textContent = this.props.messages?.videoSupportedPlatformsTitle ?? '已适配平台';
    const description = document.createElement('span');
    description.textContent =
      this.props.messages?.videoFloatingPromptHint ??
      '当前正式实现与 preview 一样保留 YouTube 与哔哩哔哩两条来源卡片。';
    label.append(title, description);

    const control = createElement('div', 'schema-row-control');
    const grid = createElement('div', 'schema-mini-grid');
    VIDEO_PLATFORMS.forEach((platform) => {
      const item = createElement('div', 'schema-mini-card schema-widget-platform');
      const strong = document.createElement('strong');
      strong.textContent = this.resolvePlatformName(platform);
      const badge = createElement('span', 'schema-pill');
      badge.textContent = this.props.messages?.videoPlatformSupportedBadge ?? 'SUPPORTED';
      const copy = document.createElement('p');
      copy.textContent = this.resolvePlatformDescription(platform);
      item.append(strong, badge, copy);
      grid.append(item);
    });
    control.append(grid);
    row.append(label, control);
    return row;
  }

  private buildAdvancedPromptSchema(): HTMLElement {
    const details = document.createElement('details');
    details.className = 'schema-details';

    const summary = document.createElement('summary');
    summary.className = 'schema-details-summary';
    summary.textContent = 'Advanced Video Schema';
    details.append(summary);

    const body = createElement('div', 'schema-inline-grid three');
    body.append(
      this.buildReadonlyField('promptPosition.x', this.promptPosition?.x),
      this.buildReadonlyField('promptPosition.y', this.promptPosition?.y),
      this.buildReadonlyField(
        'Status',
        this.promptPosition
          ? 'Position retained from runtime config.'
          : 'Optional. No saved prompt position.'
      )
    );
    details.append(body);
    return details;
  }

  private buildReadonlyField(labelText: string, value: string | number | undefined): HTMLElement {
    const field = createElement('div', 'schema-inline-field');
    const label = document.createElement('span');
    label.textContent = labelText;
    const note = createElement('div', 'schema-inline-note');
    note.textContent = value === undefined ? 'Pending' : String(value);
    field.append(label, note);
    return field;
  }

  private resolvePlatformName(platform: VideoPlatform): string {
    return platform === 'youtube'
      ? (this.props.messages?.videoPlatformYoutubeName ?? 'YouTube')
      : (this.props.messages?.videoPlatformBilibiliName ?? '哔哩哔哩');
  }

  private resolvePlatformDescription(platform: VideoPlatform): string {
    return platform === 'youtube'
      ? (this.props.messages?.videoPlatformYoutubeDescription ??
          '支持 watch / short 页面，自动识别浮动提示按钮，点击即可进入视频笔记模式。')
      : (this.props.messages?.videoPlatformBilibiliDescription ??
          '支持 BV/AV 视频页，保留弹幕区域空间并附带快捷键提示。');
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

  private markDirty(): void {
    notifyWidgetDirty(this.runtime, ['video']);
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo =
      this.optionsRepository?.onChange((options) => {
        this.applySnapshot(options);
      }) ?? null;
  }
}
