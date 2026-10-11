import type { ClipContext, RoutingRule, VaultConfig, VaultRouterConfig } from '../shared/types';
import type { RestOptions } from '../shared/types/options';
import type { UserVisibleMessageDescriptor } from '../shared/i18n/userVisibleMessageDescriptor';
import type { VaultRouterIdentityIssue } from '../shared/config/vaultRouterIdentity';
import { configProvider } from '../shared/config';
import { allocateVaultId, validateVaultRouterIdentity } from '../shared/config/vaultRouterIdentity';
import { mapVaultRouterIdentityIssue } from './vaultRouterIdentityValidationMessages';
import {
  getActiveRoutingRules,
  getDefaultRoutingVault,
  selectMatchingVault
} from '../shared/vaultRouting';

const DEFAULT_VAULT_NAME = 'New Vault';

export type VaultRouterValidationIssueCode =
  | 'missing_vaults'
  | 'missing_enabled_vault'
  | 'invalid_vault_id'
  | 'duplicate_vault_ids'
  | 'missing_rule_vault'
  | 'missing_default_vault'
  | 'disabled_default_vault';

export interface VaultRouterValidationIssue {
  code: VaultRouterValidationIssueCode;
  identityDetail?: VaultRouterIdentityIssue;
  message: string;
  messageDescriptor?: UserVisibleMessageDescriptor;
}

export interface VaultRouterValidationResult {
  valid: boolean;
  errors: string[];
  issues: VaultRouterValidationIssue[];
}

function createValidationIssue(
  code: VaultRouterValidationIssueCode,
  message: string,
  messageDescriptor?: UserVisibleMessageDescriptor
): VaultRouterValidationIssue {
  return {
    code,
    message,
    ...(messageDescriptor ? { messageDescriptor } : {})
  };
}

/**
 * Vault Router - 智能路由系统，根据规则自动选择目标仓库
 */

/**
 * 仓库路由器
 */
export class VaultRouter {
  private config: VaultRouterConfig;

  constructor(config: VaultRouterConfig) {
    this.config = config;
  }

  /**
   * 根据上下文选择合适的仓库
   */
  selectVault(context: ClipContext): VaultConfig | null {
    const match = selectMatchingVault(this.config, context);
    if (match) {
      console.log(
        `[VaultRouter] Matched rule: ${match.rule.description || match.rule.pattern} -> ${match.vault.name}`
      );
      return match.vault;
    }

    console.log('[VaultRouter] No routing rule matched; falling back to primary REST settings');
    return null;
  }

  /**
   * 获取默认仓库
   */
  getDefaultVault(): VaultConfig | null {
    return getDefaultRoutingVault(this.config);
  }

  /**
   * 获取所有仓库
   */
  getAllVaults(): VaultConfig[] {
    return this.config.vaults.filter((v) => v.enabled !== false);
  }

  /**
   * 根据 ID 获取仓库
   */
  getVaultById(id: string): VaultConfig | null {
    const vault = this.config.vaults.find((v) => v.id === id);
    if (!vault || vault.enabled === false) {
      return null;
    }
    return vault;
  }

  /**
   * 获取所有规则
   */
  getAllRules(): RoutingRule[] {
    return getActiveRoutingRules(this.config).map((rule) => ({ ...rule }));
  }

  /**
   * 验证配置
   */
  validate(): VaultRouterValidationResult {
    const issues: VaultRouterValidationIssue[] = [];

    // 检查是否有仓库
    if (this.config.vaults.length === 0) {
      issues.push(
        createValidationIssue('missing_vaults', 'At least one vault must be configured.')
      );
    }

    if (!this.config.vaults.some((vault) => vault.enabled !== false)) {
      issues.push(
        createValidationIssue('missing_enabled_vault', 'At least one vault must be enabled.')
      );
    }

    for (const issue of validateVaultRouterIdentity(this.config).issues) {
      issues.push(mapVaultRouterIdentityIssue(issue));
    }
    const defaultVault = this.config.vaults.find((v) => v.id === this.config.defaultVaultId);
    if (defaultVault?.enabled === false)
      issues.push(createValidationIssue('disabled_default_vault', 'Default vault is disabled.'));

    const errors = issues.map((issue) => issue.message);

    return {
      valid: errors.length === 0,
      errors,
      issues
    };
  }
  private getConfiguredRules(): RoutingRule[] {
    const legacyRules = Array.isArray(this.config.rules) ? this.config.rules : [];

    const rulesFromVaults = this.config.vaults.flatMap((vault) =>
      (vault.rules ?? []).map((rule) => ({
        ...rule,
        vaultId: rule.vaultId ?? vault.id
      }))
    );

    return [...legacyRules, ...rulesFromVaults];
  }
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 创建默认配置
 */
export function createDefaultVaultRouterConfig(): VaultRouterConfig {
  const defaultVaultId = allocateVaultId([]);
  const restDefaults = configProvider.getRestDefaults();

  return {
    vaults: [
      {
        id: defaultVaultId,
        name: DEFAULT_VAULT_NAME,
        httpsUrl: restDefaults.httpsUrl,
        httpUrl: restDefaults.httpUrl,
        vault: restDefaults.vault,
        apiKey: restDefaults.apiKey,
        isDefault: true,
        enabled: true,
        rules: []
      }
    ],
    defaultVaultId
  };
}

/**
 * 从旧配置迁移
 */
export function migrateFromLegacyConfig(
  legacyRest?: Partial<RestOptions> | null
): VaultRouterConfig {
  const vaultId = allocateVaultId([]);
  const restDefaults = configProvider.getRestDefaults();
  const legacy = legacyRest ?? {};
  const name = legacy.vault?.trim() || DEFAULT_VAULT_NAME;
  const httpsUrl = legacy.httpsUrl?.trim() || restDefaults.httpsUrl;
  const httpUrl = legacy.httpUrl?.trim() || restDefaults.httpUrl;
  const vault = legacy.vault?.trim() || restDefaults.vault;
  const apiKey = legacy.apiKey?.trim() || restDefaults.apiKey;

  return {
    vaults: [
      {
        id: vaultId,
        name,
        httpsUrl,
        httpUrl,
        vault,
        apiKey,
        isDefault: true,
        enabled: true,
        rules: []
      }
    ],
    defaultVaultId: vaultId
  };
}
