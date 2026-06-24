import { AppError, ErrorSeverity } from './types';
import { STANDARDIZED_ERROR_CODES } from './errorCodes';

interface ExtractionContext extends Record<string, unknown> {
  url?: string;
  extractor?: string; // 使用的提取器类型：'readability', 'manual', 'auto'
  type?: string; // 内容类型：'article', 'video', 'image', 'document'
  method?: string; // 提取方法：'selection', 'fullpage', 'smart'
  component?: string; // 组件：'content-script', 'background', 'popup'
  step?: string; // 执行步骤：'init', 'extract', 'process', 'dispatch'
  retryCount?: number; // 重试次数
  duration?: number; // 执行时长（毫秒）
  itemCount?: number; // 处理的项目数量
  timestamp?: number;
}

interface AIChatParseEmptyContext extends ExtractionContext {
  type: 'ai_chat';
  platform: string;
  messageCount: 0;
  parserDiagnosticCodes?: string[];
}

interface SelectionContext extends ExtractionContext {
  selectionLength?: number;
  selectionText?: string; // 截断的选择文本（用于调试，会被自动清理）
  elementTag?: string; // 选中元素的标签名
  elementClass?: string; // 元素的 CSS 类名（不包含用户相关信息）
  viewportSize?: string; // 视口大小，格式：'1920x1080'
  scrollPosition?: number; // 滚动位置
}

export const extractionErrors = {
  noSelection(context: SelectionContext = {}): AppError {
    return {
      code: STANDARDIZED_ERROR_CODES.EXTRACTION_SELECTION_NO_SELECTION,
      domain: 'extraction',
      message: STANDARDIZED_ERROR_CODES.EXTRACTION_SELECTION_NO_SELECTION,
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      userMessageDescriptor: { key: 'errorExtractionNoSelection' },
      context: {
        ...context,
        timestamp: Date.now()
      }
    };
  },

  noMarkdown(context: ExtractionContext = {}): AppError {
    return {
      code: STANDARDIZED_ERROR_CODES.EXTRACTION_CONTENT_NO_MARKDOWN,
      domain: 'extraction',
      message: STANDARDIZED_ERROR_CODES.EXTRACTION_CONTENT_NO_MARKDOWN,
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      userMessageDescriptor: { key: 'errorExtractionNoMarkdown' },
      context: {
        ...context,
        timestamp: Date.now()
      }
    };
  },

  aiChatParseEmpty(context: AIChatParseEmptyContext): AppError {
    return {
      code: STANDARDIZED_ERROR_CODES.EXTRACTION_AI_CHAT_PARSE_EMPTY,
      domain: 'extraction',
      message: STANDARDIZED_ERROR_CODES.EXTRACTION_AI_CHAT_PARSE_EMPTY,
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      userMessageDescriptor: { key: 'errorExtractionAiChatParseEmpty' },
      context: {
        ...context,
        timestamp: Date.now()
      }
    };
  },

  unsupportedContent(context: ExtractionContext = {}): AppError {
    return {
      code: STANDARDIZED_ERROR_CODES.EXTRACTION_CONTENT_UNSUPPORTED,
      domain: 'extraction',
      message: STANDARDIZED_ERROR_CODES.EXTRACTION_CONTENT_UNSUPPORTED,
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      userMessageDescriptor: { key: 'errorExtractionUnsupportedContent' },
      context: {
        ...context,
        timestamp: Date.now()
      }
    };
  },

  dispatchFailure(reason: string, context: ExtractionContext = {}): AppError {
    return {
      code: STANDARDIZED_ERROR_CODES.EXTRACTION_TRANSPORT_DISPATCH_FAILED,
      domain: 'extraction',
      message: `Failed to dispatch clip result: ${reason}`,
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      userMessageDescriptor: { key: 'errorExtractionDispatchFailure' },
      context: {
        ...context,
        reason,
        timestamp: Date.now()
      }
    };
  }
} as const;

export type ExtractionErrorCode = ReturnType<
  (typeof extractionErrors)[keyof typeof extractionErrors]
>['code'];
