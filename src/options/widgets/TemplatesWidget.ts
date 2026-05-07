import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { BaseWidgetProps, WidgetMountContract, WidgetRuntime } from './contracts';
import { clearWidgetContainer, createElement, notifyWidgetDirty } from './utils';

export interface TemplatesWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class TemplatesWidget
  implements WidgetMountContract<TemplatesWidgetProps, Partial<CompleteOptions>>
{
  private container: HTMLElement | null = null;
  private runtime: WidgetRuntime | undefined;
  private snapshot = mergeOptions(null) as CompleteOptions;
  private articleInput: HTMLInputElement | null = null;
  private fragmentInput: HTMLInputElement | null = null;
  private readingInput: HTMLInputElement | null = null;
  private aiInput: HTMLInputElement | null = null;
  private readingModeSelect: HTMLSelectElement | null = null;

  mount(container: HTMLElement, props: TemplatesWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.runtime = runtime;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  update(props: TemplatesWidgetProps, runtime?: WidgetRuntime): void {
    this.runtime = runtime ?? this.runtime;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  destroy(): void {
    clearWidgetContainer(this.container);
    this.container = null;
  }

  collect(): Partial<CompleteOptions> {
    const article = this.articleInput?.value ?? this.snapshot.templates.article;
    const fragment = this.fragmentInput?.value ?? this.snapshot.templates.fragment;
    const mode = this.readingModeSelect?.value ?? 'custom';
    const reading =
      mode === 'article'
        ? article
        : mode === 'fragment'
          ? fragment
          : (this.readingInput?.value ?? this.snapshot.templates.reading);

    return {
      templates: {
        article,
        fragment,
        reading,
        ai: this.aiInput?.value ?? this.snapshot.templates.ai
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
    const root = createElement('div', 'schema-widget-stack templates-widget');
    this.articleInput = this.buildInput(
      this.snapshot.templates.article,
      'Article / video template'
    );
    this.fragmentInput = this.buildInput(this.snapshot.templates.fragment, 'Fragment template');
    this.readingModeSelect = this.buildReadingModeSelect();
    this.readingInput = this.buildInput(this.snapshot.templates.reading, 'Reading template');
    this.aiInput = this.buildInput(this.snapshot.templates.ai, 'AI chat template');
    root.append(
      this.articleInput,
      this.fragmentInput,
      this.readingModeSelect,
      this.readingInput,
      this.aiInput
    );
    this.container.append(root);
  }

  private buildInput(value: string, placeholder: string): HTMLInputElement {
    const input = createElement('input', 'template-input');
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener('input', () => notifyWidgetDirty(this.runtime, ['templates']));
    return input;
  }

  private buildReadingModeSelect(): HTMLSelectElement {
    const select = createElement('select', 'reading-template-mode');
    [
      ['article', 'Same as article'],
      ['fragment', 'Same as fragment'],
      ['custom', 'Custom']
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.append(option);
    });
    select.value =
      this.snapshot.templates.reading === this.snapshot.templates.article
        ? 'article'
        : this.snapshot.templates.reading === this.snapshot.templates.fragment
          ? 'fragment'
          : 'custom';
    select.addEventListener('change', () => notifyWidgetDirty(this.runtime, ['templates']));
    return select;
  }
}
