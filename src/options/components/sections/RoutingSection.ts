import type { CompleteOptions } from '@shared/types/options';
import type { VaultConfig, RoutingRule, RoutingRuleType } from '@shared/types/vault';
import type { IOptionsRepository } from '@shared/repositories';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import {
  subscribeVaultRouter,
  getVaultRouterConfig,
  initializeVaultRouterStore
} from '../../state/vaultRouterStore';
import { VaultRouterController } from '../controls/vaultRouterController';
import { VaultRouterView } from '@ui/domains/vault-router';
import { getOptionsController, markPendingAutoSave } from '../../app/optionsControllerContext';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';

export class RoutingSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private readonly vaultRouterController = new VaultRouterController();
  private vaultRouterView: VaultRouterView | null = null;
  private unsubscribeVaultStore: (() => void) | null = null;
  private unsubscribeRepo: (() => void) | null = null;

  constructor(container: HTMLElement, optionsRepo: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo;
  }

  protected renderWithState(_context: SectionRenderContext): HTMLElement {
    this.applySectionChrome();

    if (this.messages) {
      this.vaultRouterController.setMessages(this.messages);
    }
    this.vaultRouterController.render({
      onChange: this.handleVaultRouterChange,
      autoSave: false
    });

    const header = this.buildHeader();
    const body = this.buildBody();
    this.container.replaceChildren(header, body);

    this.mountVaultRouterView();
    this.unsubscribeVaultStore?.();
    this.unsubscribeVaultStore = subscribeVaultRouter((state) => {
      this.renderRoutingState(state.vaults, state.defaultVaultId);
    });

    const snapshot = getVaultRouterConfig();
    this.renderRoutingState(snapshot?.vaults ?? [], snapshot?.defaultVaultId);
    this.subscribeToRepository();
    this.registerFormIntegration();

    return this.container;
  }

  override destroy(): void {
    this.unsubscribeVaultStore?.();
    this.unsubscribeVaultStore = null;
    this.unregisterManagedFormSection();
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    this.vaultRouterView?.destroy();
    this.vaultRouterView = null;
    this.vaultRouterController.dispose();
    super.destroy();
  }

  private buildHeader(): HTMLElement {
    return this.buildSectionHeader({
      title: this.messages?.routingRulesTitle ?? '路由规则',
      description:
        this.messages?.routingRulesHint ?? '根据域名、关键词或 URL 模式自动选择目标仓库。'
    });
  }

  private buildBody(): HTMLElement {
    const pad = this.createSectionBody();
    const viewHost = this.createElement('div', 'space-y-4', { id: 'vaultRouterViewHost' });
    const note = this.createElement('p', 'text-sm text-base-content/60');
    note.textContent =
      this.messages?.routingRulesPriorityNote ?? '提示：优先级越高越先匹配，目标仓库需保持启用。';
    pad.append(viewHost, note);
    return pad;
  }

  private mountVaultRouterView(): void {
    const host = this.container.querySelector<HTMLElement>('#vaultRouterViewHost');
    if (!host) {
      throw new Error('[RoutingSection] Vault router view host missing.');
    }

    this.vaultRouterView?.destroy();
    this.vaultRouterView = new VaultRouterView(host);
    if (this.messages) {
      this.vaultRouterView.setMessages(this.messages);
    }

    this.vaultRouterView.render({
      labels: {
        enabled: this.messages?.ruleEnabledLabel ?? '启用',
        type: this.messages?.ruleTypeLabel ?? '规则类型',
        pattern: this.messages?.rulePatternLabel ?? '匹配模式',
        targetVault: this.messages?.ruleTargetVaultLabel ?? '目标仓库',
        priority: this.messages?.rulePriorityLabel ?? '优先级',
        actions: this.messages?.yamlFieldActionsLabel ?? '操作',
        addRule: this.messages?.addRuleButton ?? '+ 添加规则',
        deleteRule: this.messages?.deleteRuleButton ?? '删除',
        empty: this.messages?.ruleEmptyPlaceholder ?? '暂无规则，点击右侧按钮为仓库添加规则',
        patternPlaceholder:
          this.messages?.rulePatternPlaceholder ??
          '例如：example.com;news.example.com 或 关键词1,关键词2',
        defaultVaultBadge: this.messages?.defaultVaultBadge ?? '默认仓库',
        typeDomain: this.messages?.ruleTypeDomain ?? '域名匹配',
        typeKeyword: this.messages?.ruleTypeKeyword ?? '关键词匹配',
        typeUrlPattern: this.messages?.ruleTypeUrlPattern ?? 'URL 模式',
        enabledAria: this.messages?.ruleEnabledLabel ?? '启用规则',
        typeAria: this.messages?.ruleTypeLabel ?? '规则类型',
        patternAria: this.messages?.rulePatternLabel ?? '匹配模式',
        targetAria: this.messages?.ruleTargetVaultLabel ?? '目标仓库',
        priorityAria: this.messages?.rulePriorityLabel ?? '优先级'
      },
      onAddRule: this.handleAddRule,
      onToggleEnabled: this.handleToggleRuleEnabled,
      onChangeType: this.handleChangeRuleType,
      onChangePattern: this.handleChangeRulePattern,
      onChangeTarget: this.handleChangeRuleTarget,
      onChangePriority: this.handleChangeRulePriority,
      onRemoveRule: this.handleRemoveRule
    });
  }

  private renderRoutingState(vaults: VaultConfig[], defaultVaultId?: string): void {
    const rules: RoutingRule[] = [];
    for (const vault of vaults) {
      for (const rule of vault.rules ?? []) {
        rules.push(rule);
      }
    }

    const resolvedDefaultId =
      defaultVaultId ?? vaults.find((vault) => vault.isDefault)?.id ?? vaults[0]?.id ?? '';
    const defaultBadge = this.messages?.defaultVaultBadge ?? '默认仓库';
    const vaultOptions = vaults.map((vault) => {
      const trimmedName = vault.name?.trim() ?? '';
      const trimmedVault = vault.vault?.trim() ?? '';
      const isDefaultVault = vault.id === resolvedDefaultId || vault.isDefault === true;
      const displayName = isDefaultVault
        ? trimmedVault || trimmedName || defaultBadge
        : trimmedName || trimmedVault || vault.id;
      return {
        id: vault.id,
        name: displayName,
        disabled: vault.enabled === false
      };
    });

    this.vaultRouterView?.update({
      rules,
      vaultOptions,
      ...(resolvedDefaultId ? { defaultVaultId: resolvedDefaultId } : {})
    });
  }

  private registerFormIntegration(): void {
    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        initializeVaultRouterStore(options.vaultRouter ?? null);
      },
      collectChanges: () => {
        const config = getVaultRouterConfig();
        if (config) {
          return { vaultRouter: config };
        }
        return {};
      }
    };
    this.registerManagedFormSection('routing', binding);
  }

  private handleAddRule = (): void => {
    const snapshot = getVaultRouterConfig();
    const defaultVaultId =
      snapshot?.defaultVaultId ??
      snapshot?.vaults?.find((vault) => vault.isDefault)?.id ??
      snapshot?.vaults?.[0]?.id;
    this.vaultRouterController.addRule(defaultVaultId ? { vaultId: defaultVaultId } : {});
    this.triggerAutoSave();
  };

  private handleToggleRuleEnabled = (ruleId: string, enabled: boolean): void => {
    this.vaultRouterController.updateRule(ruleId, { enabled });
    this.triggerAutoSave();
  };

  private handleChangeRuleType = (ruleId: string, type: RoutingRuleType): void => {
    this.vaultRouterController.updateRule(ruleId, { type });
    this.triggerAutoSave();
  };

  private handleChangeRulePattern = (ruleId: string, pattern: string): void => {
    this.vaultRouterController.updateRule(ruleId, { pattern });
    this.triggerAutoSave();
  };

  private handleChangeRuleTarget = (ruleId: string, vaultId: string): void => {
    this.vaultRouterController.updateRule(ruleId, { vaultId });
    this.triggerAutoSave();
  };

  private handleChangeRulePriority = (ruleId: string, priority: number): void => {
    this.vaultRouterController.updateRule(ruleId, { priority });
    this.triggerAutoSave();
  };

  private handleRemoveRule = (ruleId: string): void => {
    this.vaultRouterController.removeRule(ruleId);
    this.triggerAutoSave();
  };

  private triggerAutoSave(): void {
    markPendingAutoSave('routing');
    markPendingAutoSave('vaultRouter');
    getOptionsController()?.scheduleAutoSave();
  }

  private handleVaultRouterChange = (): void => {
    this.triggerAutoSave();
  };

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = this.optionsRepo.onChange((options) => {
      initializeVaultRouterStore(options.vaultRouter ?? null);
    });
  }
}
