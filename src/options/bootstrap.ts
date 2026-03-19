/**
 * 选项页 legacy compatibility 引导程序。
 *
 * 正式页面入口已经固定为 `src/options/index.ts -> src/options/app/bootstrap.ts`。
 * 本文件仅保留给旧测试与兼容路径使用，不再代表长期的 Options 主启动链。
 */

import { registry, TOKENS } from '../shared/di';
import { createErrorHandler } from '../shared/errors/errorHandler';
import { registerGlobalErrorBoundary } from '../shared/errors/globalErrorBoundary';
import { configureAnalyticsConfigManager } from '../shared/errors/analytics/analyticsConfig';
import { initializeErrorAnalytics } from '../shared/errors/analytics';
import { configureGlobalStateManagerStorage, createGlobalStateManager } from '../shared/state/globalStateManager';
import type { StorageService } from '../platform/interfaces/storage';

let optionsDependencyStorage: StorageService | null = null;
let cleanupOptionsErrorBoundary: (() => void) | null = null;

export function configureOptionsDependencyStorage(storage: StorageService): void {
  optionsDependencyStorage = storage;
}

function resolveOptionsDependencyStorage(storage?: StorageService): StorageService {
  if (storage) {
    optionsDependencyStorage = storage;
    return storage;
  }

  if (!optionsDependencyStorage) {
    throw new Error('[Options] StorageService is required for legacy bootstrap.');
  }

  return optionsDependencyStorage;
}

/**
 * 引导 legacy 选项页依赖。
 * Phase 3 目标是让此文件退出主路径，仅保留显式兼容职责或被删除。
 */
export function bootstrapOptionsDependencies(storage?: StorageService): void {
  console.log('[Options] Bootstrapping dependencies...');
  const resolvedStorage = resolveOptionsDependencyStorage(storage);
  configureGlobalStateManagerStorage(resolvedStorage);
  configureAnalyticsConfigManager(resolvedStorage);

  // 注册错误处理器
  const errorHandler = createErrorHandler();
  registry.register(TOKENS.errorHandler, () => {
    // 选项页可能需要不同的错误处理策略
    // 例如：显示用户友好的错误消息而不是控制台日志

    return errorHandler;
  });

  cleanupOptionsErrorBoundary?.();
  cleanupOptionsErrorBoundary = registerGlobalErrorBoundary({
    domain: 'options',
    errorHandler,
    metadata: {
      extensionContext: 'options'
    },
    target: window
  });
  void initializeErrorAnalytics(errorHandler).catch((error) => {
    console.warn('[Options] Failed to initialize error analytics:', error);
  });

  // 注册全局状态管理器
  registry.register(TOKENS.globalStateManager, createGlobalStateManager);

  // 选项页不需要使用统计存储，但可能需要其他服务
  // 例如：主题管理器、设置验证器等

  console.log('[Options] Dependencies bootstrapped successfully');
}

/**
 * 清理选项页依赖
 * 在页面卸载时调用
 */
export function cleanupOptionsDependencies(): void {
  console.log('[Options] Cleaning up dependencies...');
  
  try {
    // 释放全局状态管理器
    if (registry.has(TOKENS.globalStateManager)) {
      registry.dispose(TOKENS.globalStateManager);
    }

    // 释放错误处理器
    if (registry.has(TOKENS.errorHandler)) {
      registry.dispose(TOKENS.errorHandler);
    }

    cleanupOptionsErrorBoundary?.();
    cleanupOptionsErrorBoundary = null;

    console.log('[Options] Dependencies cleaned up successfully');
  } catch (error) {
    console.error('[Options] Error during dependency cleanup:', error);
  }
}

/**
 * 重置选项页依赖
 * 主要用于测试
 */
export function resetOptionsDependencies(storage?: StorageService): void {
  console.log('[Options] Resetting dependencies...');
  
  cleanupOptionsDependencies();
  registry.reset();
  bootstrapOptionsDependencies(storage);
  
  console.log('[Options] Dependencies reset successfully');
}

/**
 * 检查选项页依赖是否已初始化
 */
export function isOptionsDependenciesInitialized(): boolean {
  return registry.has(TOKENS.errorHandler) &&
         registry.has(TOKENS.globalStateManager);
}

/**
 * 确保选项页依赖已初始化
 * 如果未初始化则自动引导
 */
export function ensureOptionsDependencies(storage?: StorageService): void {
  if (!isOptionsDependenciesInitialized()) {
    bootstrapOptionsDependencies(storage);
  }
}

/**
 * Legacy compatibility bootstrap。
 * 正式页面不应再从这里启动。
 */
export function bootstrapOptionsApp(storage?: StorageService): void {
  // 确保依赖已初始化
  ensureOptionsDependencies(storage);
  
  // 设置页面卸载清理
  window.addEventListener('beforeunload', cleanupOptionsDependencies);
  
  // 其他选项页特定的初始化逻辑
  // 例如：主题初始化、语言设置等
}
