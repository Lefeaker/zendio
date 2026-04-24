import type { Messages } from '@i18n';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { RoutingRuleType, VaultConfig, RoutingRule } from '@shared/types/vault';
import type { IOptionsRepository } from '@shared/repositories';
import { VaultRouterController } from '@options/components/controls/vaultRouterController';
import { VaultRouterView } from '@ui/domains/vault-router';
import {
  subscribeVaultRouter,
  getVaultRouterConfig,
  initializeVaultRouterStore
} from '@options/state/vaultRouterStore';
import type { WidgetMountContract, WidgetRuntime, BaseWidgetProps } from './contracts';
import { asOptionsSnapshot, createElement } from './utils';

export interface VaultRouterWidgetDependencies {
  optionsRepository?: IOptionsRepository;
}

export interface VaultRouterWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class VaultRouterWidget
  implements
    WidgetMountContract<
      VaultRouterWidgetProps,
      Partial<CompleteOptions>,
      StoredOptions | CompleteOptions | null
    >
{
  private readonly deps: VaultRouterWidgetDependencies;
  private runtime: WidgetRuntime | undefined;
  private props: VaultRouterWidgetProps = {};
  private container: HTMLElement | null = null;
  private viewHost: HTMLElement | null = null;
  private noteHost: HTMLElement | null = null;
  private view: VaultRouterView | null = null;
  private controller = new VaultRouterController();
  private unsubscribeVaultStore: (() => void) | null = null;
  private unsubscribeRepo: (() => void) | null = null;

  constructor(dependencies: VaultRouterWidgetDependencies = {}) {
    this.deps = dependencies;
  }

  mount(container: HTMLElement, props: VaultRouterWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.props = props;
    this.runtime = runtime;
    this.controller.render({
      autoSave: false,
      onChange: () => {
        this.runtime?.notifyDirty?.(['vaultRouter']);
      }
    });
    this.render();
    this.mountView();
    this.subscribeStores();
    if (props.options) {
      this.applySnapshot(props.options);
    } else {
      const snapshot = getVaultRouterConfig();
      this.renderRoutingState(snapshot?.vaults ?? [], snapshot?.defaultVaultId);
    }
  }

  update(props: VaultRouterWidgetProps, runtime?: WidgetRuntime): void {
    this.props = props;
    this.runtime = runtime ?? this.runtime;
    this.mountView();
    if (props.options) {
      this.applySnapshot(props.options);
    } else {
      const snapshot = getVaultRouterConfig();
      this.renderRoutingState(snapshot?.vaults ?? [], snapshot?.defaultVaultId);
    }
  }

  destroy(): void {
    this.unsubscribeVaultStore?.();
    this.unsubscribeVaultStore = null;
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    this.view?.destroy();
    this.view = null;
    this.viewHost = null;
    this.noteHost = null;
    this.controller.dispose();
    this.container = null;
  }

  collect(): Partial<CompleteOptions> {
    const config = getVaultRouterConfig();
    return config ? { vaultRouter: config } : {};
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | null): void {
    const options = asOptionsSnapshot(snapshot);
    initializeVaultRouterStore(options.vaultRouter ?? null);
    const current = getVaultRouterConfig();
    this.renderRoutingState(current?.vaults ?? [], current?.defaultVaultId);
  }

  private render(): void {
    if (!this.container) {
      return;
    }
    const wrapper = createElement(
      'div',
      'schema-widget-stack schema-storage-widget-shell schema-storage-routing-shell'
    );
    wrapper.append(this.buildHeader());
    this.viewHost = createElement('div', 'schema-table-wrap schema-storage-routing-view');
    this.noteHost = createElement('p', 'schema-widget-note schema-storage-routing-note');
    this.noteHost.textContent =
      this.props.messages?.routingRulesPriorityNote ??
      '提示：优先级越高越先匹配，目标仓库需保持启用。';
    wrapper.append(this.viewHost, this.noteHost);
    this.container.replaceChildren(wrapper);
  }

  private mountView(): void {
    if (!this.viewHost) {
      return;
    }
    this.view?.destroy();
    this.view = new VaultRouterView(this.viewHost);
    if (this.props.messages) {
      this.view.setMessages(this.props.messages);
    }
    this.view.render({
      labels: this.buildLabels(this.props.messages),
      onAddRule: this.handleAddRule,
      onToggleEnabled: this.handleToggleRuleEnabled,
      onChangeType: this.handleChangeRuleType,
      onChangePattern: this.handleChangeRulePattern,
      onChangeTarget: this.handleChangeRuleTarget,
      onChangePriority: this.handleChangeRulePriority,
      onRemoveRule: this.handleRemoveRule
    });
    this.decorateViewShell();
  }

  private subscribeStores(): void {
    this.unsubscribeVaultStore?.();
    this.unsubscribeVaultStore = subscribeVaultRouter((state) => {
      this.renderRoutingState(state.vaults, state.defaultVaultId);
    });
    this.unsubscribeRepo?.();
    if (this.deps.optionsRepository) {
      this.unsubscribeRepo = this.deps.optionsRepository.onChange((options) => {
        initializeVaultRouterStore(options.vaultRouter ?? null);
      });
    }
  }

  private renderRoutingState(vaults: VaultConfig[], defaultVaultId?: string): void {
    const rules: RoutingRule[] = [];
    for (const vault of vaults) {
      for (const rule of vault.rules ?? []) {
        rules.push(rule);
      }
    }
    const defaultId =
      defaultVaultId ?? vaults.find((vault) => vault.isDefault)?.id ?? vaults[0]?.id ?? '';
    const defaultBadge = this.props.messages?.defaultVaultBadge ?? '默认仓库';
    const vaultOptions = vaults.map((vault) => {
      const trimmedName = vault.name?.trim() ?? '';
      const trimmedVault = vault.vault?.trim() ?? '';
      const isDefaultVault = vault.id === defaultId || vault.isDefault === true;
      const displayName = isDefaultVault
        ? trimmedVault || trimmedName || defaultBadge
        : trimmedName || trimmedVault || vault.id;
      return {
        id: vault.id,
        name: displayName,
        disabled: vault.enabled === false
      };
    });
    this.view?.update({
      rules,
      vaultOptions,
      ...(defaultId ? { defaultVaultId: defaultId } : {})
    });
  }

  private buildLabels(messages?: Messages | null): {
    enabled: string;
    type: string;
    pattern: string;
    targetVault: string;
    priority: string;
    actions: string;
    addRule: string;
    deleteRule: string;
    empty: string;
    patternPlaceholder: string;
    defaultVaultBadge: string;
    typeDomain: string;
    typeKeyword: string;
    typeUrlPattern: string;
    enabledAria: string;
    typeAria: string;
    patternAria: string;
    targetAria: string;
    priorityAria: string;
  } {
    return {
      enabled: messages?.ruleEnabledLabel ?? '启用',
      type: messages?.ruleTypeLabel ?? '规则类型',
      pattern: messages?.rulePatternLabel ?? '匹配模式',
      targetVault: messages?.ruleTargetVaultLabel ?? '目标仓库',
      priority: messages?.rulePriorityLabel ?? '优先级',
      actions: messages?.yamlFieldActionsLabel ?? '操作',
      addRule: messages?.addRuleButton ?? '+ 添加规则',
      deleteRule: messages?.deleteRuleButton ?? '删除',
      empty: messages?.ruleEmptyPlaceholder ?? '暂无规则，点击右侧按钮为仓库添加规则',
      patternPlaceholder:
        messages?.rulePatternPlaceholder ?? '例如：example.com;news.example.com 或 关键词1,关键词2',
      defaultVaultBadge: messages?.defaultVaultBadge ?? '默认仓库',
      typeDomain: messages?.ruleTypeDomain ?? '域名匹配',
      typeKeyword: messages?.ruleTypeKeyword ?? '关键词匹配',
      typeUrlPattern: messages?.ruleTypeUrlPattern ?? 'URL 模式',
      enabledAria: messages?.ruleEnabledLabel ?? '启用规则',
      typeAria: messages?.ruleTypeLabel ?? '规则类型',
      patternAria: messages?.rulePatternLabel ?? '匹配模式',
      targetAria: messages?.ruleTargetVaultLabel ?? '目标仓库',
      priorityAria: messages?.rulePriorityLabel ?? '优先级'
    };
  }

  private handleAddRule = (): void => {
    const snapshot = getVaultRouterConfig();
    const defaultVaultId =
      snapshot?.defaultVaultId ??
      snapshot?.vaults?.find((vault) => vault.isDefault)?.id ??
      snapshot?.vaults?.[0]?.id;
    this.controller.addRule(defaultVaultId ? { vaultId: defaultVaultId } : {});
    this.runtime?.notifyDirty?.(['vaultRouter']);
  };

  private handleToggleRuleEnabled = (ruleId: string, enabled: boolean): void => {
    this.controller.updateRule(ruleId, { enabled });
    this.runtime?.notifyDirty?.(['vaultRouter']);
  };

  private handleChangeRuleType = (ruleId: string, type: RoutingRuleType): void => {
    this.controller.updateRule(ruleId, { type });
    this.runtime?.notifyDirty?.(['vaultRouter']);
  };

  private handleChangeRulePattern = (ruleId: string, pattern: string): void => {
    this.controller.updateRule(ruleId, { pattern });
    this.runtime?.notifyDirty?.(['vaultRouter']);
  };

  private handleChangeRuleTarget = (ruleId: string, vaultId: string): void => {
    this.controller.updateRule(ruleId, { vaultId });
    this.runtime?.notifyDirty?.(['vaultRouter']);
  };

  private handleChangeRulePriority = (ruleId: string, priority: number): void => {
    this.controller.updateRule(ruleId, { priority });
    this.runtime?.notifyDirty?.(['vaultRouter']);
  };

  private decorateViewShell(): void {
    if (!this.viewHost) {
      return;
    }

    const surface = this.viewHost.querySelector<HTMLElement>('[data-role="vault-router-view"]');
    surface?.classList.add('schema-storage-routing-surface');

    const controls = this.viewHost.querySelector<HTMLElement>('[data-role="routing-controls"]');
    controls?.classList.add('schema-output-toolbar');
  }

  private handleRemoveRule = (ruleId: string): void => {
    this.controller.removeRule(ruleId);
    this.runtime?.notifyDirty?.(['vaultRouter']);
  };

  private buildHeader(): HTMLElement {
    const header = createElement('div', 'schema-card-header schema-output-widget-header');
    const copy = createElement('div');
    const title = createElement('h3');
    title.textContent = this.props.messages?.routingRulesTitle ?? 'Vault Routing Rules';
    const description = createElement('p');
    description.textContent =
      this.props.messages?.routingRulesHint ??
      'Route clips into different vaults by domain, keywords, or URL patterns.';
    copy.append(title, description);
    header.append(copy);
    return header;
  }
}
