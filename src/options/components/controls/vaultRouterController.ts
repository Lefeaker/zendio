import { markPendingAutoSave, getOptionsController } from '../../app/optionsControllerContext';
import { BaseComponent } from '../shared/BaseComponent';
import {
  addAdditionalVault,
  addRoutingRule,
  removeAdditionalVault,
  removeRoutingRule,
  updateAdditionalVault,
  updateRoutingRule
} from '../../state/vaultRouterStore';
import type { VaultConfig, RoutingRule } from '@shared/types/vault';

interface UpdateOptions {
  silent?: boolean;
}

export type VaultRouterChangeEvent =
  | { type: 'vault:add'; vault: VaultConfig }
  | { type: 'vault:update'; id: string; updates: Partial<VaultConfig> }
  | { type: 'vault:remove'; id: string }
  | { type: 'rule:add'; rule: RoutingRule }
  | { type: 'rule:update'; id: string; updates: Partial<RoutingRule> }
  | { type: 'rule:remove'; id: string };

export interface VaultRouterControllerRenderConfig {
  /**
   * 变更回调，用于 Section 级别的 UI 联动或日志记录。
   */
  onChange?: (event: VaultRouterChangeEvent) => void;
  /**
   * 是否自动调度 auto-save。默认开启，与历史行为保持一致。
   */
  autoSave?: boolean;
}

function createHostContainer(): HTMLElement {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    return document.createElement('div');
  }

  const BaseCtor = (globalThis.HTMLElement ?? class {}) as { new (): HTMLElement };

  class VirtualContainer extends BaseCtor {
    replaceChildren(..._nodes: Array<Node | string>): void {
      // 非浏览器环境不需要真正的 DOM 清理。
    }
  }

  return new VirtualContainer();
}

/**
 * 提供统一的 Vault Router 操作入口，自动调度 auto-save，并在组件生命周期内暴露钩子。
 */
export class VaultRouterController extends BaseComponent<VaultRouterControllerRenderConfig> {
  private changeHandler: ((event: VaultRouterChangeEvent) => void) | null = null;
  private autoSaveEnabled = true;

  constructor(container: HTMLElement = createHostContainer()) {
    super(container);
  }

  render(config: VaultRouterControllerRenderConfig = {}): HTMLElement {
    this.assertActive();
    this.autoSaveEnabled = config.autoSave ?? true;
    this.changeHandler = config.onChange ?? null;
    return this.container;
  }

  addVault(initial?: Partial<VaultConfig>, options?: UpdateOptions): VaultConfig {
    this.assertActive();
    const created = addAdditionalVault(initial);
    this.handleChange({ type: 'vault:add', vault: created }, options);
    return created;
  }

  updateVault(id: string, updates: Partial<VaultConfig>, options?: UpdateOptions): void {
    this.assertActive();
    updateAdditionalVault(id, updates);
    this.handleChange({ type: 'vault:update', id, updates }, options);
  }

  removeVault(id: string, options?: UpdateOptions): void {
    this.assertActive();
    removeAdditionalVault(id);
    this.handleChange({ type: 'vault:remove', id }, options);
  }

  addRule(initial?: Partial<RoutingRule>, options?: UpdateOptions): RoutingRule {
    this.assertActive();
    const created = addRoutingRule(initial);
    this.handleChange({ type: 'rule:add', rule: created }, options);
    return created;
  }

  updateRule(id: string, updates: Partial<RoutingRule>, options?: UpdateOptions): void {
    this.assertActive();
    updateRoutingRule(id, updates);
    this.handleChange({ type: 'rule:update', id, updates }, options);
  }

  removeRule(id: string, options?: UpdateOptions): void {
    this.assertActive();
    removeRoutingRule(id);
    this.handleChange({ type: 'rule:remove', id }, options);
  }

  override destroy(): void {
    this.changeHandler = null;
    super.destroy();
  }

  dispose(): void {
    this.destroy();
  }

  private handleChange(event: VaultRouterChangeEvent, options?: UpdateOptions): void {
    if (!options?.silent && this.autoSaveEnabled) {
      markPendingAutoSave('vaultRouter');
      getOptionsController()?.scheduleAutoSave();
    }
    this.changeHandler?.(event);
  }
}
