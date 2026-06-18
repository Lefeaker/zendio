import { formatUserVisibleMessage, type Messages } from '../../i18n';
import { RUNTIME_FALLBACK_MESSAGES } from '../../i18n/catalog/runtimeFallbackMessages';
import type { AppError } from '../../shared/errors';
import { ErrorSeverity } from '../../shared/errors';
import type { UserVisibleMessageDescriptor } from '../../shared/i18n/userVisibleMessageDescriptor';
import { ensureContentI18n, getContentI18nResource, getContentMessages } from '../i18n/context';
import type {
  PromptStatus,
  ResolvedStatusMessage,
  SupportPromptMessages,
  SupportPromptOptions
} from './supportPrompt/types';

const FALLBACK_SUPPORT_PROMPT_MESSAGES: SupportPromptMessages = {
  dialogLabel: RUNTIME_FALLBACK_MESSAGES.supportPromptDialogLabel,
  title: RUNTIME_FALLBACK_MESSAGES.supportPromptTitle,
  koFiTitle: RUNTIME_FALLBACK_MESSAGES.supportPromptKoFiTitle,
  koFiDescription: RUNTIME_FALLBACK_MESSAGES.supportPromptKoFiDescription,
  afdianTitle: RUNTIME_FALLBACK_MESSAGES.supportPromptAfdianTitle,
  afdianDescription: RUNTIME_FALLBACK_MESSAGES.supportPromptAfdianDescription,
  githubTitle: RUNTIME_FALLBACK_MESSAGES.supportPromptGithubTitle,
  githubDescription: RUNTIME_FALLBACK_MESSAGES.supportPromptGithubDescription,
  feedbackGroupLabel: RUNTIME_FALLBACK_MESSAGES.supportPromptFeedbackGroupLabel,
  likeLabel: RUNTIME_FALLBACK_MESSAGES.supportPromptLikeLabel,
  dislikeLabel: RUNTIME_FALLBACK_MESSAGES.supportPromptDislikeLabel,
  dismiss: RUNTIME_FALLBACK_MESSAGES.supportPromptDismiss,
  statusSuccess: RUNTIME_FALLBACK_MESSAGES.supportPromptStatusSuccess,
  statusSuccessWithVault: RUNTIME_FALLBACK_MESSAGES.supportPromptStatusSuccessWithVault,
  statusWarning: RUNTIME_FALLBACK_MESSAGES.supportPromptStatusWarning,
  statusWarningWithReason: RUNTIME_FALLBACK_MESSAGES.supportPromptStatusWarningWithReason,
  statusFailure: RUNTIME_FALLBACK_MESSAGES.supportPromptStatusFailure,
  statusFailureWithReason: RUNTIME_FALLBACK_MESSAGES.supportPromptStatusFailureWithReason,
  likeThankYou: RUNTIME_FALLBACK_MESSAGES.supportPromptLikeThankYou,
  reviewLinkLabel: RUNTIME_FALLBACK_MESSAGES.supportPromptReviewLinkLabel,
  reviewAcknowledgedLabel: RUNTIME_FALLBACK_MESSAGES.supportPromptReviewAcknowledgedLabel,
  dislikeToastTitle: RUNTIME_FALLBACK_MESSAGES.supportPromptDislikeToastTitle,
  dislikeRedditLinkLabel: RUNTIME_FALLBACK_MESSAGES.supportPromptDislikeRedditLinkLabel,
  dislikeQrLinkLabel: RUNTIME_FALLBACK_MESSAGES.supportPromptDislikeQrLinkLabel,
  dislikeQrCaption: RUNTIME_FALLBACK_MESSAGES.supportPromptDislikeQrCaption,
  dislikeQrPlaceholder: RUNTIME_FALLBACK_MESSAGES.supportPromptDislikeQrPlaceholder
};

const DEFAULT_PROGRESS_FALLBACK = RUNTIME_FALLBACK_MESSAGES.supportProgressSendingToObsidian;

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
  if (error?.userMessageDescriptor) {
    return undefined;
  }
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
  runtimeMessages?: Messages;
  progressMessage?: UserVisibleMessageDescriptor;
  progressLabel?: string;
}): ResolvedStatusMessage {
  const {
    status,
    vaultLabel,
    reason,
    messages,
    error,
    runtimeMessages,
    progressMessage,
    progressLabel
  } = input;
  let text: string;

  const fill = (template: string, token: string, value: string): string => {
    const pattern = new RegExp(`\\{${token}\\}`, 'g');
    if (pattern.test(template)) {
      return template.replace(pattern, value);
    }
    return `${template}${template.endsWith('：') || template.endsWith(':') ? '' : '：'}${value}`;
  };

  const resolvedProgressText = resolveProgressText(progressMessage, runtimeMessages, progressLabel);
  const resolvedErrorText = resolveDescriptorErrorText(error, runtimeMessages, reason);
  const descriptorReasonAllowed = error?.userMessageDescriptor === undefined;

  if (resolvedProgressText) {
    text = resolvedProgressText;
  } else if (status === 'progress') {
    text = resolveProgressFallback(runtimeMessages);
  } else if (resolvedErrorText) {
    text = resolvedErrorText;
  } else if (status === 'failure') {
    text =
      descriptorReasonAllowed && reason
        ? fill(messages.statusFailureWithReason, 'reason', reason)
        : messages.statusFailure;
  } else if (status === 'warning') {
    text =
      descriptorReasonAllowed && reason
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
    result.codeSuffix = resolveErrorCodeSuffix(error.code, runtimeMessages);
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
        FALLBACK_SUPPORT_PROMPT_MESSAGES.dislikeQrLinkLabel,
      dislikeQrCaption:
        messages.supportPromptDislikeQrCaption ?? FALLBACK_SUPPORT_PROMPT_MESSAGES.dislikeQrCaption
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

function resolveProgressText(
  descriptor: UserVisibleMessageDescriptor | undefined,
  runtimeMessages: Messages | undefined,
  legacyLabel: string | undefined
): string | undefined {
  if (descriptor) {
    const fallback = descriptor.fallback ?? legacyLabel ?? '';
    const resolved = runtimeMessages
      ? formatUserVisibleMessage(descriptor, runtimeMessages, fallback)
      : fallback;
    if (resolved.trim().length > 0) {
      return resolved.trim();
    }
  }

  if (legacyLabel?.trim()) {
    return legacyLabel.trim();
  }

  return undefined;
}

function resolveDescriptorErrorText(
  error: AppError | undefined,
  runtimeMessages: Messages | undefined,
  _fallbackReason: string | undefined
): string | undefined {
  const descriptor = error?.userMessageDescriptor;
  if (!descriptor || !runtimeMessages) {
    return undefined;
  }

  const resolved = formatUserVisibleMessage(descriptor, runtimeMessages);

  if (resolved.trim().length > 0) {
    return resolved.trim();
  }

  return undefined;
}

function resolveProgressFallback(runtimeMessages: Messages | undefined): string {
  if (!runtimeMessages) {
    return DEFAULT_PROGRESS_FALLBACK;
  }

  return formatUserVisibleMessage(
    {
      key: 'supportProgressSendingToObsidian',
      fallback: DEFAULT_PROGRESS_FALLBACK
    },
    runtimeMessages,
    DEFAULT_PROGRESS_FALLBACK
  );
}

function resolveErrorCodeSuffix(code: string, runtimeMessages: Messages | undefined): string {
  const fallback = ` (code: ${code})`;
  if (!runtimeMessages) {
    return fallback;
  }

  return formatUserVisibleMessage(
    {
      key: 'supportProgressErrorCodeSuffix',
      values: { code },
      fallback
    },
    runtimeMessages,
    fallback
  );
}
