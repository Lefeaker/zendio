import type { StoredOptions, CompleteOptions } from '../types/options';

/**
 * Legacy compatibility contract for content/background consumers that still
 * require the historical load/save/snapshot/subscribe semantics.
 *
 * `IOptionsRepository` is the only long-term repository contract for the
 * Options UI and the normalized persistence chain. Do not introduce new UI or
 * shared-layer dependencies on this interface.
 */
export interface OptionsRepository {
  /**
   * 异步加载选项，确保从存储同步
   * @returns Promise<StoredOptions> 深拷贝的选项对象
   */
  load(): Promise<StoredOptions>;

  /**
   * 保存选项到存储并更新缓存
   * @param options 要保存的选项对象
   */
  save(options: StoredOptions | CompleteOptions): Promise<void>;

  /**
   * 获取当前缓存的选项快照（同步操作）
   * @returns StoredOptions | null 深拷贝的选项对象，如果未初始化则返回null
   */
  snapshot(): StoredOptions | null;

  /**
   * 订阅选项变更
   * @param listener 变更监听器，接收深拷贝的选项对象
   * @returns 取消订阅的函数
   */
  subscribe(listener: (options: StoredOptions | undefined) => void): () => void;

  /**
   * 重置仓库状态（主要用于测试）
   */
  reset(): void;
}

/**
 * 选项读取器接口 - 只读操作的最小化接口
 * 适用于只需要读取选项的场景，遵循接口隔离原则
 */
export interface OptionsReader {
  load(): Promise<StoredOptions>;
  snapshot(): StoredOptions | null;
  subscribe(listener: (options: StoredOptions | undefined) => void): () => void;
}

/**
 * 选项写入器接口 - 只写操作的最小化接口
 * 适用于只需要写入选项的场景，遵循接口隔离原则
 */
export interface OptionsWriter {
  save(options: StoredOptions | CompleteOptions): Promise<void>;
}
