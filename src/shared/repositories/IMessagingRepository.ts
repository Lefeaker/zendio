import type { RestConnection } from '../interfaces/restClient';
import type { ClipPayload } from '../types/clip';
import type { RestOptions } from '../types/options';
import type { VaultConfig } from '../types/vault';
import type { VideoClipData } from './IVideoRepository';
import type { ReadingClipData } from './IReaderRepository';
import type { TrackUsageEventPayload } from '../types/analytics';

/**
 * 消息通信接口
 *
 * 职责:
 * - 抽象 chrome.runtime.sendMessage 调用
 * - 提供类型安全的 messaging API
 * - 集中错误处理,统一超时/失败逻辑
 */
export interface IMessagingRepository {
  /**
   * 发送消息到 Background Service Worker
   * @param message 要发送的消息
   * @returns Promise<T> 响应数据
   * @throws MessagingError 当消息发送失败或超时时
   */
  send<T>(message: Message): Promise<T>;

  /**
   * 监听来自其他上下文的消息
   * @param handler 消息处理函数
   * @returns 取消监听函数
   */
  onMessage(handler: MessageHandler): () => void;
}

export type ClipData = ClipPayload;
export type RestConfig = RestConnection;

export type Message =
  | { type: 'clip'; data: ClipData }
  | { type: 'videoClip'; data: VideoClipData }
  | { type: 'readingClip'; data: ReadingClipData }
  | TrackUsageEventPayload
  | { type: 'connection_test'; config: RestConfig }
  | { type: 'TEST_CONNECTION'; rest?: Partial<RestOptions> }
  | { type: 'TEST_VAULT_CONNECTION'; vaultId: string; vault: VaultConfig };

export interface MessageSender {
  id?: string;
  tabId?: number;
  frameId?: number;
  url?: string;
  origin?: string;
}

export type MessageHandler = (message: Message, sender: MessageSender) => Promise<unknown> | void;
