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
import {
  DEFAULT_ANALYTICS_MEASUREMENT_ID,
  normalizeAnalyticsTransportMode,
  normalizeMeasurementId,
  normalizeProxyEndpoint,
  readAnalyticsPublicBuildConfig,
  type AnalyticsTransportMode
} from '../../analytics/analyticsEnvironment';

// GA4 配置常量
export const GA4_CONFIG = {
  // 生产环境配置 - 请替换为你的实际 Measurement ID
  MEASUREMENT_ID: DEFAULT_ANALYTICS_MEASUREMENT_ID, // 替换为你的 GA4 Measurement ID

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
  transportMode: AnalyticsTransportMode;
  proxyEndpoint?: string;
  clientId?: string;
  sessionId?: string;
  userConsent?: UserConsent;
  reportingInterval: number; // 报告间隔（毫秒）
  maxErrorsPerSession: number; // 每个会话最大错误报告数
  batchSize: number; // 批量发送大小
}

const PUBLIC_BUILD_ANALYTICS_CONFIG = readAnalyticsPublicBuildConfig();

// 默认配置
export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  enabled: false, // 默认关闭，需要用户明确同意
  debugMode: false,
  measurementId: PUBLIC_BUILD_ANALYTICS_CONFIG.measurementId ?? GA4_CONFIG.MEASUREMENT_ID,
  transportMode: PUBLIC_BUILD_ANALYTICS_CONFIG.transportMode ?? 'disabled',
  ...(PUBLIC_BUILD_ANALYTICS_CONFIG.proxyEndpoint
    ? { proxyEndpoint: PUBLIC_BUILD_ANALYTICS_CONFIG.proxyEndpoint }
    : {}),
  reportingInterval: 30000, // 30秒
  maxErrorsPerSession: 50, // 每个会话最多50个错误
  batchSize: 10 // 批量发送10个事件
};

/**
 * Analytics 配置管理器
 * 负责管理用户同意状态、配置存储和会话管理
 */
export class AnalyticsConfigManager {
  private config: AnalyticsConfig = { ...DEFAULT_ANALYTICS_CONFIG };

  constructor(private readonly storage: StorageService) {}

  async initialize(): Promise<void> {
    await this.refreshFromStorage();
    await this.ensureClientId();
    await this.ensureSessionId();
  }

  async refreshFromStorage(): Promise<void> {
    const storedConfig = await this.storage.local.get<Partial<AnalyticsConfig>>(
      GA4_CONFIG.STORAGE_KEYS.CONFIG
    );
    const storedConsent = await this.storage.local.get<UserConsent>(
      GA4_CONFIG.STORAGE_KEYS.USER_CONSENT
    );
    const storedClientId = await this.storage.local.get<string>(GA4_CONFIG.STORAGE_KEYS.CLIENT_ID);
    const storedSessionId = await this.storage.local.get<string>(
      GA4_CONFIG.STORAGE_KEYS.SESSION_ID
    );

    this.config = normalizeAnalyticsConfig(storedConfig ?? {});
    if (storedClientId) this.config.clientId = storedClientId;
    if (storedSessionId) this.config.sessionId = storedSessionId;
    if (storedConsent) this.config.userConsent = storedConsent;
    this.config.enabled = Boolean(storedConsent?.analytics || storedConsent?.errorReporting);
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

  async renewSession(): Promise<void> {
    const sessionId = this.generateSessionId();
    this.config.sessionId = sessionId;

    await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.SESSION_ID, sessionId);
  }

  private async ensureSessionId(): Promise<void> {
    const existingSessionId =
      this.config.sessionId ??
      (await this.storage.local.get<string>(GA4_CONFIG.STORAGE_KEYS.SESSION_ID));
    if (existingSessionId) {
      this.config.sessionId = existingSessionId;
      return;
    }
    await this.renewSession();
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
    this.config = normalizeAnalyticsConfig({ ...this.config, ...updates });
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
  async setUserConsent(
    nextConsentInput: Omit<UserConsent, 'timestamp' | 'version'>
  ): Promise<void> {
    const nextConsent: UserConsent = {
      analytics: nextConsentInput.analytics,
      errorReporting: nextConsentInput.errorReporting,
      timestamp: Date.now(),
      version: '1.0'
    };

    this.config.userConsent = nextConsent;
    this.config.enabled = nextConsent.analytics || nextConsent.errorReporting;

    await Promise.all([
      this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.USER_CONSENT, nextConsent),
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
      maxErrorsPerSession: this.config.maxErrorsPerSession,
      transportMode: this.config.transportMode,
      proxyEndpoint: this.config.proxyEndpoint
    };
  }

  /**
   * 清除所有 Analytics 数据
   */
  async clearAllData(): Promise<void> {
    const keys = Object.values(GA4_CONFIG.STORAGE_KEYS);
    await Promise.all(keys.map((key) => this.storage.local.remove(key)));

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
export async function setAnalyticsConsent(
  analytics: boolean,
  errorReporting: boolean
): Promise<void> {
  const manager = getAnalyticsConfigManager();
  await manager.setUserConsent({ analytics, errorReporting });
}

/**
 * 获取当前配置的便捷函数
 */
export function getAnalyticsConfig(): AnalyticsConfig {
  const manager = getAnalyticsConfigManager();
  return manager.getConfig();
}

function normalizeAnalyticsConfig(storedConfig: Partial<AnalyticsConfig>): AnalyticsConfig {
  const { proxyEndpoint: _defaultProxyEndpoint, ...defaultConfigWithoutProxyEndpoint } =
    DEFAULT_ANALYTICS_CONFIG;
  const hasStoredTransportMode = Object.prototype.hasOwnProperty.call(
    storedConfig,
    'transportMode'
  );
  const transportMode = hasStoredTransportMode
    ? (normalizeAnalyticsTransportMode(storedConfig.transportMode, 'disabled') ?? 'disabled')
    : DEFAULT_ANALYTICS_CONFIG.transportMode;
  const proxyEndpoint =
    transportMode === 'proxy'
      ? Object.prototype.hasOwnProperty.call(storedConfig, 'proxyEndpoint')
        ? normalizeProxyEndpoint(storedConfig.proxyEndpoint)
        : DEFAULT_ANALYTICS_CONFIG.proxyEndpoint
      : undefined;

  return {
    ...defaultConfigWithoutProxyEndpoint,
    enabled: typeof storedConfig.enabled === 'boolean' ? storedConfig.enabled : false,
    debugMode:
      typeof storedConfig.debugMode === 'boolean'
        ? storedConfig.debugMode
        : DEFAULT_ANALYTICS_CONFIG.debugMode,
    measurementId:
      normalizeMeasurementId(storedConfig.measurementId, DEFAULT_ANALYTICS_CONFIG.measurementId) ??
      DEFAULT_ANALYTICS_CONFIG.measurementId,
    transportMode,
    ...(proxyEndpoint ? { proxyEndpoint } : {}),
    reportingInterval: normalizePositiveInteger(
      storedConfig.reportingInterval,
      DEFAULT_ANALYTICS_CONFIG.reportingInterval
    ),
    maxErrorsPerSession: normalizePositiveInteger(
      storedConfig.maxErrorsPerSession,
      DEFAULT_ANALYTICS_CONFIG.maxErrorsPerSession
    ),
    batchSize: normalizePositiveInteger(storedConfig.batchSize, DEFAULT_ANALYTICS_CONFIG.batchSize),
    ...(storedConfig.clientId ? { clientId: storedConfig.clientId } : {}),
    ...(storedConfig.sessionId ? { sessionId: storedConfig.sessionId } : {}),
    ...(storedConfig.userConsent ? { userConsent: { ...storedConfig.userConsent } } : {})
  };
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
