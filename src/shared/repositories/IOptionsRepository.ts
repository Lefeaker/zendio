import type { OptionsPatch } from '../types/optionsMutationMessages';
import type { CompleteOptions, StoredOptions } from '../types/options';

/**
 * Options 存储访问接口
 *
 * 职责:
 * - 提供 Options 的读取、显式 patch / strict replace 访问
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

  patch: (patches: OptionsPatch | readonly OptionsPatch[]) => Promise<CompleteOptions>;

  replace: (options: StoredOptions | CompleteOptions) => Promise<CompleteOptions>;

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
