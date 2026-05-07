import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { BaseWidgetProps, WidgetMountContract, WidgetRuntime } from './contracts';
import { clearWidgetContainer, createElement, notifyWidgetDirty } from './utils';

export interface RestStorageWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class RestStorageWidget
  implements WidgetMountContract<RestStorageWidgetProps, Partial<CompleteOptions>>
{
  private container: HTMLElement | null = null;
  private runtime: WidgetRuntime | undefined;
  private snapshot = mergeOptions(null) as CompleteOptions;
  private vaultInput: HTMLInputElement | null = null;
  private httpsInput: HTMLInputElement | null = null;
  private httpInput: HTMLInputElement | null = null;
  private apiKeyInput: HTMLInputElement | null = null;
  private rootDirInput: HTMLInputElement | null = null;

  mount(container: HTMLElement, props: RestStorageWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.runtime = runtime;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  update(props: RestStorageWidgetProps, runtime?: WidgetRuntime): void {
    this.runtime = runtime ?? this.runtime;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  destroy(): void {
    clearWidgetContainer(this.container);
    this.container = null;
  }

  collect(): Partial<CompleteOptions> {
    const httpsUrl = this.httpsInput?.value.trim() || this.snapshot.rest.httpsUrl;
    const httpUrl = this.httpInput?.value.trim() || this.snapshot.rest.httpUrl;
    return {
      rest: {
        ...this.snapshot.rest,
        baseUrl: httpsUrl || httpUrl || this.snapshot.rest.baseUrl,
        vault: this.vaultInput?.value.trim() || this.snapshot.rest.vault,
        apiKey: this.apiKeyInput?.value ?? this.snapshot.rest.apiKey,
        ...(httpsUrl ? { httpsUrl } : {}),
        ...(httpUrl ? { httpUrl } : {}),
        ...(this.rootDirInput?.value ? { rootDir: this.rootDirInput.value } : {})
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
    const root = createElement('div', 'schema-widget-stack rest-storage-widget');
    this.vaultInput = this.input(this.snapshot.rest.vault, 'Vault name');
    this.httpsInput = this.input(this.snapshot.rest.httpsUrl ?? '', 'HTTPS URL');
    this.httpInput = this.input(this.snapshot.rest.httpUrl ?? '', 'HTTP URL');
    this.apiKeyInput = this.input(this.snapshot.rest.apiKey, 'API key');
    this.apiKeyInput.type = 'password';
    this.rootDirInput = this.input(this.snapshot.rest.rootDir ?? '', 'Root directory');
    root.append(
      this.vaultInput,
      this.httpsInput,
      this.httpInput,
      this.apiKeyInput,
      this.rootDirInput
    );
    this.container.append(root);
  }

  private input(value: string, placeholder: string): HTMLInputElement {
    const input = createElement('input', 'rest-field');
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener('input', () => notifyWidgetDirty(this.runtime, ['rest']));
    return input;
  }
}
