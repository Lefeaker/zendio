/**
 * 依赖注入容器主入口
 * 提供全局注册表和测试辅助函数
 */

import {
  type ServiceRegistry,
  type ScopedServiceRegistry,
  createServiceRegistry,
  createScopedRegistry,
  repositoryContainer,
  container,
  registerRepositories,
  registerFallbackRepositories,
  registerMockRepositories,
  resolveRepository
} from './serviceRegistry';
import { DI_TOKENS, TOKENS, getTokenName, type ServiceToken } from './tokens';

export {
  type ServiceRegistry,
  type ScopedServiceRegistry,
  createServiceRegistry,
  createScopedRegistry,
  repositoryContainer,
  container,
  registerRepositories,
  registerFallbackRepositories,
  registerMockRepositories,
  resolveRepository,
  TOKENS,
  DI_TOKENS,
  getTokenName,
  type ServiceToken
};

function createFallbackRegistry(): ServiceRegistry {
  const services = new Map<
    symbol,
    { factory: () => unknown; instance?: unknown; resolved: boolean }
  >();
  const disposeInstance = (instance: unknown): void => {
    if (
      typeof instance === 'object' &&
      instance !== null &&
      'dispose' in instance &&
      typeof (instance as { dispose?: unknown }).dispose === 'function'
    ) {
      (instance as { dispose: () => void }).dispose();
    }
  };

  return {
    register<T>(token: symbol, factory: () => T): void {
      services.set(token, { factory, resolved: false });
    },
    resolve<T>(token: symbol): T {
      const entry = services.get(token);
      if (!entry) {
        throw new Error(`[ServiceRegistry] Service not registered: ${String(token)}`);
      }
      if (!entry.resolved) {
        entry.instance = entry.factory();
        entry.resolved = true;
      }
      return entry.instance as T;
    },
    has(token: symbol): boolean {
      return services.has(token);
    },
    dispose(token: symbol): void {
      const entry = services.get(token);
      if (entry) {
        disposeInstance(entry.instance);
        entry.instance = undefined;
        entry.resolved = false;
      }
    },
    reset(): void {
      for (const entry of services.values()) {
        disposeInstance(entry.instance);
      }
      services.clear();
    }
  };
}

function instantiateRegistry(): ServiceRegistry {
  if (typeof createServiceRegistry === 'function') {
    return createServiceRegistry();
  }
  return createFallbackRegistry();
}

class ProxyServiceRegistry implements ServiceRegistry {
  constructor(private active: ServiceRegistry) {}

  setActiveRegistry(registry: ServiceRegistry): void {
    this.active = registry;
  }

  getActiveRegistry(): ServiceRegistry {
    return this.active;
  }

  register<T>(token: symbol, factory: () => T): void {
    this.active.register(token, factory);
  }

  resolve<T>(token: symbol): T {
    return this.active.resolve<T>(token);
  }

  has(token: symbol): boolean {
    return this.active.has(token);
  }

  dispose(token: symbol): void {
    this.active.dispose(token);
  }

  reset(): void {
    this.active.reset();
  }
}

const proxyRegistry = new ProxyServiceRegistry(createFallbackRegistry());

/**
 * 全局服务注册表实例
 * 主要用于背景页和选项页等持久上下文
 */
export const registry: ServiceRegistry = proxyRegistry;

/**
 * 设置全局注册表（主要用于测试）
 * @param newRegistry 新的注册表实例
 */
export function setGlobalRegistry(newRegistry: ServiceRegistry): void {
  proxyRegistry.setActiveRegistry(newRegistry);
}

/**
 * 测试辅助函数：在指定的注册表作用域内执行函数
 * @param testRegistry 测试用的注册表
 * @param fn 要执行的函数
 */
export async function withTestRegistry<T>(
  testRegistry: ServiceRegistry,
  fn: () => T | Promise<T>
): Promise<T> {
  const originalRegistry = proxyRegistry.getActiveRegistry();

  try {
    // 临时替换全局注册表
    setGlobalRegistry(testRegistry);

    // 执行测试函数
    return await fn();
  } finally {
    // 恢复原始注册表
    setGlobalRegistry(originalRegistry);
  }
}

/**
 * 创建测试用的注册表，预配置常用的mock服务
 */
export function createTestRegistry(): ServiceRegistry {
  const testRegistry = instantiateRegistry();

  // 可以在这里预注册一些常用的测试mock
  // 例如：
  // testRegistry.register(TOKENS.platformServices, () => createMockPlatformServices());

  return testRegistry;
}

/**
 * 获取服务的便捷函数
 * @param token 服务标识符
 */
export function getService<T>(token: symbol): T {
  return registry.resolve<T>(token);
}

/**
 * 检查服务是否已注册
 * @param token 服务标识符
 */
export function hasService(token: symbol): boolean {
  return registry.has(token);
}

/**
 * 注册服务的便捷函数
 * @param token 服务标识符
 * @param factory 工厂函数
 */
export function registerService<T>(token: symbol, factory: () => T): void {
  registry.register(token, factory);
}

/**
 * 为遗留代码提供的单例获取函数
 * 如果服务未注册，使用提供的工厂函数注册并返回实例
 * @param token 服务标识符
 * @param factory 工厂函数
 * @deprecated 仅用于渐进式迁移，新代码应直接使用依赖注入
 */
export function getLegacySingleton<T>(token: symbol, factory: () => T): T {
  if (!registry.has(token)) {
    console.warn(
      `[DI] Auto-registering legacy singleton for ${getTokenName(token)}. Consider explicit registration.`
    );
    registry.register(token, factory);
  }
  return registry.resolve<T>(token);
}

/**
 * 重置全局注册表（主要用于测试清理）
 */
export function resetGlobalRegistry(): void {
  registry.reset();
}
