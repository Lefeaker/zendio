import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { BaseWidgetProps, WidgetMountContract, WidgetRuntime } from './contracts';
import { clearWidgetContainer, createElement, notifyWidgetDirty } from './utils';

export interface VideoSettingsWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class VideoSettingsWidget
  implements WidgetMountContract<VideoSettingsWidgetProps, Partial<CompleteOptions>>
{
  private container: HTMLElement | null = null;
  private runtime: WidgetRuntime | undefined;
  private snapshot = mergeOptions(null) as CompleteOptions;
  private labelInput: HTMLInputElement | null = null;
  private shortcutInput: HTMLInputElement | null = null;

  mount(container: HTMLElement, props: VideoSettingsWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.runtime = runtime;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  update(props: VideoSettingsWidgetProps, runtime?: WidgetRuntime): void {
    this.runtime = runtime ?? this.runtime;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  destroy(): void {
    clearWidgetContainer(this.container);
    this.container = null;
  }

  collect(): Partial<CompleteOptions> {
    return {
      video: {
        ...this.snapshot.video,
        promptButtonLabel: this.labelInput?.value ?? this.snapshot.video.promptButtonLabel,
        promptShortcut: this.shortcutInput?.value ?? this.snapshot.video.promptShortcut
      }
    };
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | null | undefined): void {
    this.snapshot = mergeOptions(snapshot ?? null) as CompleteOptions;
  }

  private render(): void {
    if (!this.container) {
      return;
    }
    clearWidgetContainer(this.container);
    const root = createElement('div', 'schema-widget-stack video-settings-widget');
    this.labelInput = createElement('input', 'video-prompt-label');
    this.labelInput.value = this.snapshot.video.promptButtonLabel;
    this.shortcutInput = createElement('input', 'video-prompt-shortcut');
    this.shortcutInput.value = this.snapshot.video.promptShortcut;
    const markDirty = (): void => notifyWidgetDirty(this.runtime, ['video']);
    this.labelInput.addEventListener('input', markDirty);
    this.shortcutInput.addEventListener('input', markDirty);
    root.append(this.labelInput, this.shortcutInput);
    this.container.append(root);
  }
}
