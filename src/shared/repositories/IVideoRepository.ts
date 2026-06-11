import type { ClipResult } from './IClipRepository';
import type { VideoOptions } from '../types/options';
import type { ClipAttachment } from '../types';
import type { ExportDestinationMetadata } from '../exportDestination';

/**
 * 视频剪藏数据
 */
export interface VideoClipData {
  content: string;
  title: string;
  url: string;
  videoUrl: string;
  timestamp: number;
  duration?: number;
  platform: 'youtube' | 'bilibili' | 'other';
  attachments?: ClipAttachment[];
  exportDestination?: ExportDestinationMetadata;
}

/**
 * Video Repository 接口
 * 负责管理视频配置、浮层位置与视频剪藏发送。
 */
export interface IVideoRepository {
  /**
   * 获取视频配置。
   */
  getVideoConfig(): Promise<VideoOptions>;

  /**
   * 保存浮层位置。
   */
  savePromptPosition(position: { x: number; y: number }): Promise<void>;

  saveControlBarPreferences(preferences: {
    autoPauseEnabled: boolean;
    captureScreenshotEnabled: boolean;
  }): Promise<void>;

  /**
   * 获取浮层位置。
   */
  getPromptPosition(): Promise<{ x: number; y: number } | null>;

  /**
   * 发送视频剪藏。
   */
  sendVideoClip(clip: VideoClipData): Promise<ClipResult>;

  /**
   * 订阅配置变更。
   * @returns 取消订阅函数
   */
  onConfigChange(callback: (config: VideoOptions) => void): () => void;
}
