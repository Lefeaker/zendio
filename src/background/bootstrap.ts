/**
 * 背景页依赖注入引导程序
 * 负责注册所有背景页需要的服务
 */

import { registry, TOKENS } from '../shared/di';
import { createErrorHandler } from '../shared/errors/errorHandler';
import { configureAnalyticsConfigManager } from '../shared/errors/analytics/analyticsConfig';
import { initializeErrorAnalytics } from '../shared/errors/analytics';
import { registerGlobalErrorBoundary } from '../shared/errors/globalErrorBoundary';
import {
  configureGlobalStateManagerStorage,
  createGlobalStateManager
} from '../shared/state/globalStateManager';
import { configureUsageStatsStorage, createUsageStatsStore } from './services/usageStats';
import { configureI18nStorage } from '@i18n';
import type { StorageService } from '../platform/interfaces/storage';

let backgroundDependencyStorage: StorageService | null = null;
let cleanupBackgroundErrorBoundary: (() => void) | null = null;

export function configureBackgroundDependencyStorage(storage: StorageService): void {
  backgroundDependencyStorage = storage;
}

function resolveBackgroundDependencyStorage(storage?: StorageService): StorageService {
  if (storage) {
    backgroundDependencyStorage = storage;
    return storage;
  }

  if (!backgroundDependencyStorage) {
    throw new Error('[Background] StorageService is required for bootstrap.');
  }

  return backgroundDependencyStorage;
}

/**
 * 引导背景页依赖
 * 注册所有必要的服务到全局注册表
 */
export function bootstrapBackgroundDependencies(storage?: StorageService): void {
  console.log('[Background] Bootstrapping dependencies...');
  const resolvedStorage = resolveBackgroundDependencyStorage(storage);
  configureAnalyticsConfigManager(resolvedStorage);
  configureGlobalStateManagerStorage(resolvedStorage);
  configureI18nStorage(resolvedStorage.sync);
  configureUsageStatsStorage(resolvedStorage);

  // 注册错误处理器
  const errorHandler = createErrorHandler();
  registry.register(TOKENS.errorHandler, () => {
    // 可以在这里配置背景页特定的错误报告器
    // errorHandler.addReporter(createBackgroundErrorReporter());

    return errorHandler;
  });

  cleanupBackgroundErrorBoundary?.();
  cleanupBackgroundErrorBoundary = registerGlobalErrorBoundary({
    domain: 'background',
    errorHandler,
    metadata: {
      extensionContext: 'background'
    }
  });

  void initializeErrorAnalytics(errorHandler).catch((error) => {
    console.warn('[Background] Failed to initialize error analytics:', error);
  });

  // 注册全局状态管理器
  registry.register(TOKENS.globalStateManager, createGlobalStateManager);

  // 注册使用统计存储
  registry.register(TOKENS.usageStatsStore, createUsageStatsStore);

  // 平台服务已经在platform/services.ts中自动注册
  // 这里可以配置背景页特定的覆盖
  // configurePlatformServices({
  //   // 背景页特定的服务覆盖
  // });

  console.log('[Background] Dependencies bootstrapped successfully');
}

/**
 * 清理背景页依赖
 * 在service worker suspend时调用
 */
export function cleanupBackgroundDependencies(): void {
  console.log('[Background] Cleaning up dependencies...');

  try {
    // 释放使用统计存储
    if (registry.has(TOKENS.usageStatsStore)) {
      registry.dispose(TOKENS.usageStatsStore);
    }

    // 释放全局状态管理器
    if (registry.has(TOKENS.globalStateManager)) {
      registry.dispose(TOKENS.globalStateManager);
    }

    // 释放错误处理器
    if (registry.has(TOKENS.errorHandler)) {
      registry.dispose(TOKENS.errorHandler);
    }

    cleanupBackgroundErrorBoundary?.();
    cleanupBackgroundErrorBoundary = null;

    console.log('[Background] Dependencies cleaned up successfully');
  } catch (error) {
    console.error('[Background] Error during dependency cleanup:', error);
  }
}

/**
 * 重置背景页依赖
 * 主要用于热重载或测试
 */
export function resetBackgroundDependencies(storage?: StorageService): void {
  console.log('[Background] Resetting dependencies...');

  cleanupBackgroundDependencies();
  registry.reset();
  bootstrapBackgroundDependencies(storage);

  console.log('[Background] Dependencies reset successfully');
}

/**
 * 检查背景页依赖是否已初始化
 */
export function isBackgroundDependenciesInitialized(): boolean {
  return (
    registry.has(TOKENS.errorHandler) &&
    registry.has(TOKENS.globalStateManager) &&
    registry.has(TOKENS.usageStatsStore)
  );
}

/**
 * 确保背景页依赖已初始化
 * 如果未初始化则自动引导
 */
export function ensureBackgroundDependencies(storage?: StorageService): void {
  if (!isBackgroundDependenciesInitialized()) {
    bootstrapBackgroundDependencies(storage);
  }
}
