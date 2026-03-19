import { ChromeMessagingRepository } from '../../infrastructure/repositories/ChromeMessagingRepository';
import { ChromeOptionsRepository } from '../../infrastructure/repositories/ChromeOptionsRepository';
import { ChromeYamlRepository } from '../../infrastructure/repositories/ChromeYamlRepository';
import { ChromeClipRepository } from '../../infrastructure/repositories/ChromeClipRepository';
import { ChromeVideoRepository } from '../../infrastructure/repositories/ChromeVideoRepository';
import { ChromeReaderRepository } from '../../infrastructure/repositories/ChromeReaderRepository';
import { ChromeNavigationRepository } from '../../infrastructure/repositories/ChromeNavigationRepository';
import type {
  IMessagingRepository,
  IOptionsRepository,
  IYamlRepository,
  IClipRepository,
  IVideoRepository,
  IReaderRepository,
  INavigationRepository
} from '../repositories';
import { DI_TOKENS } from './tokens';

/**
 * 轻量级依赖注入容器
 * 支持懒加载、生命周期管理和作用域隔离
 */

export interface ServiceRegistry {
  /**
   * 注册服务工厂函数
   * @param token 服务标识符
   * @param factory 工厂函数，首次解析时调用
   */
  register<T>(token: symbol, factory: () => T): void;

  /**
   * 解析服务实例
   * @param token 服务标识符
   * @returns 服务实例，首次调用时执行工厂函数
   */
  resolve<T>(token: symbol): T;

  /**
   * 检查服务是否已注册
   * @param token 服务标识符
   */
  has(token: symbol): boolean;

  /**
   * 释放特定服务实例
   * @param token 服务标识符
   */
  dispose(token: symbol): void;

  /**
   * 重置所有服务，清理实例缓存
   */
  reset(): void;
}

interface ServiceEntry<T = unknown> {
  factory: () => T;
  instance?: T;
  resolved: boolean;
}

interface Disposable {
  dispose(): void;
}

const isDisposable = (value: unknown): value is Disposable =>
  typeof value === 'object' && value !== null && typeof (value as Disposable).dispose === 'function';

function disposeServiceInstance(instance: unknown, token: symbol, scope: string): void {
  if (!isDisposable(instance)) {
    return;
  }
  try {
    instance.dispose();
  } catch (error) {
    console.warn(`[${scope}] Error disposing service`, token.toString(), error);
  }
}

export class DefaultServiceRegistry implements ServiceRegistry {
  private services = new Map<symbol, ServiceEntry<unknown>>();

  register<T>(token: symbol, factory: () => T): void {
    if (this.services.has(token)) {
      console.warn('[ServiceRegistry] Overriding existing service registration', token.toString());
    }
    
    this.services.set(token, {
      factory,
      resolved: false
    });
  }

  resolve<T>(token: symbol): T {
    const entry = this.services.get(token);
    if (!entry) {
      throw new Error(`[ServiceRegistry] Service not registered: ${token.toString()}`);
    }

    if (!entry.resolved) {
      try {
        entry.instance = entry.factory();
        entry.resolved = true;
      } catch (error) {
        throw new Error(`[ServiceRegistry] Failed to resolve service ${token.toString()}: ${error}`);
      }
    }

    return entry.instance as T;
  }

  has(token: symbol): boolean {
    return this.services.has(token);
  }

  dispose(token: symbol): void {
    const entry = this.services.get(token);
    if (entry && entry.resolved) {
      disposeServiceInstance(entry.instance, token, 'ServiceRegistry');
      entry.instance = undefined;
      entry.resolved = false;
    }
  }

  reset(): void {
    // 先dispose所有已解析的服务
    for (const [token] of this.services) {
      this.dispose(token);
    }
    
    // 清空注册表
    this.services.clear();
  }
}

/**
 * 创建新的服务注册表实例
 */
export function createServiceRegistry(): ServiceRegistry {
  return new DefaultServiceRegistry();
}

/**
 * 作用域服务注册表，支持父级回退
 */
export class ScopedServiceRegistry implements ServiceRegistry {
  private localServices = new Map<symbol, ServiceEntry<unknown>>();

  constructor(private parent?: ServiceRegistry) {}

  register<T>(token: symbol, factory: () => T): void {
    this.localServices.set(token, {
      factory,
      resolved: false
    });
  }

  resolve<T>(token: symbol): T {
    // 优先从本地作用域解析
    const localEntry = this.localServices.get(token);
    if (localEntry) {
      if (!localEntry.resolved) {
        try {
          localEntry.instance = localEntry.factory();
          localEntry.resolved = true;
        } catch (error) {
          throw new Error(`[ScopedServiceRegistry] Failed to resolve local service ${token.toString()}: ${error}`);
        }
      }
      return localEntry.instance as T;
    }

    // 回退到父级注册表
    if (this.parent) {
      return this.parent.resolve<T>(token);
    }

    throw new Error(`[ScopedServiceRegistry] Service not registered: ${token.toString()}`);
  }

  has(token: symbol): boolean {
    return this.localServices.has(token) || (this.parent?.has(token) ?? false);
  }

  dispose(token: symbol): void {
    const entry = this.localServices.get(token);
    if (entry && entry.resolved) {
      disposeServiceInstance(entry.instance, token, 'ScopedServiceRegistry');
      entry.instance = undefined;
      entry.resolved = false;
    }
  }

  reset(): void {
    // 只重置本地作用域的服务
    for (const [token] of this.localServices) {
      this.dispose(token);
    }
    this.localServices.clear();
  }

  /**
   * 释放整个作用域，包括所有本地服务
   */
  disposeScope(): void {
    this.reset();
  }
}

/**
 * 创建作用域服务注册表
 * @param parent 父级注册表，用于服务回退
 */
export function createScopedRegistry(parent?: ServiceRegistry): ScopedServiceRegistry {
  return new ScopedServiceRegistry(parent);
}

type Constructor<T> = new () => T;

class RepositoryServiceContainer {
  private singletons = new Map<symbol, unknown>();
  private factories = new Map<symbol, () => unknown>();

  registerSingleton<T>(token: symbol, factory: () => T): void {
    this.factories.set(token, () => {
      if (!this.singletons.has(token)) {
        this.singletons.set(token, factory());
      }
      return this.singletons.get(token) as T;
    });
    this.singletons.delete(token);
  }

  resolve<T>(token: symbol): T {
    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`[RepositoryContainer] Service not registered for token: ${String(token)}`);
    }
    return factory() as T;
  }

  has(token: symbol): boolean {
    return this.factories.has(token);
  }

  reset(): void {
    this.singletons.clear();
    this.factories.clear();
  }
}

export const repositoryContainer = new RepositoryServiceContainer();
export const container = repositoryContainer;

let defaultsRegistered = false;

function registerRepositorySingletons(
  implementations: {
    options: () => IOptionsRepository;
    messaging: () => IMessagingRepository;
    yaml: () => IYamlRepository;
    clip: () => IClipRepository;
    video: () => IVideoRepository;
    reader: () => IReaderRepository;
    navigation: () => INavigationRepository;
  }
): void {
  repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, implementations.options);
  repositoryContainer.registerSingleton(DI_TOKENS.IMessagingRepository, implementations.messaging);
  repositoryContainer.registerSingleton(DI_TOKENS.IYamlRepository, implementations.yaml);
  repositoryContainer.registerSingleton(DI_TOKENS.IClipRepository, implementations.clip);
  repositoryContainer.registerSingleton(DI_TOKENS.IVideoRepository, implementations.video);
  repositoryContainer.registerSingleton(DI_TOKENS.IReaderRepository, implementations.reader);
  repositoryContainer.registerSingleton(DI_TOKENS.INavigationRepository, implementations.navigation);
}

export function registerRepositories(): void {
  registerRepositorySingletons({
    options: () => new ChromeOptionsRepository(),
    messaging: () => new ChromeMessagingRepository(),
    yaml: () => {
      const optionsRepo = repositoryContainer.resolve<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
      return new ChromeYamlRepository(optionsRepo);
    },
    clip: () => {
      const optionsRepo = repositoryContainer.resolve<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
      const messagingRepo = repositoryContainer.resolve<IMessagingRepository>(DI_TOKENS.IMessagingRepository);
      return new ChromeClipRepository(optionsRepo, messagingRepo);
    },
    video: () => {
      const optionsRepo = repositoryContainer.resolve<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
      const messagingRepo = repositoryContainer.resolve<IMessagingRepository>(DI_TOKENS.IMessagingRepository);
      return new ChromeVideoRepository(optionsRepo, messagingRepo);
    },
    reader: () => {
      const optionsRepo = repositoryContainer.resolve<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
      const messagingRepo = repositoryContainer.resolve<IMessagingRepository>(DI_TOKENS.IMessagingRepository);
      return new ChromeReaderRepository(optionsRepo, messagingRepo);
    },
    navigation: () => new ChromeNavigationRepository()
  });
  defaultsRegistered = true;
}

export function registerMockRepositories(constructors: {
  options: Constructor<IOptionsRepository>;
  messaging: Constructor<IMessagingRepository>;
  yaml: Constructor<IYamlRepository>;
  clip: Constructor<IClipRepository>;
  video: Constructor<IVideoRepository>;
  reader: Constructor<IReaderRepository>;
  navigation: Constructor<INavigationRepository>;
}): void {
  registerRepositorySingletons({
    options: () => new constructors.options(),
    messaging: () => new constructors.messaging(),
    yaml: () => new constructors.yaml(),
    clip: () => new constructors.clip(),
    video: () => new constructors.video(),
    reader: () => new constructors.reader(),
    navigation: () => new constructors.navigation()
  });
}

export function resolveRepository<T>(token: symbol): T {
  return repositoryContainer.resolve<T>(token);
}

if (typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined' && !defaultsRegistered) {
  registerRepositories();
}
