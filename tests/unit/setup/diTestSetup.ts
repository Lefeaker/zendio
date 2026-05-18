/**
 * 依赖注入测试设置
 * 为单元测试提供DI容器的设置和清理
 */

import {
  resetGlobalRegistry,
  createTestRegistry,
  registry,
  TOKENS,
  type ServiceRegistry
} from '@shared/di';
import {
  createMockPlatformServices,
  createMockErrorHandler,
  createMockGlobalStateManager,
  createMockUsageStatsStore,
  createMockDialogRegistry
} from '@shared/di/testHelpers';
import { createErrorHandler } from '@shared/errors/errorHandler';
import { createGlobalStateManager } from '@shared/state/globalStateManager';
import { createUsageStatsStore } from '../../../src/background/services/usageStats';

/**
 * 为测试创建预配置的注册表
 */
export function createTestRegistryWithDefaults(): ServiceRegistry {
  const testRegistry = createTestRegistry();

  // 注册常用的mock服务
  testRegistry.register(TOKENS.platformServices, createMockPlatformServices);
  testRegistry.register(TOKENS.errorHandler, createMockErrorHandler);
  testRegistry.register(TOKENS.globalStateManager, createMockGlobalStateManager);
  testRegistry.register(TOKENS.usageStatsStore, createMockUsageStatsStore);
  testRegistry.register(TOKENS.dialogRegistry, createMockDialogRegistry);

  return testRegistry;
}

/**
 * 在测试前设置DI容器
 */
export function setupDIForTest(): void {
  // 重置全局注册表
  resetGlobalRegistry();

  // 注册测试用的mock服务
  registry.register(TOKENS.platformServices, createMockPlatformServices);
  registry.register(TOKENS.errorHandler, createMockErrorHandler);
  registry.register(TOKENS.globalStateManager, createMockGlobalStateManager);
  registry.register(TOKENS.usageStatsStore, createMockUsageStatsStore);
  registry.register(TOKENS.dialogRegistry, createMockDialogRegistry);
}

/**
 * 为集成测试设置DI容器（使用真实服务）
 */
export function setupDIForIntegrationTest(): void {
  // 重置全局注册表
  resetGlobalRegistry();

  // 注册真实服务用于集成测试
  registry.register(TOKENS.platformServices, createMockPlatformServices); // 平台服务仍使用mock
  registry.register(TOKENS.errorHandler, createErrorHandler); // 使用真实ErrorHandler
  registry.register(TOKENS.globalStateManager, createGlobalStateManager); // 使用真实GlobalStateManager
  registry.register(TOKENS.usageStatsStore, createUsageStatsStore); // 使用真实UsageStatsStore
  registry.register(TOKENS.dialogRegistry, createMockDialogRegistry); // UI组件使用mock
}

/**
 * 在测试后清理DI容器
 */
export function teardownDIAfterTest(): void {
  resetGlobalRegistry();
}

/**
 * 测试辅助函数：在隔离的DI环境中运行测试
 */
type ServiceFactory = () => unknown;

export async function withIsolatedDI<T>(
  testFn: () => T | Promise<T>,
  customServices?: Partial<Record<symbol, ServiceFactory>>
): Promise<T> {
  // 保存当前状态
  const originalServices = new Map<symbol, unknown>();
  for (const token of Object.values(TOKENS)) {
    if (registry.has(token)) {
      originalServices.set(token, registry.resolve(token));
    }
  }

  try {
    // 重置并设置测试环境
    resetGlobalRegistry();
    setupDIForTest();

    // 注册自定义服务
    if (customServices) {
      for (const token of Object.getOwnPropertySymbols(customServices)) {
        const factory = customServices[token];
        if (factory) {
          registry.register(token, factory);
        }
      }
    }

    // 运行测试
    return await testFn();
  } finally {
    // 恢复原始状态
    resetGlobalRegistry();
    for (const [token, instance] of originalServices) {
      registry.register(token, () => instance);
    }
  }
}

/**
 * 创建用于特定测试场景的注册表
 */
export function createScenarioRegistry(
  scenario: 'background' | 'content' | 'options'
): ServiceRegistry {
  const testRegistry = createTestRegistry();

  switch (scenario) {
    case 'background':
      // 背景页场景：包含所有服务
      testRegistry.register(TOKENS.platformServices, createMockPlatformServices);
      testRegistry.register(TOKENS.errorHandler, createMockErrorHandler);
      testRegistry.register(TOKENS.globalStateManager, createMockGlobalStateManager);
      testRegistry.register(TOKENS.usageStatsStore, createMockUsageStatsStore);
      break;

    case 'content':
      // 内容脚本场景：包含UI相关服务
      testRegistry.register(TOKENS.platformServices, createMockPlatformServices);
      testRegistry.register(TOKENS.errorHandler, createMockErrorHandler);
      testRegistry.register(TOKENS.globalStateManager, createMockGlobalStateManager);
      testRegistry.register(TOKENS.dialogRegistry, createMockDialogRegistry);
      break;

    case 'options':
      // 选项页场景：不包含使用统计等背景页服务
      testRegistry.register(TOKENS.platformServices, createMockPlatformServices);
      testRegistry.register(TOKENS.errorHandler, createMockErrorHandler);
      testRegistry.register(TOKENS.globalStateManager, createMockGlobalStateManager);
      break;
  }

  return testRegistry;
}

/**
 * 验证DI容器状态的辅助函数
 */
export function assertDIState(expectedTokens: symbol[]): void {
  for (const token of expectedTokens) {
    if (!registry.has(token)) {
      throw new Error(`Expected service ${token.toString()} to be registered`);
    }
  }
}

/**
 * 获取测试用的服务实例
 */
export function getTestService<T>(token: symbol): T {
  if (!registry.has(token)) {
    throw new Error(
      `Test service ${token.toString()} not registered. Call setupDIForTest() first.`
    );
  }
  return registry.resolve<T>(token);
}
