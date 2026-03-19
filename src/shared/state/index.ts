export type { StateStore, StateListener } from './ReactiveStore';
export { ReactiveStore } from './ReactiveStore';
export {
  GlobalStateManager,
  configureGlobalStateManagerStorage,
  createGlobalStateManager,
  getGlobalStateManager,
  globalStateManager,
  getStateStore,
  resetGlobalState
} from './globalStateManager';
export type { SyncOptions } from './globalStateManager';
export { STATE_KEYS } from './keys';
export type { StateKey } from './keys';

// 依赖注入友好的API
import { registry, TOKENS } from '../di';
import { createGlobalStateManager, type GlobalStateManager } from './globalStateManager';

/**
 * 注册自定义GlobalStateManager实例
 * @param factory 创建GlobalStateManager的工厂函数
 */
export function registerGlobalStateManager(factory: () => GlobalStateManager): void {
  registry.register(TOKENS.globalStateManager, factory);
}

/**
 * 获取GlobalStateManager实例（依赖注入版本）
 */
export function getGlobalStateManagerInstance(): GlobalStateManager {
  if (!registry.has(TOKENS.globalStateManager)) {
    registry.register(TOKENS.globalStateManager, createGlobalStateManager);
  }
  return registry.resolve<GlobalStateManager>(TOKENS.globalStateManager);
}
