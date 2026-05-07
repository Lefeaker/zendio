import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { BaseWidgetProps, WidgetMountContract, WidgetRuntime } from './contracts';
import { clearWidgetContainer, createElement, notifyWidgetDirty } from './utils';

export interface FragmentSettingsWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class FragmentSettingsWidget
  implements WidgetMountContract<FragmentSettingsWidgetProps, Partial<CompleteOptions>>
{
  private container: HTMLElement | null = null;
  private runtime: WidgetRuntime | undefined;
  private snapshot = mergeOptions(null) as CompleteOptions;
  private contextLengthInput: HTMLInputElement | null = null;

  mount(container: HTMLElement, props: FragmentSettingsWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.runtime = runtime;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  update(props: FragmentSettingsWidgetProps, runtime?: WidgetRuntime): void {
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
      fragmentClipper: {
        ...this.snapshot.fragmentClipper,
        contextLength:
          Number(this.contextLengthInput?.value) || this.snapshot.fragmentClipper.contextLength
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
    this.contextLengthInput = createElement('input', 'fragment-context-length');
    this.contextLengthInput.type = 'number';
    this.contextLengthInput.value = String(this.snapshot.fragmentClipper.contextLength);
    this.contextLengthInput.addEventListener('input', () =>
      notifyWidgetDirty(this.runtime, ['fragmentClipper'])
    );
    this.container.append(this.contextLengthInput);
  }
}
