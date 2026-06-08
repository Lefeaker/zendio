/**
 * Google Analytics 错误报告器
 *
 * 将错误信息转换为 telemetry producer payload。
 * 发送路径由注入的 emitter 决定，shared reporter 自身不直接发送 runtime/network 请求。
 */

import { ErrorReporter, AppError } from '../types';
import { parseErrorCode, SEVERITY_LEVELS, ERROR_CODE_DESCRIPTIONS } from '../errorCodes';
import { sanitizeErrorForAnalytics } from './dataSanitizer';
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

const SAFE_CONTEXT_STRING_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/;
const SAFE_DOMAIN_PATTERN = /^(?=.{1,253}$)[A-Za-z0-9.-]+$/;
const SAFE_LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const SAFE_PROTOCOL_PATTERN = /^(?:https?|file|chrome-extension|moz-extension):$/;
const SAFE_RESOLUTION_PATTERN = /^\d{2,5}x\d{2,5}$/;
const SAFE_STACK_LABEL_PATTERN = /^[A-Za-z0-9_$.:<-]{1,40}$/;
const SAFE_BROWSER_NAMES = new Set(['chrome', 'firefox', 'safari', 'edge', 'unknown']);

const STRING_CONTEXT_KEYS: Array<
  | 'action'
  | 'apiVersion'
  | 'component'
  | 'connectionType'
  | 'extensionContext'
  | 'extractor'
  | 'feature'
  | 'platform'
  | 'step'
  | 'theme'
  | 'type'
> = [
  'action',
  'apiVersion',
  'component',
  'connectionType',
  'extensionContext',
  'extractor',
  'feature',
  'platform',
  'step',
  'theme',
  'type'
];

const NUMBER_CONTEXT_KEYS: Array<
  | 'batchSize'
  | 'duration'
  | 'itemCount'
  | 'memoryUsage'
  | 'retryCount'
  | 'statusCode'
  | 'tabCount'
  | 'timeout'
> = [
  'batchSize',
  'duration',
  'itemCount',
  'memoryUsage',
  'retryCount',
  'statusCode',
  'tabCount',
  'timeout'
];

const BOOLEAN_CONTEXT_KEYS: Array<'cacheHit' | 'isOnline'> = ['cacheHit', 'isOnline'];

export class GoogleAnalyticsReporter implements ErrorReporter {
  private config: GoogleAnalyticsConfig;
  private sessionId: string;
  private browserInfo: { name?: string; version?: string } = {};
  private readonly emitTelemetryEvent?: EmitTelemetryEvent;

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
    const safeContext = this.extractSafeContext(error.context);

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

  /**
   * 提取安全的上下文信息，用于错误定位但不泄露隐私
   */
  private extractSafeContext(
    context?: Record<string, unknown>
  ): Partial<RuntimeExtensionErrorParams> {
    if (!context) {
      return {};
    }

    const safeContext: Partial<RuntimeExtensionErrorParams> = {};

    for (const key of STRING_CONTEXT_KEYS) {
      const sanitizedValue = this.sanitizeContextString(context[key]);
      if (sanitizedValue !== undefined) {
        safeContext[key] = sanitizedValue;
      }
    }

    const method = this.sanitizeHttpMethod(context.method);
    if (method !== undefined) {
      safeContext.method = method;
    }

    const locale = this.sanitizeLocale(context.locale);
    if (locale !== undefined) {
      safeContext.locale = locale;
    }

    const screenResolution = this.sanitizeResolution(context.screenResolution);
    if (screenResolution !== undefined) {
      safeContext.screenResolution = screenResolution;
    }

    const viewportSize = this.sanitizeResolution(context.viewportSize);
    if (viewportSize !== undefined) {
      safeContext.viewportSize = viewportSize;
    }

    for (const key of NUMBER_CONTEXT_KEYS) {
      const sanitizedValue = this.sanitizeContextNumber(
        context[key],
        key === 'statusCode' ? 999 : 1_000_000_000
      );
      if (sanitizedValue !== undefined) {
        safeContext[key] = sanitizedValue;
      }
    }

    for (const key of BOOLEAN_CONTEXT_KEYS) {
      if (typeof context[key] === 'boolean') {
        safeContext[key] = context[key];
      }
    }

    // 特殊处理：URL 域名（不包含路径和参数）
    if (context.url && typeof context.url === 'string') {
      try {
        const url = new URL(context.url);
        const domain = this.sanitizeDomain(url.hostname);
        const protocol = this.sanitizeProtocol(url.protocol);
        if (domain !== undefined) {
          safeContext.domain = domain;
        }
        if (protocol !== undefined) {
          safeContext.protocol = protocol;
        }
      } catch {
        // 忽略无效 URL
      }
    }

    // 特殊处理：错误堆栈（仅保留函数名和行号，移除文件路径）
    if (context.stack && typeof context.stack === 'string') {
      const stackTrace = this.sanitizeStackTrace(context.stack);
      if (stackTrace !== undefined) {
        safeContext.stackTrace = stackTrace;
      }
    }

    return safeContext;
  }

  /**
   * 清理堆栈跟踪，只保留函数名和行号
   */
  private sanitizeStackTrace(stack: string): string | undefined {
    const sanitizedFrames = stack
      .split('\n')
      .slice(0, 5) // 只保留前5行
      .map((line, index) => this.sanitizeStackFrame(line, index))
      .filter((line): line is string => line !== undefined);

    return sanitizedFrames.length > 0 ? sanitizedFrames.join('\n') : undefined;
  }

  private sanitizeStackFrame(line: string, index: number): string | undefined {
    const trimmed = line.trim();
    if (!trimmed) {
      return undefined;
    }

    if (!trimmed.startsWith('at ')) {
      return index === 0 ? 'Error' : '[stack-frame-redacted]';
    }

    const namedFrame = trimmed.match(/^at\s+([^(]+?)\s*\((?:.*):(\d+):\d+\)$/);
    if (namedFrame) {
      const label = this.sanitizeStackLabel(namedFrame[1]);
      return `at ${label}:${namedFrame[2]}`;
    }

    const anonymousFrame = trimmed.match(/^at\s+(?:.*[\\/])?([^/\\()]+):(\d+):\d+$/);
    if (anonymousFrame) {
      return `at anonymous:${anonymousFrame[2]}`;
    }

    return '[stack-frame-redacted]';
  }

  private sanitizeStackLabel(value: string): string {
    const normalized = value.trim().replace(/\s+/g, '_');
    return SAFE_STACK_LABEL_PATTERN.test(normalized) ? normalized : 'anonymous';
  }

  private generateSessionId(): string {
    // 生成会话 ID
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
  }

  private sanitizeContextString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return SAFE_CONTEXT_STRING_PATTERN.test(normalized) ? normalized : undefined;
  }

  private sanitizeHttpMethod(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toUpperCase();
    return /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(normalized) ? normalized : undefined;
  }

  private sanitizeLocale(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return SAFE_LOCALE_PATTERN.test(normalized) ? normalized : undefined;
  }

  private sanitizeResolution(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return SAFE_RESOLUTION_PATTERN.test(normalized) ? normalized : undefined;
  }

  private sanitizeContextNumber(value: unknown, max: number): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
      return undefined;
    }

    return value;
  }

  private sanitizeDomain(value: string): string | undefined {
    const normalized = value.trim().toLowerCase();
    if (!normalized || !SAFE_DOMAIN_PATTERN.test(normalized)) {
      return undefined;
    }

    return normalized;
  }

  private sanitizeProtocol(value: string): string | undefined {
    const normalized = value.trim().toLowerCase();
    return SAFE_PROTOCOL_PATTERN.test(normalized) ? normalized : undefined;
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

        if (this.browserInfo.name && !SAFE_BROWSER_NAMES.has(this.browserInfo.name)) {
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
