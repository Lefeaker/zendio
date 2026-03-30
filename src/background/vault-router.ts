import type { ClipContext, RoutingRule, VaultConfig, VaultRouterConfig } from '../shared/types';
import type { RestOptions } from '../shared/types/options';
import { configProvider } from '../shared/config';

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
    // 1. 按优先级排序规则
    const sortedRules = this.getActiveRules()
      .filter(rule => rule.enabled)
      .sort((a, b) => b.priority - a.priority);

    // 2. 依次匹配规则
    for (const rule of sortedRules) {
      if (this.matchRule(rule, context)) {
        const vault = this.config.vaults.find(v => v.id === rule.vaultId);
        if (vault) {
          console.log(`[VaultRouter] Matched rule: ${rule.description || rule.pattern} -> ${vault.name}`);
          return vault;
        }
      }
    }

    console.log('[VaultRouter] No routing rule matched; falling back to primary REST settings');
    return null;
  }

  /**
   * 匹配规则
   */
  private matchRule(rule: RoutingRule, context: ClipContext): boolean {
    switch (rule.type) {
      case 'domain':
        return this.matchDomain(rule.pattern, context.domain);
      
      case 'keyword':
        return this.matchKeyword(rule.pattern, context);
      
      case 'url-pattern':
        return this.matchUrlPattern(rule.pattern, context.url);
      
      default:
        return false;
    }
  }

  /**
   * 匹配域名
   * 支持精确匹配和通配符
   */
  private matchDomain(pattern: string, domain: string): boolean {
    const normalizedDomain = domain.trim().toLowerCase();

    if (!normalizedDomain) {
      return false;
    }

    const candidates = pattern
      .split(';')
      .map(part => part.trim().toLowerCase())
      .filter(part => part.length > 0);

    if (candidates.length === 0) {
      return false;
    }

    return candidates.some(candidate => this.matchSingleDomainPattern(candidate, normalizedDomain));
  }

  /**
   * 匹配关键词
   * 在标题和内容中搜索关键词
   */
  private matchKeyword(pattern: string, context: ClipContext): boolean {
    const keywords = pattern
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(keyword => keyword.length > 0);

    if (keywords.length === 0) {
      return false;
    }

    const searchText = `${context.title} ${context.content}`.toLowerCase();

    // 任意关键词匹配即可
    return keywords.some(keyword => searchText.includes(keyword));
  }

  private matchSingleDomainPattern(pattern: string, normalizedDomain: string): boolean {
    if (pattern.includes('*')) {
      try {
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        const regex = new RegExp(`^${escaped}$`, 'i');
        return regex.test(normalizedDomain);
      } catch (error) {
        console.error('[VaultRouter] Invalid wildcard pattern:', pattern, error);
        return false;
      }
    }

    if (normalizedDomain === pattern) {
      return true;
    }

    if (normalizedDomain.endsWith(`.${pattern}`)) {
      return true;
    }

    const index = normalizedDomain.indexOf(pattern);
    if (index !== -1) {
      const before = index === 0 || normalizedDomain[index - 1] === '.';
      const afterIndex = index + pattern.length;
      const after = afterIndex === normalizedDomain.length || normalizedDomain[afterIndex] === '.';
      if (before && after) {
        return true;
      }
    }

    return false;
  }

  /**
   * 匹配 URL 模式
   * 支持正则表达式
   */
  private matchUrlPattern(pattern: string, url: string): boolean {
    const trimmedPattern = pattern.trim();
    if (trimmedPattern.length === 0) {
      return false;
    }

    try {
      const regex = new RegExp(trimmedPattern, 'i');
      return regex.test(url);
    } catch (error) {
      console.error(`[VaultRouter] Invalid regex pattern: ${pattern}`, error);
      return false;
    }
  }

  /**
   * 获取默认仓库
   */
  getDefaultVault(): VaultConfig | null {
    // 1. 使用配置的默认仓库
    if (this.config.defaultVaultId) {
      const vault = this.config.vaults.find(v => v.id === this.config.defaultVaultId && v.enabled !== false);
      if (vault) return vault;
    }

    // 2. 使用标记为默认的仓库
    const defaultVault = this.config.vaults.find(v => v.isDefault && v.enabled !== false);
    if (defaultVault) return defaultVault;

    // 3. 返回第一个仓库
    return this.config.vaults.find(v => v.enabled !== false) || null;
  }

  /**
   * 获取所有仓库
   */
  getAllVaults(): VaultConfig[] {
    return this.config.vaults.filter(v => v.enabled !== false);
  }

  /**
   * 根据 ID 获取仓库
   */
  getVaultById(id: string): VaultConfig | null {
    const vault = this.config.vaults.find(v => v.id === id);
    if (!vault || vault.enabled === false) {
      return null;
    }
    return vault;
  }

  /**
   * 获取所有规则
   */
  getAllRules(): RoutingRule[] {
    return this.getActiveRules().map(rule => ({ ...rule }));
  }

  /**
   * 验证配置
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查是否有仓库
    if (this.config.vaults.length === 0) {
      errors.push('至少需要配置一个仓库');
    }

    if (!this.config.vaults.some(vault => vault.enabled !== false)) {
      errors.push('至少需要启用一个仓库');
    }

    // 检查仓库 ID 唯一性
    const vaultIds = this.config.vaults.map(v => v.id);
    const duplicateVaultIds = vaultIds.filter((id, index) => vaultIds.indexOf(id) !== index);
    if (duplicateVaultIds.length > 0) {
      errors.push(`仓库 ID 重复: ${duplicateVaultIds.join(', ')}`);
    }

    // 检查规则引用的仓库是否存在
    for (const rule of this.getActiveRules()) {
      if (!this.config.vaults.find(v => v.id === rule.vaultId)) {
        errors.push(`规则 "${rule.description || rule.id}" 引用了不存在的仓库: ${rule.vaultId}`);
      }
    }

    // 检查默认仓库是否存在
    if (this.config.defaultVaultId) {
      const defaultVault = this.config.vaults.find(v => v.id === this.config.defaultVaultId);
      if (!defaultVault) {
        errors.push(`默认仓库不存在: ${this.config.defaultVaultId}`);
      } else if (defaultVault.enabled === false) {
        errors.push('默认仓库已被禁用');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
  /**
   * 获取合并后的规则列表，兼容旧版配置结构
   */
  private getActiveRules(): RoutingRule[] {
    const legacyRules = Array.isArray(this.config.rules) ? this.config.rules : [];

    const rulesFromVaults = this.config.vaults
      .filter(vault => vault.enabled !== false)
      .flatMap(vault =>
        (vault.rules ?? []).map(rule => ({
          ...rule,
          vaultId: rule.vaultId ?? vault.id
        }))
      );

    const merged = [...legacyRules, ...rulesFromVaults];
    const seen = new Set<string>();

    return merged.filter(rule => {
      if (!rule.id) {
        return true;
      }
      if (seen.has(rule.id)) {
        return false;
      }
      seen.add(rule.id);
      if (rule.enabled === false) {
        return false;
      }
      const targetVault = this.config.vaults.find(v => v.id === rule.vaultId);
      if (!targetVault || targetVault.enabled === false) {
        return false;
      }
      return true;
    });
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
  const defaultVaultId = generateId();
  const restDefaults = configProvider.getRestDefaults();
  
  return {
    vaults: [
      {
        id: defaultVaultId,
        name: '默认仓库',
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
export function migrateFromLegacyConfig(legacyRest?: Partial<RestOptions> | null): VaultRouterConfig {
  const vaultId = generateId();
  const restDefaults = configProvider.getRestDefaults();
  const legacy = legacyRest ?? {};
  const name = legacy.vault?.trim() || '默认仓库';
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
