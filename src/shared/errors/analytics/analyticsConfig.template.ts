/**
 * Analytics 配置模板文件
 * 
 * 使用说明：
 * 1. 复制此文件为 analyticsConfig.ts
 * 2. 替换 MEASUREMENT_ID 为你的 Google Analytics 4 Measurement ID
 * 3. 根据需要调整其他配置项
 * 
 * 注意：analyticsConfig.ts 文件已被添加到 .gitignore 中，不会被提交到版本控制
 */
import type { StorageService } from '@platform/interfaces/storage';

// GA4 配置常量
export const GA4_CONFIG = {
  // 生产环境配置 - 请替换为你的实际 Measurement ID
  MEASUREMENT_ID: 'G-XXXXXXXXXX', // 替换为你的 GA4 Measurement ID
  
  // GA4 事件名称
  EVENT_NAMES: {
    ERROR: 'extension_error',
    USAGE: 'extension_usage',
    PERFORMANCE: 'extension_performance'
  } as const,

  // 自定义参数名称
  CUSTOM_PARAMS: {
    ERROR_CODE: 'error_code',
    ERROR_DOMAIN: 'error_domain',
    ERROR_SEVERITY: 'error_severity',
    EXTENSION_VERSION: 'extension_version',
    BROWSER_VERSION: 'browser_version',
    ERROR_CONTEXT: 'error_context',
    USER_AGENT_HASH: 'user_agent_hash',
    SESSION_DURATION: 'session_duration',
    FEATURE_USED: 'feature_used',
    PERFORMANCE_METRIC: 'performance_metric'
  } as const,

  // 存储键名
  STORAGE_KEYS: {
    USER_CONSENT: 'analytics_user_consent',
    CONFIG: 'analytics_config',
    CLIENT_ID: 'analytics_client_id',
    SESSION_ID: 'analytics_session_id',
    ERROR_QUEUE: 'analytics_error_queue',
    LAST_REPORT_TIME: 'analytics_last_report_time'
  } as const
} as const;

// 用户同意状态
export interface UserConsent {
  analytics: boolean;
  errorReporting: boolean;
  timestamp: number;
  version: string; // 同意条款版本
}

// Analytics 配置
export interface AnalyticsConfig {
  enabled: boolean;
  debugMode: boolean;
  measurementId: string;
  clientId?: string;
  sessionId?: string;
  userConsent?: UserConsent;
  reportingInterval: number; // 报告间隔（毫秒）
  maxErrorsPerSession: number; // 每个会话最大错误报告数
  batchSize: number; // 批量发送大小
}

// 默认配置
export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  enabled: false, // 默认关闭，需要用户明确同意
  debugMode: false,
  measurementId: GA4_CONFIG.MEASUREMENT_ID,
  reportingInterval: 30000, // 30秒
  maxErrorsPerSession: 50,   // 每个会话最多50个错误
  batchSize: 10              // 批量发送10个事件
};

/**
 * Analytics 配置管理器
 * 负责管理用户同意状态、配置存储和会话管理
 */
export class AnalyticsConfigManager {
  private config: AnalyticsConfig = { ...DEFAULT_ANALYTICS_CONFIG };

  constructor(private readonly storage: StorageService) {}

  async initialize(): Promise<void> {
    await this.initializeConfig();
  }

  /**
   * 初始化配置
   */
  private async initializeConfig(): Promise<void> {
    try {
      // 加载存储的配置
      const storedConfig = await this.storage.local.get<AnalyticsConfig>(GA4_CONFIG.STORAGE_KEYS.CONFIG);
      if (storedConfig) {
        this.config = { ...DEFAULT_ANALYTICS_CONFIG, ...storedConfig };
      }

      // 生成或加载客户端 ID
      await this.ensureClientId();
      
      // 生成新的会话 ID
      await this.generateNewSession();

      // 加载用户同意状态
      await this.loadUserConsent();

    } catch (error) {
      console.error('[Analytics Config] Failed to initialize:', error);
    }
  }

  /**
   * 确保客户端 ID 存在
   */
  private async ensureClientId(): Promise<void> {
    let clientId = this.config.clientId;
    
    if (!clientId) {
      const stored = await this.storage.local.get<string>(GA4_CONFIG.STORAGE_KEYS.CLIENT_ID);
      clientId = stored;
    }

    if (!clientId) {
      clientId = this.generateClientId();
      await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.CLIENT_ID, clientId);
    }

    this.config.clientId = clientId;
  }

  /**
   * 生成新的会话
   */
  private async generateNewSession(): Promise<void> {
    const sessionId = this.generateSessionId();
    this.config.sessionId = sessionId;
    
    await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.SESSION_ID, sessionId);
  }

  /**
   * 加载用户同意状态
   */
  private async loadUserConsent(): Promise<void> {
    try {
      const consent = await this.storage.local.get<UserConsent>(GA4_CONFIG.STORAGE_KEYS.USER_CONSENT);
      if (consent) {
        this.config.userConsent = consent;
        this.config.enabled = consent.analytics || consent.errorReporting;
      }
    } catch (error) {
      console.error('[Analytics Config] Failed to load user consent:', error);
    }
  }

  /**
   * 生成客户端 ID
   */
  private generateClientId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 11);
    return `ext-${timestamp}-${random}`;
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `${timestamp}-${random}`;
  }

  /**
   * 获取当前配置
   */
  getConfig(): AnalyticsConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  async updateConfig(updates: Partial<AnalyticsConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
  }

  /**
   * 保存配置到存储
   */
  private async saveConfig(): Promise<void> {
    await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.CONFIG, this.config);
  }

  /**
   * 设置用户同意状态
   */
  async setUserConsent(analytics: boolean, errorReporting: boolean): Promise<void> {
    const consent: UserConsent = {
      analytics,
      errorReporting,
      timestamp: Date.now(),
      version: '1.0'
    };

    this.config.userConsent = consent;
    this.config.enabled = analytics || errorReporting;

    await Promise.all([
      this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.USER_CONSENT, consent),
      this.saveConfig()
    ]);
  }

  /**
   * 检查是否有用户同意
   */
  hasUserConsent(): boolean {
    return !!(this.config.userConsent?.analytics || this.config.userConsent?.errorReporting);
  }

  /**
   * 检查是否同意分析
   */
  hasAnalyticsConsent(): boolean {
    return !!this.config.userConsent?.analytics;
  }

  /**
   * 检查是否同意错误报告
   */
  hasErrorReportingConsent(): boolean {
    return !!this.config.userConsent?.errorReporting;
  }

  /**
   * 获取状态信息（用于调试）
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      hasConsent: this.hasUserConsent(),
      clientId: this.config.clientId?.substring(0, 10) + '...', // 只显示前10位
      sessionId: this.config.sessionId?.substring(0, 10) + '...',
      measurementId: this.config.measurementId,
      debugMode: this.config.debugMode,
      reportingInterval: this.config.reportingInterval,
      maxErrorsPerSession: this.config.maxErrorsPerSession
    };
  }

  /**
   * 清除所有 Analytics 数据
   */
  async clearAllData(): Promise<void> {
    const keys = Object.values(GA4_CONFIG.STORAGE_KEYS);
    await Promise.all(keys.map(key => this.storage.local.remove(key)));
    
    this.config = { ...DEFAULT_ANALYTICS_CONFIG };
  }
}

// 全局配置管理器实例
let configManager: AnalyticsConfigManager | null = null;
let analyticsStorage: StorageService | null = null;

export function configureAnalyticsConfigManager(storage: StorageService): AnalyticsConfigManager {
  analyticsStorage = storage;
  if (!configManager) {
    configManager = new AnalyticsConfigManager(storage);
  }
  return configManager;
}

/**
 * 获取配置管理器实例
 */
export function getAnalyticsConfigManager(): AnalyticsConfigManager {
  if (!configManager) {
    if (!analyticsStorage) {
      throw new Error('[Analytics Config] StorageService is not configured.');
    }
    configManager = new AnalyticsConfigManager(analyticsStorage);
  }
  return configManager;
}

/**
 * 设置用户同意状态的便捷函数
 */
export async function setAnalyticsConsent(analytics: boolean, errorReporting: boolean): Promise<void> {
  const manager = getAnalyticsConfigManager();
  await manager.setUserConsent(analytics, errorReporting);
}

/**
 * 获取当前配置的便捷函数
 */
export function getAnalyticsConfig(): AnalyticsConfig {
  const manager = getAnalyticsConfigManager();
  return manager.getConfig();
}
