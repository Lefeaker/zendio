/**
 * 错误分析系统统一导出
 *
 * 提供完整的错误报告和分析功能，包括：
 * - Google Analytics 错误报告
 * - 数据匿名化处理
 * - 用户隐私控制
 * - 配置管理
 */

export * from './googleAnalyticsReporter';
export * from './dataSanitizer';
export * from './analyticsConfig';
export * from './sentryReporter';
export * from './sentryConfig';

// 便捷的初始化和使用函数
import { createGoogleAnalyticsReporter } from './googleAnalyticsReporter';
import { createSentryErrorReporter } from './sentryReporter';
import { getSentryBuildConfig } from './sentryConfig';
import {
  getAnalyticsConfigManager,
  initializeAnalyticsConfig,
  shouldReportErrors
} from './analyticsConfig';
import { createAnalyticsTransportConfig } from '../../analytics/analyticsRuntimeConfig';
import { ErrorSeverity } from '../types';
import { getErrorHandlerInstance } from '../index';
import type { ErrorHandler } from '../errorHandler';

type ReporterKey = 'ga' | 'sentry';

interface GlobalReporterRegistry {
  __errorReporterUnregisters?: Partial<Record<ReporterKey, () => void>>;
}

function getReporterRegistry(): Partial<Record<ReporterKey, () => void>> {
  const globalRegistry = globalThis as GlobalReporterRegistry;
  if (!globalRegistry.__errorReporterUnregisters) {
    globalRegistry.__errorReporterUnregisters = {};
  }
  return globalRegistry.__errorReporterUnregisters;
}

function registerReporter(key: ReporterKey, unregister: () => void): void {
  const registry = getReporterRegistry();
  registry[key]?.();
  registry[key] = unregister;
}

function unregisterReporter(key: ReporterKey): void {
  const registry = getReporterRegistry();
  registry[key]?.();
  delete registry[key];
}

/**
 * 初始化错误分析系统
 *
 * 这个函数应该在扩展启动时调用，用于：
 * 1. 初始化 Analytics 配置
 * 2. 创建 Google Analytics 报告器
 * 3. 注册到错误处理系统
 */
export async function initializeErrorAnalytics(
  targetErrorHandler: Pick<ErrorHandler, 'addReporter'> = getErrorHandlerInstance()
): Promise<void> {
  try {
    // 初始化配置
    const config = createAnalyticsTransportConfig(await initializeAnalyticsConfig());

    if (config.enabled && shouldReportErrors()) {
      const gaReporter = createGoogleAnalyticsReporter({
        measurementId: config.measurementId,
        enabled: config.enabled,
        debugMode: config.debugMode,
        transportMode: config.transportMode,
        reportingInterval: config.reportingInterval,
        batchSize: config.batchSize,
        ...(config.proxyEndpoint ? { proxyEndpoint: config.proxyEndpoint } : {}),
        ...(config.userConsent ? { userConsent: config.userConsent } : {}),
        resolveAnalyticsConfig: () => getAnalyticsConfigManager().getConfig()
      });

      registerReporter('ga', targetErrorHandler.addReporter(gaReporter));

      console.log('[Error Analytics] Google Analytics reporter initialized');

      const sentryConfig = getSentryBuildConfig();
      if (sentryConfig.enabled && sentryConfig.dsn) {
        const sentryReporter = createSentryErrorReporter({
          dsn: sentryConfig.dsn,
          enabled: true,
          ...(sentryConfig.environment ? { environment: sentryConfig.environment } : {}),
          ...(sentryConfig.release ? { release: sentryConfig.release } : {})
        });
        registerReporter('sentry', targetErrorHandler.addReporter(sentryReporter));
        console.log('[Error Analytics] Sentry reporter initialized');
      } else {
        unregisterReporter('sentry');
      }
    } else {
      unregisterReporter('ga');
      unregisterReporter('sentry');
      console.log('[Error Analytics] Error reporting disabled by user preference');
    }
  } catch (error) {
    console.warn('[Error Analytics] Failed to initialize:', error);
  }
}

/**
 * 停用错误分析系统
 *
 * 当用户撤销同意或需要停止错误报告时调用
 */
export function disableErrorAnalytics(): void {
  try {
    unregisterReporter('ga');
    unregisterReporter('sentry');

    console.log('[Error Analytics] Error reporting disabled');
  } catch (error) {
    console.warn('[Error Analytics] Failed to disable error reporting:', error);
  }
}
/**
 * 更新错误分析配置
 *
 * 当用户更改隐私设置时调用
 */
export async function updateErrorAnalyticsConfig(
  enabled: boolean,
  targetErrorHandler: Pick<ErrorHandler, 'addReporter'> = getErrorHandlerInstance()
): Promise<void> {
  try {
    if (enabled && shouldReportErrors()) {
      // 如果启用且之前未初始化，重新初始化
      const registry = getReporterRegistry();
      if (!registry.ga && !registry.sentry) {
        await initializeErrorAnalytics(targetErrorHandler);
      }
    } else {
      // 如果禁用，停用现有的报告器
      disableErrorAnalytics();
    }
  } catch (error) {
    console.warn('[Error Analytics] Failed to update config:', error);
  }
}

/**
 * 获取错误分析状态
 */
export function getErrorAnalyticsStatus(): {
  enabled: boolean;
  hasReporter: boolean;
  configLoaded: boolean;
  reporters: string[];
} {
  const configManager = getAnalyticsConfigManager();
  const config = createAnalyticsTransportConfig(configManager.getConfig());
  const reporters = Object.keys(getReporterRegistry());

  return {
    enabled: config.enabled && shouldReportErrors(),
    hasReporter: reporters.length > 0,
    configLoaded: !!config.clientId,
    reporters
  };
}

/**
 * 手动报告错误（用于测试）
 *
 * 仅在调试模式下使用
 */
export async function reportTestError(): Promise<void> {
  interface GlobalWithProcess {
    process?: {
      env?: {
        NODE_ENV?: string;
      };
    };
  }

  const isDevelopment =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as GlobalWithProcess).process === 'object' &&
    (globalThis as GlobalWithProcess).process?.env?.NODE_ENV === 'development';

  if (!isDevelopment) {
    console.warn('[Error Analytics] Test error reporting only available in development mode');
    return;
  }

  const { handleError } = await import('../index');

  await handleError({
    code: 'TEST_ERROR',
    domain: 'unknown',
    message: 'TEST_ERROR_ANALYTICS_VERIFICATION',
    severity: ErrorSeverity.INFO,
    recoverable: true,
    userMessage: 'TEST_ERROR_ANALYTICS_VERIFICATION_USER_MESSAGE',
    context: {
      test: true,
      timestamp: Date.now()
    }
  });

  console.log('[Error Analytics] Test error reported');
}

// 类型导出
export type { AnalyticsConfig, UserConsent } from './analyticsConfig';

export type { SanitizationReport } from './dataSanitizer';

/**
 * 使用示例：
 *
 * // 1. 在扩展启动时初始化
 * import { initializeErrorAnalytics } from './shared/errors/analytics';
 * await initializeErrorAnalytics();
 *
 * // 2. 在选项页面中管理用户同意
 * import { setAnalyticsConsent } from './shared/errors/analytics';
 * await setAnalyticsConsent(true, true); // analytics, errorReporting
 *
 * // 3. 正常使用错误处理系统，错误会自动报告到 GA
 * import { handleError } from './shared/errors';
 * await handleError(someError);
 *
 * // 4. 检查分析状态
 * import { getErrorAnalyticsStatus } from './shared/errors/analytics';
 * const status = getErrorAnalyticsStatus();
 * console.log('Analytics enabled:', status.enabled);
 */
