/**
 * 依赖注入服务标识符
 * 使用Symbol确保唯一性，避免字符串冲突
 */

import type {
  IOptionsRepository,
  IMessagingRepository,
  IYamlRepository,
  IClipRepository,
  IVideoRepository,
  IReaderRepository,
  INavigationRepository
} from '../repositories';

const BASE_TOKENS = {
  // 平台服务
  platformServices: Symbol('platformServices'),

  // 错误处理
  errorHandler: Symbol('errorHandler'),

  // 全局状态管理
  globalStateManager: Symbol('globalStateManager'),

  // 使用统计存储
  usageStatsStore: Symbol('usageStatsStore'),

  // 对话框注册表
  dialogRegistry: Symbol('dialogRegistry'),

  // 通知适配器
  notificationAdapter: Symbol('notificationAdapter'),

  // i18n服务
  i18nService: Symbol('i18nService'),

  // 存储服务（用于测试隔离）
  storageService: Symbol('storageService'),

  // 消息服务（用于测试隔离）
  messagingService: Symbol('messagingService')
} as const;

export const DI_TOKENS = {
  ...BASE_TOKENS,
  // Repository 层
  IOptionsRepository: Symbol('IOptionsRepository'),
  IMessagingRepository: Symbol('IMessagingRepository'),
  IYamlRepository: Symbol('IYamlRepository'),
  IClipRepository: Symbol('IClipRepository'),
  IVideoRepository: Symbol('IVideoRepository'),
  IReaderRepository: Symbol('IReaderRepository'),
  INavigationRepository: Symbol('INavigationRepository')
} as const;

// 兼容旧引用
export const TOKENS = DI_TOKENS;

/**
 * 服务标识符类型
 */
export type ServiceToken = typeof TOKENS[keyof typeof TOKENS];

/**
 * Repository Token -> 实现实例的类型映射
 */
export interface TokenTypeMap {
  [DI_TOKENS.IOptionsRepository]: IOptionsRepository;
  [DI_TOKENS.IMessagingRepository]: IMessagingRepository;
  [DI_TOKENS.IYamlRepository]: IYamlRepository;
  [DI_TOKENS.IClipRepository]: IClipRepository;
  [DI_TOKENS.IVideoRepository]: IVideoRepository;
  [DI_TOKENS.IReaderRepository]: IReaderRepository;
  [DI_TOKENS.INavigationRepository]: INavigationRepository;
}

/**
 * 获取token的调试名称
 */
export function getTokenName(token: symbol): string {
  for (const [key, value] of Object.entries(TOKENS)) {
    if (value === token) {
      return key;
    }
  }
  return token.toString();
}
