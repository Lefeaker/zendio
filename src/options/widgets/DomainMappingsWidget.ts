import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { BaseWidgetProps, WidgetMountContract, WidgetRuntime } from './contracts';
import { clearWidgetContainer, createElement, notifyWidgetDirty } from './utils';

export interface DomainMappingsWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class DomainMappingsWidget
  implements WidgetMountContract<DomainMappingsWidgetProps, Partial<CompleteOptions>>
{
  private container: HTMLElement | null = null;
  private runtime: WidgetRuntime | undefined;
  private rows: Array<{ domain: HTMLInputElement; alias: HTMLInputElement }> = [];
  private snapshot = mergeOptions(null) as CompleteOptions;

  mount(container: HTMLElement, props: DomainMappingsWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.runtime = runtime;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  update(props: DomainMappingsWidgetProps, runtime?: WidgetRuntime): void {
    this.runtime = runtime ?? this.runtime;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  destroy(): void {
    clearWidgetContainer(this.container);
    this.container = null;
    this.rows = [];
  }

  collect(): Partial<CompleteOptions> {
    const domainMappings: Record<string, string> = {};
    this.rows.forEach(({ domain, alias }) => {
      const key = domain.value.trim();
      if (key) {
        domainMappings[key] = alias.value.trim();
      }
    });
    return { domainMappings };
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | null | undefined): void {
    this.snapshot = mergeOptions(snapshot ?? null) as CompleteOptions;
  }

  private render(): void {
    if (!this.container) {
      return;
    }
    clearWidgetContainer(this.container);
    this.rows = [];
    const root = createElement('div', 'schema-widget-stack domain-mappings-widget');
    const entries = Object.entries(this.snapshot.domainMappings);
    const source = entries.length ? entries : [['', '']];

    source.forEach(([domainValue, aliasValue]) => {
      const row = createElement('div', 'schema-widget-row domain-mapping-row');
      const domain = createElement('input', 'field-domain');
      domain.value = domainValue;
      domain.placeholder = 'example.com';
      const alias = createElement('input', 'field-name');
      alias.value = aliasValue;
      alias.placeholder = 'Folder alias';
      const markDirty = (): void => notifyWidgetDirty(this.runtime, ['domainMappings']);
      domain.addEventListener('input', markDirty);
      alias.addEventListener('input', markDirty);
      row.append(domain, alias);
      root.append(row);
      this.rows.push({ domain, alias });
    });

    this.container.append(root);
  }
}
