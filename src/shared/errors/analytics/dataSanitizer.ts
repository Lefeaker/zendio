/**
 * 错误数据匿名化处理工具
 * 
 * 确保发送到 Google Analytics 的错误信息不包含用户隐私数据
 * 符合 GDPR、CCPA 等隐私保护法规要求
 */

import { AppError } from '../types';

// 敏感数据模式（正则表达式）
const SENSITIVE_PATTERNS = {
  // 邮箱地址
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // IP 地址
  IPV4: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
  IPV6: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
  
  // 用户名模式（常见格式）
  USERNAME: /\b(?:user|username|login|account)[:\s=]+[^\s,;]+/gi,
  
  // 路径中的用户信息
  USER_PATH: /\/(?:users?|accounts?|profiles?)\/[^/\s]+/gi,
  
  // 查询参数中的敏感信息
  SENSITIVE_PARAMS: /[?&](?:user|username|email|token|key|password|auth|session)[=][^&\s]+/gi,
  
  // 文件路径（可能包含用户名）
  FILE_PATH: /[C-Z]:\\(?:Users\\[^\\]+|Documents|Desktop)[^\s]*/gi,
  UNIX_PATH: /\/(?:home|Users)\/[^/\s]+[^\s]*/gi,
  
  // 可能的个人标识符
  PERSONAL_ID: /\b(?:id|uid|userid)[:\s=]+[^\s,;]+/gi,
  
  // 电话号码
  PHONE: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
  
  // 信用卡号（基本模式）
  CREDIT_CARD: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  
  // 社会安全号码（美国）
  SSN: /\b\d{3}-\d{2}-\d{4}\b/g
};

// URL 敏感部分
const URL_SENSITIVE_PATTERNS = {
  // 查询参数
  QUERY_PARAMS: /[?&](?:user|username|email|token|key|password|auth|session|api_key)[=][^&]*/gi,
  
  // 用户相关路径段
  USER_SEGMENTS: /\/(?:users?|accounts?|profiles?)\/[^/]+/gi,
  
  // 可能的 ID 参数
  ID_PARAMS: /[?&](?:id|uid|user_id|account_id)[=][^&]*/gi
};

// 替换文本
const REPLACEMENT_TEXT = {
  EMAIL: '[EMAIL_REDACTED]',
  IP: '[IP_REDACTED]',
  USERNAME: '[USERNAME_REDACTED]',
  PATH: '[PATH_REDACTED]',
  PARAM: '[PARAM_REDACTED]',
  ID: '[ID_REDACTED]',
  PHONE: '[PHONE_REDACTED]',
  CARD: '[CARD_REDACTED]',
  SSN: '[SSN_REDACTED]'
};

/**
 * 清理字符串中的敏感信息
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  let sanitized = input;

  // 替换各种敏感模式
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.EMAIL, REPLACEMENT_TEXT.EMAIL);
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.IPV4, REPLACEMENT_TEXT.IP);
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.IPV6, REPLACEMENT_TEXT.IP);
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.USERNAME, REPLACEMENT_TEXT.USERNAME);
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.USER_PATH, REPLACEMENT_TEXT.PATH);
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.SENSITIVE_PARAMS, REPLACEMENT_TEXT.PARAM);
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.FILE_PATH, REPLACEMENT_TEXT.PATH);
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.UNIX_PATH, REPLACEMENT_TEXT.PATH);
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.PERSONAL_ID, REPLACEMENT_TEXT.ID);
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.PHONE, REPLACEMENT_TEXT.PHONE);
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.CREDIT_CARD, REPLACEMENT_TEXT.CARD);
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.SSN, REPLACEMENT_TEXT.SSN);

  return sanitized;
}

/**
 * 清理 URL 中的敏感信息
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return url;
  }

  let sanitized = url;

  // 清理 URL 特定的敏感信息
  sanitized = sanitized.replace(URL_SENSITIVE_PATTERNS.QUERY_PARAMS, REPLACEMENT_TEXT.PARAM);
  sanitized = sanitized.replace(URL_SENSITIVE_PATTERNS.USER_SEGMENTS, '/users/[USER_ID]');
  sanitized = sanitized.replace(URL_SENSITIVE_PATTERNS.ID_PARAMS, REPLACEMENT_TEXT.PARAM);

  // 应用通用字符串清理
  sanitized = sanitizeString(sanitized);

  return sanitized;
}

/**
 * 清理错误上下文中的敏感信息
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(context)) {
    return context;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    // 跳过明显敏感的键
    if (isSensitiveKey(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    if (typeof value === 'string') {
      // 特殊处理 URL
      if (key.toLowerCase().includes('url') || key.toLowerCase().includes('href')) {
        sanitized[key] = sanitizeUrl(value);
      } else {
        sanitized[key] = sanitizeString(value);
      }
    } else if (Array.isArray(value)) {
      const arrayValue = value as unknown[];
      sanitized[key] = arrayValue.map((item) => {
        if (typeof item === 'string') {
          return sanitizeString(item);
        }
        if (isRecord(item)) {
          return sanitizeContext(item);
        }
        return item;
      });
    } else if (isRecord(value)) {
      sanitized[key] = sanitizeContext(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * 检查键名是否敏感
 */
function isSensitiveKey(key: string): boolean {
  const sensitiveKeys = [
    'password', 'passwd', 'pwd',
    'token', 'auth', 'authorization', 'bearer',
    'key', 'apikey', 'api_key', 'secret',
    'session', 'sessionid', 'session_id',
    'cookie', 'cookies',
    'email', 'mail',
    'username', 'user', 'login',
    'phone', 'mobile', 'tel',
    'address', 'location',
    'credit', 'card', 'payment',
    'ssn', 'social'
  ];

  const lowerKey = key.toLowerCase();
  return sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));
}

/**
 * 为 Analytics 清理 AppError 对象
 */
export function sanitizeErrorForAnalytics(error: AppError): AppError {
  const sanitized: AppError = {
    code: error.code, // 错误码本身不包含敏感信息
    domain: error.domain,
    message: sanitizeString(error.message),
    severity: error.severity,
    recoverable: error.recoverable
  };

  // 清理用户消息
  if (error.userMessage) {
    sanitized.userMessage = sanitizeString(error.userMessage);
  }

  // 清理时间戳（保留）
  if (error.timestamp) {
    sanitized.timestamp = error.timestamp;
  }

  // 清理上下文信息
  if (error.context && isRecord(error.context)) {
    sanitized.context = sanitizeContext(error.context);
  }

  // 清理原因信息
  if (error.cause) {
    if (error.cause instanceof Error) {
      sanitized.cause = {
        name: error.cause.name,
        message: sanitizeString(error.cause.message),
        // 不包含堆栈跟踪以保护隐私
      };
    } else if (typeof error.cause === 'string') {
      sanitized.cause = sanitizeString(error.cause);
    } else if (isRecord(error.cause)) {
      sanitized.cause = sanitizeContext(error.cause);
    } else {
      sanitized.cause = error.cause;
    }
  }

  return sanitized;
}

/**
 * 验证数据是否已充分匿名化
 */
export function validateSanitization(data: unknown): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  const dataStr = JSON.stringify(data) ?? '';

  // 检查是否还有敏感模式
  Object.entries(SENSITIVE_PATTERNS).forEach(([pattern, regex]) => {
    if (regex.test(dataStr)) {
      issues.push(`Potential ${pattern.toLowerCase()} found in data`);
    }
  });

  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * 生成数据清理报告
 */
export interface SanitizationReport {
  originalSize: number;
  sanitizedSize: number;
  reductionPercentage: number;
  patternsFound: string[];
  isCompliant: boolean;
}

export function generateSanitizationReport(original: unknown, sanitized: unknown): SanitizationReport {
  const originalStr = JSON.stringify(original) ?? '';
  const sanitizedStr = JSON.stringify(sanitized) ?? '';
  
  const originalSize = originalStr.length;
  const sanitizedSize = sanitizedStr.length;
  const reductionPercentage = originalSize > 0 ? ((originalSize - sanitizedSize) / originalSize) * 100 : 0;

  const patternsFound: string[] = [];
  Object.entries(SENSITIVE_PATTERNS).forEach(([pattern, regex]) => {
    if (regex.test(originalStr)) {
      patternsFound.push(pattern.toLowerCase());
    }
  });

  const validation = validateSanitization(sanitized);

  return {
    originalSize,
    sanitizedSize,
    reductionPercentage: Math.round(reductionPercentage * 100) / 100,
    patternsFound,
    isCompliant: validation.isValid
  };
}
