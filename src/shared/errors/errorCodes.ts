/**
 * 统一错误码方案
 *
 * 错误码命名规范：
 * - 格式：{DOMAIN}_{CATEGORY}_{SPECIFIC_ERROR}
 * - 域（DOMAIN）：对应 ErrorDomain 枚举值的大写形式
 * - 类别（CATEGORY）：错误的功能分类
 * - 具体错误（SPECIFIC_ERROR）：具体的错误类型
 *
 * 示例：
 * - EXTRACTION_CONTENT_NO_SELECTION
 * - REST_REQUEST_TIMEOUT
 * - CHROME_API_PERMISSION_DENIED
 */

import { ErrorDomain } from './types';

// 错误码前缀映射
export const ERROR_CODE_PREFIXES: Record<ErrorDomain, string> = {
  i18n: 'I18N',
  extraction: 'EXTRACTION',
  classifier: 'CLASSIFIER',
  rest: 'REST',
  'chrome-api': 'CHROME_API',
  notifications: 'NOTIFICATION',
  options: 'OPTIONS',
  background: 'BACKGROUND',
  content: 'CONTENT',
  unknown: 'UNKNOWN'
} as const;

// 错误类别定义
export const ERROR_CATEGORIES = {
  // 通用类别
  INIT: 'INIT', // 初始化错误
  CONFIG: 'CONFIG', // 配置错误
  PERMISSION: 'PERMISSION', // 权限错误
  NETWORK: 'NETWORK', // 网络错误
  STORAGE: 'STORAGE', // 存储错误
  VALIDATION: 'VALIDATION', // 验证错误

  // 功能特定类别
  CONTENT: 'CONTENT', // 内容处理
  SELECTION: 'SELECTION', // 选区处理
  PARSING: 'PARSING', // 解析处理
  RENDERING: 'RENDERING', // 渲染处理
  TRANSPORT: 'TRANSPORT', // 传输处理
  CLASSIFICATION: 'CLASSIFICATION', // 分类处理

  // 系统类别
  RUNTIME: 'RUNTIME', // 运行时错误
  API: 'API', // API调用错误
  BRIDGE: 'BRIDGE', // 跨环境通信错误
  LIFECYCLE: 'LIFECYCLE' // 生命周期错误
} as const;

const ERROR_CATEGORY_VALUES = new Set<string>(Object.values(ERROR_CATEGORIES));
const isErrorCategoryValue = (
  value: string
): value is (typeof ERROR_CATEGORIES)[keyof typeof ERROR_CATEGORIES] =>
  ERROR_CATEGORY_VALUES.has(value);

// 错误严重程度映射到数值（用于排序和过滤）
export const SEVERITY_LEVELS = {
  info: 1,
  warning: 2,
  error: 3,
  critical: 4
} as const;

// 错误码生成工具
export function generateErrorCode(
  domain: ErrorDomain,
  category: keyof typeof ERROR_CATEGORIES,
  specificError: string
): string {
  const prefix = ERROR_CODE_PREFIXES[domain];
  const categoryName = ERROR_CATEGORIES[category];
  return `${prefix}_${categoryName}_${specificError}`;
}

// 错误码解析工具
export interface ParsedErrorCode {
  domain: ErrorDomain;
  category: string;
  specificError: string;
  isValid: boolean;
}

export function parseErrorCode(code: string): ParsedErrorCode {
  const parts = code.split('_');

  if (parts.length < 3) {
    return {
      domain: 'unknown',
      category: 'UNKNOWN',
      specificError: code,
      isValid: false
    };
  }

  const prefix = parts[0];
  const category = parts[1];
  const specificError = parts.slice(2).join('_');

  // 查找对应的域
  const domain =
    (Object.entries(ERROR_CODE_PREFIXES).find(([_, p]) => p === prefix)?.[0] as ErrorDomain) ||
    'unknown';

  return {
    domain,
    category,
    specificError,
    isValid: domain !== 'unknown' && isErrorCategoryValue(category)
  };
}

// 标准化现有错误码
export const STANDARDIZED_ERROR_CODES = {
  // I18N 错误
  I18N_INIT_LOAD_FAILED: 'I18N_INIT_LOAD_FAILED',
  I18N_CONFIG_INVALID_LOCALE: 'I18N_CONFIG_INVALID_LOCALE',
  I18N_PARSING_MESSAGE_FAILED: 'I18N_PARSING_MESSAGE_FAILED',

  // 提取错误
  EXTRACTION_SELECTION_NO_SELECTION: 'EXTRACTION_SELECTION_NO_SELECTION',
  EXTRACTION_CONTENT_NO_MARKDOWN: 'EXTRACTION_CONTENT_NO_MARKDOWN',
  EXTRACTION_CONTENT_UNSUPPORTED: 'EXTRACTION_CONTENT_UNSUPPORTED',
  EXTRACTION_TRANSPORT_DISPATCH_FAILED: 'EXTRACTION_TRANSPORT_DISPATCH_FAILED',

  // 分类器错误
  CLASSIFIER_TRANSPORT_FAILURE: 'CLASSIFIER_TRANSPORT_FAILURE',
  CLASSIFIER_VALIDATION_INVALID_PAYLOAD: 'CLASSIFIER_VALIDATION_INVALID_PAYLOAD',
  CLASSIFIER_PARSING_RESPONSE_FAILED: 'CLASSIFIER_PARSING_RESPONSE_FAILED',

  // REST 错误
  REST_NETWORK_REQUEST_FAILED: 'REST_NETWORK_REQUEST_FAILED',
  REST_VALIDATION_UNEXPECTED_RESPONSE: 'REST_VALIDATION_UNEXPECTED_RESPONSE',
  REST_NETWORK_TIMEOUT: 'REST_NETWORK_TIMEOUT',
  REST_NETWORK_OFFLINE: 'REST_NETWORK_OFFLINE',

  // Chrome API 错误
  CHROME_API_RUNTIME_ERROR: 'CHROME_API_RUNTIME_ERROR',
  CHROME_API_PERMISSION_UNSUPPORTED_ENVIRONMENT: 'CHROME_API_PERMISSION_UNSUPPORTED_ENVIRONMENT',
  CHROME_API_STORAGE_ACCESS_DENIED: 'CHROME_API_STORAGE_ACCESS_DENIED',
  CHROME_API_TABS_QUERY_FAILED: 'CHROME_API_TABS_QUERY_FAILED',

  // 通知错误
  NOTIFICATION_RUNTIME_CREATION_FAILED: 'NOTIFICATION_RUNTIME_CREATION_FAILED',
  NOTIFICATION_PERMISSION_DENIED: 'NOTIFICATION_PERMISSION_DENIED',
  NOTIFICATION_CONFIG_INVALID_OPTIONS: 'NOTIFICATION_CONFIG_INVALID_OPTIONS',

  // 选项页错误
  OPTIONS_STORAGE_SAVE_FAILED: 'OPTIONS_STORAGE_SAVE_FAILED',
  OPTIONS_STORAGE_LOAD_FAILED: 'OPTIONS_STORAGE_LOAD_FAILED',
  OPTIONS_VALIDATION_INVALID_CONFIG: 'OPTIONS_VALIDATION_INVALID_CONFIG',

  // 后台错误
  BACKGROUND_LIFECYCLE_STARTUP_FAILED: 'BACKGROUND_LIFECYCLE_STARTUP_FAILED',
  BACKGROUND_BRIDGE_MESSAGE_FAILED: 'BACKGROUND_BRIDGE_MESSAGE_FAILED',
  BACKGROUND_STORAGE_MIGRATION_FAILED: 'BACKGROUND_STORAGE_MIGRATION_FAILED',

  // 内容脚本错误
  CONTENT_INIT_INJECTION_FAILED: 'CONTENT_INIT_INJECTION_FAILED',
  CONTENT_BRIDGE_COMMUNICATION_FAILED: 'CONTENT_BRIDGE_COMMUNICATION_FAILED',
  CONTENT_RENDERING_UI_FAILED: 'CONTENT_RENDERING_UI_FAILED',

  // 通用错误
  UNKNOWN_RUNTIME_UNEXPECTED: 'UNKNOWN_RUNTIME_UNEXPECTED'
} as const;

// 错误码类型
export type StandardizedErrorCode = keyof typeof STANDARDIZED_ERROR_CODES;

// 错误码验证
export function isValidErrorCode(code: string): code is StandardizedErrorCode {
  return Object.values(STANDARDIZED_ERROR_CODES).includes(code as StandardizedErrorCode);
}

// 错误码到用户友好消息的映射（用于 GA 报告）
export const ERROR_CODE_DESCRIPTIONS: Record<StandardizedErrorCode, string> = {
  // I18N
  I18N_INIT_LOAD_FAILED: 'Internationalization initialization failed',
  I18N_CONFIG_INVALID_LOCALE: 'Invalid locale configuration',
  I18N_PARSING_MESSAGE_FAILED: 'Message parsing failed',

  // Extraction
  EXTRACTION_SELECTION_NO_SELECTION: 'No content selection found',
  EXTRACTION_CONTENT_NO_MARKDOWN: 'Content extraction produced no markdown',
  EXTRACTION_CONTENT_UNSUPPORTED: 'Unsupported content type',
  EXTRACTION_TRANSPORT_DISPATCH_FAILED: 'Failed to dispatch extraction result',

  // Classifier
  CLASSIFIER_TRANSPORT_FAILURE: 'Classifier service transport failure',
  CLASSIFIER_VALIDATION_INVALID_PAYLOAD: 'Invalid classifier payload',
  CLASSIFIER_PARSING_RESPONSE_FAILED: 'Classifier response parsing failed',

  // REST
  REST_NETWORK_REQUEST_FAILED: 'Network request failed',
  REST_VALIDATION_UNEXPECTED_RESPONSE: 'Unexpected API response',
  REST_NETWORK_TIMEOUT: 'Network request timeout',
  REST_NETWORK_OFFLINE: 'Network offline',

  // Chrome API
  CHROME_API_RUNTIME_ERROR: 'Chrome API runtime error',
  CHROME_API_PERMISSION_UNSUPPORTED_ENVIRONMENT: 'Unsupported browser environment',
  CHROME_API_STORAGE_ACCESS_DENIED: 'Storage access denied',
  CHROME_API_TABS_QUERY_FAILED: 'Tab query failed',

  // Notifications
  NOTIFICATION_RUNTIME_CREATION_FAILED: 'Notification creation failed',
  NOTIFICATION_PERMISSION_DENIED: 'Notification permission denied',
  NOTIFICATION_CONFIG_INVALID_OPTIONS: 'Invalid notification options',

  // Options
  OPTIONS_STORAGE_SAVE_FAILED: 'Settings save failed',
  OPTIONS_STORAGE_LOAD_FAILED: 'Settings load failed',
  OPTIONS_VALIDATION_INVALID_CONFIG: 'Invalid configuration',

  // Background
  BACKGROUND_LIFECYCLE_STARTUP_FAILED: 'Background service startup failed',
  BACKGROUND_BRIDGE_MESSAGE_FAILED: 'Inter-context messaging failed',
  BACKGROUND_STORAGE_MIGRATION_FAILED: 'Storage migration failed',

  // Content
  CONTENT_INIT_INJECTION_FAILED: 'Content script injection failed',
  CONTENT_BRIDGE_COMMUNICATION_FAILED: 'Content-background communication failed',
  CONTENT_RENDERING_UI_FAILED: 'UI rendering failed',

  // Unknown
  UNKNOWN_RUNTIME_UNEXPECTED: 'Unexpected runtime error'
} as const;
