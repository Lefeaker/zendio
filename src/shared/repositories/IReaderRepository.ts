import type { ClipResult } from './IClipRepository';
import type { ReadingSessionOptions } from '../types/options';

/**
 * 阅读模式配置别名，便于表达语义。
 */
export type ReadingOptions = ReadingSessionOptions;

/**
 * 阅读剪藏高亮
 */
export interface Highlight {
  text: string;
  color: string;
  note?: string;
  timestamp: number;
}

/**
 * 阅读剪藏数据
 */
export interface ReadingClipData {
  content: string;
  title: string;
  url: string;
  highlights: Highlight[];
  exportMode: 'highlights' | 'full';
}

/**
 * Reader Repository 接口
 * 负责读取/订阅阅读配置并发送阅读剪藏。
 */
export interface IReaderRepository {
  /**
   * 获取阅读模式配置
   */
  getReadingConfig(): Promise<ReadingOptions>;

  /**
   * 发送阅读剪藏
   */
  sendReadingClip(clip: ReadingClipData): Promise<ClipResult>;

  /**
   * 订阅配置变更
   * @returns 取消订阅函数
   */
  onConfigChange(callback: (config: ReadingOptions) => void): () => void;
}
