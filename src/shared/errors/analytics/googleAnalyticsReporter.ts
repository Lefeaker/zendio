/**
 * Google Analytics 错误报告器
 *
 * 将错误信息转换为 telemetry producer payload。
 * 发送路径由注入的 emitter 决定，shared reporter 自身不直接发送 runtime/network 请求。
 */

import { ErrorReporter, AppError } from '../types';
import { parseErrorCode, SEVERITY_LEVELS, ERROR_CODE_DESCRIPTIONS } from '../errorCodes';
import { sanitizeErrorForAnalytics } from './dataSanitizer';
import {
  sanitizeExtensionErrorBrowserName,
  sanitizeExtensionErrorBrowserVersion,
  sanitizeExtensionErrorContext
} from '../../analytics/extensionErrorParams';
import type { RuntimeExtensionErrorParams } from '../../types/analytics';

// GA4 配置接口
export interface GoogleAnalyticsConfig {
  measurementId: string;
  enabled: boolean;
  debugMode?: boolean;
  sessionId?: string;
  clientId?: string;
}

export type EmitTelemetryEvent = (params: RuntimeExtensionErrorParams) => Promise<void>;

export class GoogleAnalyticsReporter implements ErrorReporter {
  private config: GoogleAnalyticsConfig;
  private sessionId: string;
  private browserInfo: { name?: string; version?: string } = {};
  private readonly emitTelemetryEvent: EmitTelemetryEvent | undefined;

  constructor(config: GoogleAnalyticsConfig, emitTelemetryEvent?: EmitTelemetryEvent) {
    this.config = config;
    this.sessionId = config.sessionId || this.generateSessionId();
    this.emitTelemetryEvent = emitTelemetryEvent;
    this.initializeBrowserInfo();
  }

  async report(error: AppError): Promise<void> {
    if (!this.config.enabled || !this.emitTelemetryEvent) {
      return;
    }

    try {
      const sanitizedError = sanitizeErrorForAnalytics(error);
      const eventParams = this.createErrorEventParams(sanitizedError);
      await this.emitTelemetryEvent(eventParams);

      if (this.config.debugMode) {
        console.log('[GA Reporter] Error reported:', {
          code: eventParams.error_code,
          domain: eventParams.error_domain,
          severity: eventParams.error_severity
        });
      }
    } catch (reportingError) {
      // 错误报告失败不应该影响主要功能
      console.warn('[GA Reporter] Failed to emit telemetry event:', reportingError);
    }
  }

  private createErrorEventParams(error: AppError): RuntimeExtensionErrorParams {
    const parsedCode = parseErrorCode(error.code);
    const description =
      ERROR_CODE_DESCRIPTIONS[error.code as keyof typeof ERROR_CODE_DESCRIPTIONS] ||
      'Unknown error';

    // 提取安全的上下文信息用于错误定位
    const safeContext = sanitizeExtensionErrorContext(error.context);

    return {
      error_code: error.code,
      error_domain: error.domain,
      error_category: parsedCode.category,
      error_severity: error.severity,
      error_severity_level: SEVERITY_LEVELS[error.severity],
      error_recoverable: error.recoverable,
      error_description: description,
      timestamp: Date.now(),
      ...(this.browserInfo.name !== undefined && { browser_name: this.browserInfo.name }),
      ...(this.browserInfo.version !== undefined && { browser_version: this.browserInfo.version }),
      // 添加安全的上下文信息
      ...safeContext
    };
  }

  private generateSessionId(): string {
    // 生成会话 ID
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
  }

  private initializeBrowserInfo(): void {
    try {
      if (typeof navigator !== 'undefined') {
        const userAgent = navigator.userAgent;

        // 简单的浏览器检测（不包含详细版本信息以保护隐私）
        const browserName = userAgent.includes('Chrome')
          ? 'chrome'
          : userAgent.includes('Firefox')
            ? 'firefox'
            : userAgent.includes('Safari')
              ? 'safari'
              : userAgent.includes('Edge')
                ? 'edge'
                : 'unknown';
        this.browserInfo.name = sanitizeExtensionErrorBrowserName(browserName) ?? 'unknown';

        // 只记录主版本号
        const versionMatch = userAgent.match(/(?:Chrome|Firefox|Safari|Edge)\/(\d+)/);
        if (versionMatch) {
          const browserVersion = sanitizeExtensionErrorBrowserVersion(versionMatch[1]);
          if (browserVersion !== undefined) {
            this.browserInfo.version = browserVersion;
          }
        }
      }
    } catch {
      this.browserInfo = { name: 'unknown', version: 'unknown' };
    }
  }

  // 更新配置
  updateConfig(newConfig: Partial<GoogleAnalyticsConfig>): void {
    this.config = { ...this.config, ...newConfig };
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
  }
}

// 工厂函数
export function createGoogleAnalyticsReporter(
  config: GoogleAnalyticsConfig,
  emitTelemetryEvent?: EmitTelemetryEvent
): GoogleAnalyticsReporter {
  return new GoogleAnalyticsReporter(config, emitTelemetryEvent);
}

// 默认配置
export const DEFAULT_GA_CONFIG: Partial<GoogleAnalyticsConfig> = {
  enabled: false, // 默认关闭，需要用户明确同意
  debugMode: false
};
