import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { RoutingRule, VaultRouterConfig } from '@shared/types/vault';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { BaseWidgetProps, WidgetMountContract, WidgetRuntime } from './contracts';
import { clearWidgetContainer, createElement, notifyWidgetDirty } from './utils';

export interface VaultRouterWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class VaultRouterWidget
  implements WidgetMountContract<VaultRouterWidgetProps, Partial<CompleteOptions>>
{
  private container: HTMLElement | null = null;
  private runtime: WidgetRuntime | undefined;
  private snapshot = mergeOptions(null) as CompleteOptions;
  private patternInputs: HTMLInputElement[] = [];

  mount(container: HTMLElement, props: VaultRouterWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.runtime = runtime;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  update(props: VaultRouterWidgetProps, runtime?: WidgetRuntime): void {
    this.runtime = runtime ?? this.runtime;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  destroy(): void {
    clearWidgetContainer(this.container);
    this.container = null;
    this.patternInputs = [];
  }

  collect(): Partial<CompleteOptions> {
    const base: VaultRouterConfig = this.snapshot.vaultRouter ?? {
      vaults: []
    };
    const rules: RoutingRule[] = this.patternInputs.map((input, index) => ({
      id: `rule-${index}`,
      vaultId: base.defaultVaultId ?? base.vaults[0]?.id ?? 'default',
      type: 'domain',
      pattern: input.value,
      enabled: true,
      priority: (index + 1) * 10
    }));
    return {
      vaultRouter: {
        ...base,
        rules
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
    this.patternInputs = [];
    const root = createElement('div', 'schema-widget-stack vault-router-widget');
    const rules = this.snapshot.vaultRouter?.rules ?? [];
    (rules.length ? rules : [{ pattern: '' }]).forEach((rule) => {
      const input = createElement('input', 'routing-pattern');
      input.value = rule.pattern;
      input.placeholder = 'example.com';
      input.addEventListener('input', () => notifyWidgetDirty(this.runtime, ['vaultRouter']));
      this.patternInputs.push(input);
      root.append(input);
    });
    this.container.append(root);
  }
}
