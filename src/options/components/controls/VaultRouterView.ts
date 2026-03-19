import type { RoutingRule, RoutingRuleType } from '@shared/types/vault';
import { BaseComponent } from '../shared/BaseComponent';
import { DaisyButton } from '../shared/DaisyButton';
import { DaisyInput } from '../shared/DaisyInput';

export interface VaultRouterOption {
  id: string;
  name: string;
  disabled: boolean;
}

export interface VaultRouterViewLabels {
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
}

export interface VaultRouterViewConfig {
  labels: VaultRouterViewLabels;
  onAddRule: () => void;
  onToggleEnabled: (ruleId: string, enabled: boolean) => void;
  onChangeType: (ruleId: string, type: RoutingRuleType) => void;
  onChangePattern: (ruleId: string, pattern: string) => void;
  onChangeTarget: (ruleId: string, vaultId: string) => void;
  onChangePriority: (ruleId: string, priority: number) => void;
  onRemoveRule: (ruleId: string) => void;
}

export interface VaultRouterViewState {
  rules: RoutingRule[];
  vaultOptions: VaultRouterOption[];
  defaultVaultId?: string;
}

const GRID_CLASS = 'grid grid-cols-[60px_140px_minmax(200px,1fr)_160px_80px_80px] gap-2';

export class VaultRouterView extends BaseComponent<VaultRouterViewConfig> {
  private config: VaultRouterViewConfig | null = null;
  private rowsHost: HTMLElement | null = null;
  private emptyHint: HTMLElement | null = null;

  render(config: VaultRouterViewConfig): HTMLElement {
    this.assertActive();
    this.config = config;

    const wrapper = this.createElement(
      'div',
      'card border border-base-300 bg-base-100 overflow-auto',
      { 'data-role': 'vault-router-view' }
    );
    const table = this.createElement('div', 'w-full text-sm min-w-[800px]');
    table.append(this.buildHeader(config.labels));

    this.rowsHost = this.createElement('div', 'divide-y divide-border/50', { 'data-role': 'routing-rows' });
    this.emptyHint = this.createElement('div', 'p-8 text-center text-base-content/60 italic', { 'data-role': 'routing-empty' });
    this.emptyHint.textContent = config.labels.empty;
    this.emptyHint.hidden = true;

    table.append(this.rowsHost, this.emptyHint);
    wrapper.append(table);

    const controls = this.createElement('div', 'flex justify-end mt-4', { 'data-role': 'routing-controls' });
    const addRuleButtonHost = this.createElement('div');
    new DaisyButton(addRuleButtonHost).render({
      label: config.labels.addRule,
      variant: 'primary',
      size: 'sm',
      iconName: 'Plus',
      onClick: () => {
        this.config?.onAddRule();
      }
    });
    controls.append(addRuleButtonHost);

    this.container.replaceChildren(wrapper, controls);
    return this.container;
  }

  update(state: VaultRouterViewState): void {
    this.assertActive();
    if (!this.rowsHost || !this.emptyHint || !this.config) {
      return;
    }

    const { rules, vaultOptions, defaultVaultId } = state;
    this.rowsHost.replaceChildren(...rules.map((rule) => this.buildRow(rule, vaultOptions, defaultVaultId)));
    this.emptyHint.hidden = rules.length > 0;
  }

  private buildHeader(labels: VaultRouterViewLabels): HTMLElement {
    const headerRow = this.createElement(
      'div',
      [GRID_CLASS, 'p-3 bg-base-200 border-b border-base-300 font-medium text-base-content/60'].join(' '),
      { 'data-role': 'routing-header' }
    );

    [labels.enabled, labels.type, labels.pattern, labels.targetVault, labels.priority, labels.actions].forEach((label) => {
      const cell = document.createElement('span');
      cell.textContent = label;
      headerRow.append(cell);
    });

    return headerRow;
  }

  private buildRow(
    rule: RoutingRule,
    vaultOptions: VaultRouterOption[],
    defaultVaultId?: string
  ): HTMLElement {
    if (!this.config) {
      throw new Error('[VaultRouterView] Missing config');
    }

    const row = this.createElement(
      'div',
      [GRID_CLASS, 'p-3 items-center hover:bg-base-200 transition-colors'].join(' '),
      { 'data-role': 'routing-row' }
    );
    row.dataset.ruleId = rule.id;

    const enabledCell = document.createElement('label');
    enabledCell.className = 'flex items-center justify-center cursor-pointer';
    const enabledCheckbox = document.createElement('input');
    enabledCheckbox.type = 'checkbox';
    enabledCheckbox.classList.add('routing-rule-enabled', 'checkbox', 'checkbox-accent', 'w-[18px]', 'h-[18px]');
    enabledCheckbox.checked = rule.enabled ?? false;
    enabledCheckbox.setAttribute('aria-label', this.config.labels.enabledAria);
    enabledCheckbox.addEventListener('change', () => {
      this.config?.onToggleEnabled(rule.id, enabledCheckbox.checked);
    });
    enabledCell.append(enabledCheckbox);
    row.append(enabledCell);

    const typeSelect = document.createElement('select');
    typeSelect.className = ['select', 'select-bordered', 'h-8', 'w-full', 'text-sm', 'routing-rule-type'].join(' ');
    typeSelect.setAttribute('aria-label', this.config.labels.typeAria);
    const typeLabels: Array<{ type: RoutingRuleType; label: string }> = [
      { type: 'domain', label: this.config.labels.typeDomain },
      { type: 'keyword', label: this.config.labels.typeKeyword },
      { type: 'url-pattern', label: this.config.labels.typeUrlPattern }
    ];
    for (const { type, label } of typeLabels) {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = label;
      typeSelect.append(option);
    }
    typeSelect.value = rule.type;
    typeSelect.addEventListener('change', () => {
      this.config?.onChangeType(rule.id, typeSelect.value as RoutingRuleType);
    });
    row.append(typeSelect);

    const patternHost = this.createElement('div', 'w-full');
    const patternInput = new DaisyInput(patternHost).render({
      type: 'text',
      placeholder: this.config.labels.patternPlaceholder,
      ariaLabel: this.config.labels.patternAria,
      variant: 'bordered',
      size: 'sm',
      value: rule.pattern,
      onChange: (value) => {
        this.config?.onChangePattern(rule.id, value);
      }
    });
    patternInput.classList.add('routing-rule-pattern');
    row.append(patternHost);

    const targetSelect = document.createElement('select');
    targetSelect.className = ['select', 'select-bordered', 'h-8', 'w-full', 'text-sm', 'routing-rule-target'].join(' ');
    targetSelect.setAttribute('aria-label', this.config.labels.targetAria);
    this.populateTargetOptions(targetSelect, vaultOptions, rule.vaultId ?? defaultVaultId ?? vaultOptions[0]?.id ?? '');
    targetSelect.addEventListener('change', () => {
      this.config?.onChangeTarget(rule.id, targetSelect.value);
    });
    row.append(targetSelect);

    const priorityHost = this.createElement('div', 'w-full');
    const priorityInput = new DaisyInput(priorityHost).render({
      type: 'number',
      ariaLabel: this.config.labels.priorityAria,
      variant: 'bordered',
      size: 'sm',
      value: String(rule.priority ?? 10),
      onChange: (value) => {
        const parsed = Number(value);
        this.config?.onChangePriority(rule.id, Number.isNaN(parsed) ? 10 : parsed);
      }
    });
    priorityInput.min = '0';
    priorityInput.max = '100';
    priorityInput.classList.add('routing-rule-priority');
    row.append(priorityHost);

    const actions = this.createElement('div', 'flex justify-end');
    const removeButtonHost = this.createElement('div');
    new DaisyButton(removeButtonHost).render({
      label: this.config.labels.deleteRule,
      variant: 'secondary',
      size: 'sm',
      iconName: 'Trash2',
      onClick: () => {
        this.config?.onRemoveRule(rule.id);
      }
    });
    actions.append(removeButtonHost);
    row.append(actions);

    return row;
  }

  private populateTargetOptions(
    select: HTMLSelectElement,
    vaultOptions: VaultRouterOption[],
    selectedId: string | undefined
  ): void {
    select.replaceChildren();
    for (const optionDef of vaultOptions) {
      const option = document.createElement('option');
      option.value = optionDef.id;
      option.textContent = optionDef.name;
      if (optionDef.disabled && optionDef.id !== selectedId) {
        option.disabled = true;
      }
      select.append(option);
    }
    if (selectedId && vaultOptions.some((opt) => opt.id === selectedId)) {
      select.value = selectedId;
    } else if (vaultOptions.length > 0) {
      select.value = vaultOptions[0].id;
    }
  }
}
