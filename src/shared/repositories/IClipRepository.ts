import type { FragmentClipperOptions, TemplateOptions } from '../types/options';
import type { ClipPayload } from '../types/clip';

/**
 * Fragment 配置别名，便于在仓库接口中表达领域含义。
 */
export type FragmentConfig = FragmentClipperOptions;

/**
 * 前端向背景页发送的剪藏数据。
 */
export type ClipData = ClipPayload;

/**
 * 剪藏结果（由背景页返回）。
 */
export interface ClipResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Clip Repository 接口
 *
 * 负责管理片段配置、模板配置以及剪藏发送。
 */
export interface IClipRepository {
  /**
   * 获取片段剪藏配置。
   */
  getFragmentConfig(): Promise<FragmentConfig>;

  /**
   * 更新片段剪藏配置。
   */
  setFragmentConfig(config: Partial<FragmentConfig>): Promise<void>;

  /**
   * 获取模板配置。
   */
  getTemplateConfig(): Promise<TemplateOptions>;

  /**
   * 向背景页发送剪藏。
   */
  sendClip(clip: ClipData): Promise<ClipResult>;

  /**
   * 订阅片段配置变更。
   * @returns 取消订阅函数。
   */
  onConfigChange(callback: (config: FragmentConfig) => void): () => void;
}
