/**
 * Google Analytics 错误报告器
 *
 * 将错误信息以匿名化方式发送到 Google Analytics 4
 * 用于收集和分析扩展的错误趋势和稳定性指标
 */

import { ErrorReporter, AppError } from '../types';
import { parseErrorCode } from '../errorCodes';
import { sanitizeErrorForAnalytics } from './dataSanitizer';
import { DEFAULT_ANALYTICS_CONFIG, type AnalyticsConfig } from './analyticsConfig';
import { extractSafeAnalyticsContext, resolveBrowserInfo } from './googleAnalyticsReporterContext';
import {
  createAnalyticsEventQueue,
  hasConsentForAnalyticsEvent,
  sendAnalyticsTransportEvent,
  type AnalyticsEventQueue
} from '../../analytics';
import { getService } from '../../di';
import { TOKENS } from '../../di/tokens';
import type { PlatformServices } from '@platform/types';

// GA4 配置接口
export interface GoogleAnalyticsConfig extends Pick<
  AnalyticsConfig,
  'measurementId' | 'enabled' | 'transportMode' | 'proxyEndpoint' | 'userConsent'
> {
  debugMode?: boolean;
  sessionId?: string;
  clientId?: string;
  reportingInterval?: number;
  batchSize?: number;
  resolveAnalyticsConfig?: () => AnalyticsConfig;
}

// GA4 事件参数接口
type ErrorEventParams = {
  error_code: string;
  error_domain: string;
  error_category: string | undefined;
  error_severity: string;
  error_recoverable: boolean;
  browser_name?: string;
  browser_version?: string;
} & Record<string, boolean | number | string>;

export class GoogleAnalyticsReporter implements ErrorReporter {
  private config: GoogleAnalyticsConfig;
  private clientId: string;
  private sessionId: string;
  private extensionVersion: string;
  private eventQueue: AnalyticsEventQueue;
  private browserInfo: { name?: string; version?: string } = {};

  constructor(config: GoogleAnalyticsConfig) {
    this.clientId = config.clientId || this.generateClientId();
    this.sessionId = config.sessionId || this.generateSessionId();
    this.config = {
      ...config,
      debugMode: config.debugMode ?? DEFAULT_ANALYTICS_CONFIG.debugMode,
      transportMode: config.transportMode ?? DEFAULT_ANALYTICS_CONFIG.transportMode,
      ...(config.proxyEndpoint ? { proxyEndpoint: config.proxyEndpoint } : {}),
      clientId: this.clientId,
      sessionId: this.sessionId,
      reportingInterval: config.reportingInterval ?? DEFAULT_ANALYTICS_CONFIG.reportingInterval,
      batchSize: config.batchSize ?? DEFAULT_ANALYTICS_CONFIG.batchSize
    };
    this.extensionVersion = this.getExtensionVersion();
    this.eventQueue = createAnalyticsEventQueue({
      getConfig: () => this.createTransportConfig(),
      send: (eventName, params, transportConfig) =>
        sendAnalyticsTransportEvent(eventName, params, transportConfig, {
          extensionVersion: this.extensionVersion
        })
    });
    this.initializeBrowserInfo();
  }

  async report(error: AppError): Promise<void> {
    const transportConfig = this.createTransportConfig();
    if (!hasConsentForAnalyticsEvent(transportConfig, 'extension_error')) {
      this.eventQueue.clear();
      return;
    }

    try {
      const sanitizedError = sanitizeErrorForAnalytics(error);
      const eventParams = this.createErrorEventParams(sanitizedError);
      const enqueued = this.eventQueue.enqueue('extension_error', eventParams);
      if (!enqueued) {
        return;
      }
      const result = await this.eventQueue.flush();

      if (result.failed > 0) {
        console.warn('[GA Reporter] Analytics transport failed:', result);
        return;
      }

      if (transportConfig.debugMode && result.sent > 0) {
        console.log('[GA Reporter] Error reported:', {
          code: eventParams.error_code,
          domain: eventParams.error_domain,
          severity: eventParams.error_severity
        });
      }
    } catch (reportingError) {
      // 错误报告失败不应该影响主要功能
      console.warn('[GA Reporter] Failed to report error:', reportingError);
    }
  }

  private createErrorEventParams(error: AppError): ErrorEventParams {
    const parsedCode = parseErrorCode(error.code);

    // 提取安全的上下文信息用于错误定位
    const safeContext = extractSafeAnalyticsContext(error.context);

    return {
      error_code: error.code,
      error_domain: error.domain,
      error_category: parsedCode.category,
      error_severity: error.severity,
      error_recoverable: error.recoverable,
      ...(this.browserInfo.name !== undefined && { browser_name: this.browserInfo.name }),
      ...(this.browserInfo.version !== undefined && { browser_version: this.browserInfo.version }),
      // 添加安全的上下文信息
      ...safeContext
    };
  }

  private createTransportConfig(): AnalyticsConfig {
    const liveConfig = this.resolveLiveAnalyticsConfig();
    return {
      enabled: liveConfig?.enabled ?? this.config.enabled,
      debugMode:
        liveConfig?.debugMode ?? this.config.debugMode ?? DEFAULT_ANALYTICS_CONFIG.debugMode,
      measurementId: liveConfig?.measurementId ?? this.config.measurementId,
      transportMode:
        liveConfig?.transportMode ??
        this.config.transportMode ??
        DEFAULT_ANALYTICS_CONFIG.transportMode,
      ...((liveConfig?.proxyEndpoint ?? this.config.proxyEndpoint)
        ? { proxyEndpoint: liveConfig?.proxyEndpoint ?? this.config.proxyEndpoint }
        : {}),
      clientId: this.clientId,
      sessionId: this.sessionId,
      reportingInterval:
        liveConfig?.reportingInterval ??
        this.config.reportingInterval ??
        DEFAULT_ANALYTICS_CONFIG.reportingInterval,
      maxErrorsPerSession:
        liveConfig?.maxErrorsPerSession ?? DEFAULT_ANALYTICS_CONFIG.maxErrorsPerSession,
      batchSize:
        liveConfig?.batchSize ?? this.config.batchSize ?? DEFAULT_ANALYTICS_CONFIG.batchSize,
      ...((liveConfig?.userConsent ?? this.config.userConsent)
        ? { userConsent: liveConfig?.userConsent ?? this.config.userConsent }
        : {})
    };
  }

  private resolveLiveAnalyticsConfig(): AnalyticsConfig | null {
    try {
      return this.config.resolveAnalyticsConfig?.() ?? null;
    } catch (error) {
      console.warn('[GA Reporter] Failed to resolve live analytics config:', error);
      return null;
    }
  }

  private generateClientId(): string {
    // 生成符合 GA4 要求的客户端 ID（不包含个人信息）
    return 'ext-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
  }

  private generateSessionId(): string {
    // 生成会话 ID
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
  }

  private getExtensionVersion(): string {
    try {
      const platform = getService<PlatformServices>(TOKENS.platformServices);
      if (platform?.runtime?.getManifest) {
        const manifest = platform.runtime.getManifest();
        return manifest?.version ?? 'unknown';
      }
    } catch (error) {
      console.warn('[GA Reporter] Failed to resolve extension version:', error);
    }
    return 'unknown';
  }

  private initializeBrowserInfo(): void {
    try {
      this.browserInfo = resolveBrowserInfo(
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined
      );
    } catch {
      this.browserInfo = { name: 'unknown', version: 'unknown' };
    }
  }

  // 更新配置
  updateConfig(newConfig: Partial<GoogleAnalyticsConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.clientId) {
      this.clientId = newConfig.clientId;
    }
    if (newConfig.sessionId) {
      this.sessionId = newConfig.sessionId;
    }
  }

  // 获取当前配置状态
  getConfig(): GoogleAnalyticsConfig {
    return {
      ...this.config,
      ...(this.config.userConsent ? { userConsent: { ...this.config.userConsent } } : {})
    };
  }

  // 检查是否启用
  isEnabled(): boolean {
    return this.config.enabled;
  }

  // 生成新的会话 ID（用于新的使用会话）
  renewSession(): void {
    this.sessionId = this.generateSessionId();
    this.config.sessionId = this.sessionId;
  }
}

// 工厂函数
export function createGoogleAnalyticsReporter(
  config: GoogleAnalyticsConfig
): GoogleAnalyticsReporter {
  return new GoogleAnalyticsReporter(config);
}

// 默认配置
export const DEFAULT_GA_CONFIG: Partial<GoogleAnalyticsConfig> = {
  enabled: false, // 默认关闭，需要用户明确同意
  debugMode: false
};
