/**
 * Vault Router - 智能路由系统，根据规则自动选择目标仓库
 */

export type VaultConfig = {
  id: string;                    // 唯一标识
  name: string;                  // 仓库名称（用户友好）
  httpsUrl: string;              // HTTPS URL
  httpUrl: string;               // HTTP URL
  vault: string;                 // Obsidian vault 名称
  apiKey: string;                // API Key
  isDefault?: boolean;           // 是否为默认仓库
};

export type RoutingRule = {
  id: string;                    // 规则唯一标识
  vaultId: string;               // 目标仓库 ID
  type: 'domain' | 'keyword' | 'url-pattern';  // 规则类型
  pattern: string;               // 匹配模式
  enabled: boolean;              // 是否启用
  priority: number;              // 优先级（数字越大优先级越高）
  description?: string;          // 规则描述
};

export type VaultRouterConfig = {
  vaults: VaultConfig[];         // 所有仓库配置
  rules: RoutingRule[];          // 路由规则
  defaultVaultId?: string;       // 默认仓库 ID
};

export interface ClipContext {
  url: string;                   // 页面 URL
  domain: string;                // 域名
  title: string;                 // 页面标题
  content: string;               // 内容
  type: 'article' | 'ai_chat';   // 内容类型
}

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
    const sortedRules = [...this.config.rules]
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

    // 3. 使用默认仓库
    const defaultVault = this.getDefaultVault();
    if (defaultVault) {
      console.log(`[VaultRouter] Using default vault: ${defaultVault.name}`);
      return defaultVault;
    }

    // 4. 使用第一个仓库
    if (this.config.vaults.length > 0) {
      console.log(`[VaultRouter] Using first vault: ${this.config.vaults[0].name}`);
      return this.config.vaults[0];
    }

    console.error('[VaultRouter] No vault available');
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
    // 精确匹配
    if (pattern === domain) {
      return true;
    }

    // 通配符匹配 (*.example.com)
    if (pattern.startsWith('*.')) {
      const suffix = pattern.substring(2);
      return domain.endsWith(suffix) || domain === suffix;
    }

    return false;
  }

  /**
   * 匹配关键词
   * 在标题和内容中搜索关键词
   */
  private matchKeyword(pattern: string, context: ClipContext): boolean {
    const keywords = pattern.split(',').map(k => k.trim().toLowerCase());
    const searchText = `${context.title} ${context.content}`.toLowerCase();

    // 任意关键词匹配即可
    return keywords.some(keyword => searchText.includes(keyword));
  }

  /**
   * 匹配 URL 模式
   * 支持正则表达式
   */
  private matchUrlPattern(pattern: string, url: string): boolean {
    try {
      const regex = new RegExp(pattern, 'i');
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
      const vault = this.config.vaults.find(v => v.id === this.config.defaultVaultId);
      if (vault) return vault;
    }

    // 2. 使用标记为默认的仓库
    const defaultVault = this.config.vaults.find(v => v.isDefault);
    if (defaultVault) return defaultVault;

    // 3. 返回第一个仓库
    return this.config.vaults[0] || null;
  }

  /**
   * 获取所有仓库
   */
  getAllVaults(): VaultConfig[] {
    return this.config.vaults;
  }

  /**
   * 根据 ID 获取仓库
   */
  getVaultById(id: string): VaultConfig | null {
    return this.config.vaults.find(v => v.id === id) || null;
  }

  /**
   * 获取所有规则
   */
  getAllRules(): RoutingRule[] {
    return this.config.rules;
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

    // 检查仓库 ID 唯一性
    const vaultIds = this.config.vaults.map(v => v.id);
    const duplicateVaultIds = vaultIds.filter((id, index) => vaultIds.indexOf(id) !== index);
    if (duplicateVaultIds.length > 0) {
      errors.push(`仓库 ID 重复: ${duplicateVaultIds.join(', ')}`);
    }

    // 检查规则引用的仓库是否存在
    for (const rule of this.config.rules) {
      if (!this.config.vaults.find(v => v.id === rule.vaultId)) {
        errors.push(`规则 "${rule.description || rule.id}" 引用了不存在的仓库: ${rule.vaultId}`);
      }
    }

    // 检查默认仓库是否存在
    if (this.config.defaultVaultId && !this.config.vaults.find(v => v.id === this.config.defaultVaultId)) {
      errors.push(`默认仓库不存在: ${this.config.defaultVaultId}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
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
  
  return {
    vaults: [
      {
        id: defaultVaultId,
        name: '默认仓库',
        httpsUrl: 'https://127.0.0.1:27124/',
        httpUrl: 'http://127.0.0.1:27123/',
        vault: 'YourVault',
        apiKey: '',
        isDefault: true
      }
    ],
    rules: [],
    defaultVaultId
  };
}

/**
 * 从旧配置迁移
 */
export function migrateFromLegacyConfig(legacyRest: any): VaultRouterConfig {
  const vaultId = generateId();
  
  return {
    vaults: [
      {
        id: vaultId,
        name: legacyRest.vault || '默认仓库',
        httpsUrl: legacyRest.httpsUrl || 'https://127.0.0.1:27124/',
        httpUrl: legacyRest.httpUrl || 'http://127.0.0.1:27123/',
        vault: legacyRest.vault || 'YourVault',
        apiKey: legacyRest.apiKey || '',
        isDefault: true
      }
    ],
    rules: [],
    defaultVaultId: vaultId
  };
}

