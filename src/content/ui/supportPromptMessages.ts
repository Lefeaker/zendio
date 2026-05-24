import { ensureContentI18n, getContentI18nResource, getContentMessages } from '../i18n/context';
import type { AppError } from '../../shared/errors';
import { ErrorSeverity } from '../../shared/errors';
import type {
  PromptStatus,
  ResolvedStatusMessage,
  SupportPromptMessages,
  SupportPromptOptions
} from './supportPrompt/types';

const FALLBACK_SUPPORT_PROMPT_MESSAGES: SupportPromptMessages = {
  dialogLabel: '支持 All in Ob',
  title: '支持 All in Ob',
  koFiTitle: 'Ko-fi',
  koFiDescription: '请我喝杯咖啡',
  afdianTitle: '爱发电',
  afdianDescription: '国内赞助渠道',
  githubTitle: 'GitHub',
  githubDescription: '提交反馈',
  feedbackGroupLabel: '快速反馈',
  likeLabel: '赞一个',
  dislikeLabel: '倒赞',
  dismiss: '点击页面其他区域即可关闭',
  statusSuccess: '发送成功',
  statusSuccessWithVault: '成功发送到 {vault}',
  statusWarning: '已保存，但分类结果已回退',
  statusWarningWithReason: '已保存，但分类失败：{reason}',
  statusFailure: '发送失败',
  statusFailureWithReason: '发送失败，{reason}',
  likeThankYou: '感谢鼓励！',
  reviewLinkLabel: '撰写评论',
  reviewAcknowledgedLabel: '我已写过评论',
  dislikeToastTitle: '反馈问题',
  dislikeRedditLinkLabel: '在 Reddit 讨论',
  dislikeQrLinkLabel: '扫码反馈',
  dislikeQrPlaceholder: '二维码暂不可用'
};

const SEVERITY_STATUS_MAP: Record<ErrorSeverity, PromptStatus> = {
  [ErrorSeverity.INFO]: 'success',
  [ErrorSeverity.WARNING]: 'warning',
  [ErrorSeverity.ERROR]: 'failure',
  [ErrorSeverity.CRITICAL]: 'failure'
};

export function mapSeverityToStatus(severity: ErrorSeverity): PromptStatus {
  return SEVERITY_STATUS_MAP[severity] ?? 'success';
}

export function resolveSupportPromptReason(
  error?: AppError,
  fallback?: string
): string | undefined {
  const candidate = error?.userMessage ?? error?.message ?? fallback;
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate.trim();
  }
  return undefined;
}

export function resolveStatusMessage(input: {
  status: PromptStatus;
  vaultLabel?: string;
  reason?: string;
  messages: SupportPromptMessages;
  error?: AppError;
  progressLabel?: string;
}): ResolvedStatusMessage {
  const { status, vaultLabel, reason, messages, error, progressLabel } = input;
  let text: string;

  const fill = (template: string, token: string, value: string): string => {
    const pattern = new RegExp(`\\{${token}\\}`, 'g');
    if (pattern.test(template)) {
      return template.replace(pattern, value);
    }
    return `${template}${template.endsWith('：') || template.endsWith(':') ? '' : '：'}${value}`;
  };

  if (progressLabel?.trim()) {
    text = progressLabel.trim();
  } else if (status === 'progress') {
    text = '正在发送到 Obsidian';
  } else if (status === 'failure') {
    text = reason
      ? fill(messages.statusFailureWithReason, 'reason', reason)
      : messages.statusFailure;
  } else if (status === 'warning') {
    text = reason
      ? fill(messages.statusWarningWithReason, 'reason', reason)
      : messages.statusWarning;
  } else {
    text = vaultLabel
      ? fill(messages.statusSuccessWithVault, 'vault', vaultLabel)
      : messages.statusSuccess;
  }

  const contextMessage =
    typeof error?.context?.contextMessage === 'string'
      ? error.context.contextMessage.trim()
      : undefined;

  const result: ResolvedStatusMessage = { text };
  if (error && status !== 'success') {
    result.codeSuffix = `（代码: ${error.code}）`;
  }
  if (contextMessage && contextMessage.length > 0) {
    result.extraLine = contextMessage;
  }
  return result;
}

export function resolveSupportPromptProgress(
  options: SupportPromptOptions | undefined,
  status: PromptStatus
): {
  value: number;
  variant: 'progress' | 'success' | 'failure' | 'warning';
} {
  if (options?.progress) {
    return {
      value: clampProgressValue(options.progress.value, status === 'progress' ? 8 : 100),
      variant: options.progress.variant ?? status
    };
  }
  if (status === 'failure') {
    return { value: 100, variant: 'failure' };
  }
  if (status === 'warning') {
    return { value: 100, variant: 'warning' };
  }
  if (status === 'progress') {
    return { value: 8, variant: 'progress' };
  }
  return { value: 100, variant: 'success' };
}

export async function resolveSupportPromptMessages(doc: Document): Promise<SupportPromptMessages> {
  try {
    await ensureContentI18n(doc);
    const resource = getContentI18nResource();
    const messages = resource?.messages ?? (await getContentMessages());
    const resolvedMessages: SupportPromptMessages = {
      dialogLabel: messages.supportPromptDialogLabel,
      title: messages.supportPromptTitle,
      koFiTitle: messages.supportPromptKoFiTitle,
      koFiDescription: messages.supportPromptKoFiDescription,
      afdianTitle: messages.supportPromptAfdianTitle,
      afdianDescription: messages.supportPromptAfdianDescription,
      githubTitle: messages.supportPromptGithubTitle,
      githubDescription: messages.supportPromptGithubDescription,
      feedbackGroupLabel: messages.supportPromptFeedbackGroupLabel,
      likeLabel: messages.supportPromptLikeLabel,
      dislikeLabel: messages.supportPromptDislikeLabel,
      dismiss: messages.supportPromptDismiss,
      statusSuccess: messages.supportPromptStatusSuccess,
      statusSuccessWithVault: messages.supportPromptStatusSuccessWithVault,
      statusWarning: messages.supportPromptStatusWarning,
      statusWarningWithReason: messages.supportPromptStatusWarningWithReason,
      statusFailure: messages.supportPromptStatusFailure,
      statusFailureWithReason: messages.supportPromptStatusFailureWithReason,
      likeThankYou:
        messages.supportPromptLikeThankYou ?? FALLBACK_SUPPORT_PROMPT_MESSAGES.likeThankYou,
      reviewLinkLabel:
        messages.supportPromptReviewLinkLabel ?? FALLBACK_SUPPORT_PROMPT_MESSAGES.reviewLinkLabel,
      reviewAcknowledgedLabel:
        messages.supportPromptReviewAcknowledgedLabel ??
        FALLBACK_SUPPORT_PROMPT_MESSAGES.reviewAcknowledgedLabel,
      dislikeToastTitle:
        messages.supportPromptDislikeToastTitle ??
        FALLBACK_SUPPORT_PROMPT_MESSAGES.dislikeToastTitle,
      dislikeRedditLinkLabel:
        messages.supportPromptDislikeRedditLinkLabel ??
        FALLBACK_SUPPORT_PROMPT_MESSAGES.dislikeRedditLinkLabel,
      dislikeQrLinkLabel:
        messages.supportPromptDislikeQrLinkLabel ??
        FALLBACK_SUPPORT_PROMPT_MESSAGES.dislikeQrLinkLabel
    };
    const dislikeQrPlaceholder =
      messages.supportPromptDislikeQrPlaceholder ??
      FALLBACK_SUPPORT_PROMPT_MESSAGES.dislikeQrPlaceholder;
    if (typeof dislikeQrPlaceholder === 'string') {
      resolvedMessages.dislikeQrPlaceholder = dislikeQrPlaceholder;
    }
    return resolvedMessages;
  } catch (error) {
    console.warn('[support-prompt] Failed to load i18n messages:', error);
    return FALLBACK_SUPPORT_PROMPT_MESSAGES;
  }
}

function clampProgressValue(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}
