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
      message: 'No valid selection found for clipping.',
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      userMessage: '未发现可用的选区，请重新选择内容后再试。',
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
      message: 'Extraction completed without markdown content.',
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      userMessage: '内容解析失败，请刷新页面或稍后重试。',
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
      message: 'No extractor was able to handle the current page.',
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      userMessage: '当前页面暂不支持剪藏，我们会尽快补充适配。',
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
      userMessage: '结果发送失败，已自动重试。若问题持续，请反馈给我们。',
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
