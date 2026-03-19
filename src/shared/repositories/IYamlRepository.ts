import type { YamlConfigOverrides } from '../types/yamlConfig';

/**
 * YAML 配置覆盖存储接口
 *
 * 职责:
 * - 管理用户的 YAML 配置覆盖
 * - 提供覆盖配置的读写访问
 * - 支持覆盖配置变更订阅
 */
export interface IYamlRepository {
  /**
   * 获取 YAML 配置覆盖
   * @returns Promise<YamlConfigOverrides | null> 覆盖配置或 null(未设置时)
   */
  getOverrides(): Promise<YamlConfigOverrides | null>;

  /**
   * 保存 YAML 配置覆盖
   * @param overrides 要保存的覆盖配置
   */
  setOverrides(overrides: YamlConfigOverrides): Promise<void>;

  /**
   * 订阅覆盖配置变更
   * @param callback 配置变更时的回调函数
   * @returns 取消订阅函数
   */
  onChange(
    callback: (overrides: YamlConfigOverrides | null) => void
  ): () => void;
}
