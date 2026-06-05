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
import { sendAnalyticsTransportEvent } from '../../analytics';
import { getService } from '../../di';
import { TOKENS } from '../../di/tokens';
import type { PlatformServices } from '@platform/types';

// GA4 配置接口
export interface GoogleAnalyticsConfig extends Pick<
  AnalyticsConfig,
  'measurementId' | 'enabled' | 'transportMode' | 'proxyEndpoint'
> {
  debugMode?: boolean;
  sessionId?: string;
  clientId?: string;
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
} & Record<string, unknown>;

export class GoogleAnalyticsReporter implements ErrorReporter {
  private config: GoogleAnalyticsConfig;
  private clientId: string;
  private sessionId: string;
  private extensionVersion: string;
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
      sessionId: this.sessionId
    };
    this.extensionVersion = this.getExtensionVersion();
    this.initializeBrowserInfo();
  }

  async report(error: AppError): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const sanitizedError = sanitizeErrorForAnalytics(error);
      const eventParams = this.createErrorEventParams(sanitizedError);
      const result = await sendAnalyticsTransportEvent(
        'extension_error',
        eventParams,
        this.createTransportConfig(),
        { extensionVersion: this.extensionVersion }
      );

      if (result.status === 'failed') {
        console.warn('[GA Reporter] Analytics transport failed:', result);
        return;
      }

      if (this.config.debugMode) {
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
    const safeContext = this.extractSafeContext(error.context);

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

  /**
   * 提取安全的上下文信息，用于错误定位但不泄露隐私
   */
  private extractSafeContext(context?: Record<string, unknown>): Record<string, unknown> {
    if (!context) return {};

    const safeContext: Record<string, unknown> = {};

    // 安全的技术信息（不包含用户隐私）
    const safeKeys = [
      'extractor', // 使用的提取器类型
      'type', // 内容类型
      'method', // HTTP 方法
      'statusCode', // HTTP 状态码
      'feature', // 使用的功能
      'step', // 执行步骤
      'component', // 组件名称
      'action', // 执行的动作
      'retryCount', // 重试次数
      'timeout', // 超时时间
      'batchSize', // 批处理大小
      'itemCount', // 项目数量
      'duration', // 执行时长
      'memoryUsage', // 内存使用情况
      'cacheHit', // 缓存命中
      'apiVersion', // API 版本
      'userAgent', // 用户代理（仅浏览器类型）
      'platform', // 平台信息
      'locale', // 语言设置
      'theme', // 主题设置
      'screenResolution', // 屏幕分辨率（用于UI错误定位）
      'viewportSize', // 视口大小
      'connectionType', // 连接类型
      'isOnline', // 在线状态
      'tabCount', // 标签页数量
      'extensionContext' // 扩展上下文（background/content/popup）
    ];

    // 只提取安全的键值对
    safeKeys.forEach((key) => {
      if (key in context && context[key] !== undefined) {
        safeContext[key] = context[key];
      }
    });

    // 特殊处理：URL 域名（不包含路径和参数）
    if (context.url && typeof context.url === 'string') {
      try {
        const url = new URL(context.url);
        safeContext.domain = url.hostname;
        safeContext.protocol = url.protocol;
      } catch {
        // 忽略无效 URL
      }
    }

    // 特殊处理：错误堆栈（仅保留函数名和行号，移除文件路径）
    if (context.stack && typeof context.stack === 'string') {
      safeContext.stackTrace = this.sanitizeStackTrace(context.stack);
    }

    return safeContext;
  }

  /**
   * 清理堆栈跟踪，只保留函数名和行号
   */
  private sanitizeStackTrace(stack: string): string {
    return stack
      .split('\n')
      .slice(0, 5) // 只保留前5行
      .map((line) => {
        // 提取函数名和行号，移除文件路径
        const match = line.match(/at\s+([^(]+)\s*\(.*:(\d+):\d+\)/);
        if (match) {
          return `at ${match[1].trim()}:${match[2]}`;
        }
        return line.replace(/https?:\/\/[^\s]+/g, '[URL]');
      })
      .join('\n');
  }

  private createTransportConfig(): AnalyticsConfig {
    return {
      enabled: this.config.enabled,
      debugMode: this.config.debugMode ?? DEFAULT_ANALYTICS_CONFIG.debugMode,
      measurementId: this.config.measurementId,
      transportMode: this.config.transportMode ?? DEFAULT_ANALYTICS_CONFIG.transportMode,
      ...(this.config.proxyEndpoint ? { proxyEndpoint: this.config.proxyEndpoint } : {}),
      clientId: this.clientId,
      sessionId: this.sessionId,
      reportingInterval: DEFAULT_ANALYTICS_CONFIG.reportingInterval,
      maxErrorsPerSession: DEFAULT_ANALYTICS_CONFIG.maxErrorsPerSession,
      batchSize: DEFAULT_ANALYTICS_CONFIG.batchSize
    };
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
      if (typeof navigator !== 'undefined') {
        const userAgent = navigator.userAgent;

        // 简单的浏览器检测（不包含详细版本信息以保护隐私）
        if (userAgent.includes('Chrome')) {
          this.browserInfo.name = 'chrome';
        } else if (userAgent.includes('Firefox')) {
          this.browserInfo.name = 'firefox';
        } else if (userAgent.includes('Safari')) {
          this.browserInfo.name = 'safari';
        } else if (userAgent.includes('Edge')) {
          this.browserInfo.name = 'edge';
        } else {
          this.browserInfo.name = 'unknown';
        }

        // 只记录主版本号
        const versionMatch = userAgent.match(/(?:Chrome|Firefox|Safari|Edge)\/(\d+)/);
        if (versionMatch) {
          this.browserInfo.version = versionMatch[1];
        }
      }
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
    return { ...this.config };
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
