import type { CompleteOptions } from '../types/options';

/**
 * Options 存储访问接口
 *
 * 职责:
 * - 提供 Options 的读写访问
 * - 管理 onChange 订阅,实现单一真相源
 * - 集中错误处理,屏蔽底层 storage API 差异
 */
export interface IOptionsRepository {
  /**
   * 获取完整配置
   * @returns Promise<CompleteOptions> 合并默认值后的完整配置
   * @throws StorageError 当 storage 读取失败时
   */
  get: () => Promise<CompleteOptions>;

  /**
   * 更新部分配置
   * @param options 要更新的配置字段(部分)
   * @throws StorageError 当 storage 写入失败时
   */
  set: (options: Partial<CompleteOptions>) => Promise<void>;

  /**
   * 订阅配置变更
   * @param callback 配置变更时的回调函数
   * @returns 取消订阅函数
   *
   * 注意:
   * - 订阅时会立即触发一次 callback,确保 UI 同步最新状态
   * - 必须在组件 destroy 时调用返回的 unsubscribe 函数
   */
  onChange: (callback: (options: CompleteOptions) => void) => () => void;
}
