import { ensureContentI18n, getContentI18nResource, getContentMessages } from '../i18n/context';
import type { AppError } from '../../shared/errors';
import { ErrorSeverity } from '../../shared/errors';
import type { TrackUsageEventPayload } from '../../shared/types/analytics';
import { getService, resolveRepository } from '../../shared/di';
import { TOKENS, DI_TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import type { IMessagingRepository } from '../../shared/repositories';
import { SupportPromptToastController } from './supportPrompt/SupportPromptToastController';
import { SupportPromptView } from '../../ui/domains/video';
import type { UiMountable } from '../../ui/hosts/shared/contract';
import type {
  LikeToastVariant,
  PromptStatus,
  ResolvedStatusMessage,
  ReviewPromptState,
  SupportLink,
  SupportPromptMessages,
  SupportPromptOptions
} from './supportPrompt/types';

const REVIEW_BASE_URL =
  'https://chromewebstore.google.com/detail/all-in-ob/eoohmbhdepgknfemajanfaejmonckgmo';
const REVIEW_STATE_STORAGE_KEY = 'support_prompt_review_state';

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
  dislikeQrLinkLabel: '加入小红书群',
  dislikeQrPlaceholder: '二维码稍后提供'
};

const SEVERITY_STATUS_MAP: Record<ErrorSeverity, PromptStatus> = {
  [ErrorSeverity.INFO]: 'success',
  [ErrorSeverity.WARNING]: 'warning',
  [ErrorSeverity.ERROR]: 'failure',
  [ErrorSeverity.CRITICAL]: 'failure'
};

interface SupportPromptDependencies {
  storage: PlatformServices['storage'];
  runtime: PlatformServices['runtime'];
  messaging: IMessagingRepository;
}

function resolveSupportPromptDependencies(): SupportPromptDependencies {
  const platformServices = getService<PlatformServices>(TOKENS.platformServices);
  return {
    storage: platformServices.storage,
    runtime: platformServices.runtime,
    messaging: resolveRepository<IMessagingRepository>(DI_TOKENS.IMessagingRepository)
  };
}

function mapSeverityToStatus(severity: ErrorSeverity): PromptStatus {
  return SEVERITY_STATUS_MAP[severity] ?? 'success';
}

function resolveReason(error?: AppError, fallback?: string): string | undefined {
  const candidate = error?.userMessage ?? error?.message ?? fallback;
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate.trim();
  }
  return undefined;
}

function resolveStatusMessage(input: {
  status: PromptStatus;
  vaultLabel?: string;
  reason?: string;
  messages: SupportPromptMessages;
  error?: AppError;
}): ResolvedStatusMessage {
  const { status, vaultLabel, reason, messages, error } = input;
  let text: string;

  const fill = (template: string, token: string, value: string): string => {
    const pattern = new RegExp(`\\{${token}\\}`, 'g');
    if (pattern.test(template)) {
      return template.replace(pattern, value);
    }
    return `${template}${template.endsWith('：') || template.endsWith(':') ? '' : '：'}${value}`;
  };

  if (status === 'failure') {
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

export class SupportPrompt
  implements
    UiMountable<SupportPromptOptions | undefined, SupportPromptOptions | undefined, Promise<void>>
{
  private view: SupportPromptView | null = null;
  private readonly deps: SupportPromptDependencies;
  private readonly toastController: SupportPromptToastController;
  private reviewStatePromise: Promise<ReviewPromptState> | null = null;

  constructor(private readonly doc: Document) {
    this.deps = resolveSupportPromptDependencies();
    this.toastController = new SupportPromptToastController({
      doc,
      resolveReviewUrl: () => this.resolveReviewUrl(),
      onReviewLinkClick: async (variant) => {
        await this.trackUsageEvent('support_review_link_clicked', { variant });
        await this.updateReviewState({ hasClickedReview: true });
        window.open(this.resolveReviewUrl(), '_blank', 'noopener');
      },
      onReviewAcknowledgedClick: async (variant) => {
        await this.trackUsageEvent('support_review_acknowledged_clicked', { variant });
        await this.updateReviewState({ hasClickedReview: true, hasConfirmedReview: true });
        this.toastController.dismissToast();
      },
      onDislikeRedditClick: () => {
        void this.trackUsageEvent('support_dislike_reddit_clicked');
      },
      onDislikeQrClick: () => {
        void this.trackUsageEvent('support_dislike_qr_clicked');
      },
      onLikeToastShown: (variant) => {
        void this.trackUsageEvent('support_like_toast_shown', { variant });
      },
      onDislikeToastShown: () => {
        void this.trackUsageEvent('support_dislike_toast_shown');
      }
    });
  }

  async show(options?: SupportPromptOptions): Promise<void> {
    this.hide();
    const messages = await this.resolveMessages();
    const resolvedError = options?.error;
    const promptStatus =
      options?.status ?? (resolvedError ? mapSeverityToStatus(resolvedError.severity) : 'success');
    const reason = resolveReason(resolvedError, options?.errorMessage);
    const vaultLabel = options?.vaultName?.trim();
    const statusMessage = resolveStatusMessage({
      status: promptStatus,
      ...(vaultLabel ? { vaultLabel } : {}),
      ...(reason !== undefined && { reason }),
      messages,
      ...(resolvedError !== undefined && { error: resolvedError })
    });

    const links: SupportLink[] = [
      {
        icon: this.resolveAssetUrl('icons/ko-fi.svg'),
        title: messages.koFiTitle,
        description: messages.koFiDescription,
        url: 'https://ko-fi.com/xiannian'
      },
      {
        icon: this.resolveAssetUrl('icons/aifadian-line-copy.svg'),
        title: messages.afdianTitle,
        description: messages.afdianDescription,
        url: 'https://afdian.com/a/LefShi'
      },
      {
        icon: this.resolveAssetUrl('icons/github-fill.svg'),
        title: messages.githubTitle,
        description: messages.githubDescription,
        url: 'https://github.com/Lefeaker/AllinOB/issues'
      }
    ];

    this.view = new SupportPromptView({
      messages,
      links,
      status: promptStatus,
      statusMessage,
      onLike: () => {
        void this.handleLikeClick();
      },
      onDislike: () => {
        void this.handleDislikeClick();
      },
      onClose: () => this.hide(),
      onLinkClick: (url) => {
        void this.trackUsageEvent('support_link_clicked', { url });
      }
    });

    const host = this.view.render();
    host.id = 'aiob-support-prompt';
    this.view.show();
    queueMicrotask(() => host.focus());
  }

  mount(options?: SupportPromptOptions): Promise<void> {
    return this.show(options);
  }

  update(options?: SupportPromptOptions): Promise<void> {
    return this.show(options);
  }

  hide(): void {
    this.view?.destroy();
    this.view = null;
  }

  destroy(): void {
    this.hide();
    this.toastController.destroy();
  }

  private async handleLikeClick(): Promise<void> {
    const messages = await this.resolveMessages();
    const state = await this.getReviewState();
    const variant: LikeToastVariant = state.hasConfirmedReview
      ? 'acknowledged'
      : state.hasClickedReview
        ? 'returning'
        : 'first';

    this.toastController.showLikeToast(messages, variant);
    await this.trackUsageEvent('support_like_clicked', { variant });
    this.hide();
  }

  private async handleDislikeClick(): Promise<void> {
    const messages = await this.resolveMessages();
    this.toastController.showDislikeToast(messages);
    await this.trackUsageEvent('support_dislike_clicked');
    this.hide();
  }

  private async resolveMessages(): Promise<SupportPromptMessages> {
    try {
      await ensureContentI18n(this.doc);
      const resource = getContentI18nResource();
      const messages = resource?.messages ?? (await getContentMessages());
      return {
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
        dislikeQrPlaceholder:
          messages.supportPromptDislikeQrPlaceholder ??
          FALLBACK_SUPPORT_PROMPT_MESSAGES.dislikeQrPlaceholder
      };
    } catch (error) {
      console.warn('[support-prompt] Failed to load i18n messages:', error);
      return FALLBACK_SUPPORT_PROMPT_MESSAGES;
    }
  }

  private resolveAssetUrl(path: string): string {
    try {
      return this.deps.runtime.getURL(path);
    } catch {
      return path;
    }
  }

  private resolveReviewUrl(): string {
    const locale = this.resolveReviewLocale();
    return `${REVIEW_BASE_URL}/reviews?reviewId=0&hl=${encodeURIComponent(locale)}`;
  }

  private resolveReviewLocale(): string {
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
        return chrome.i18n.getUILanguage();
      }
    } catch {
      // ignore
    }
    if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
      return navigator.language || 'en';
    }
    return 'en';
  }

  private async getReviewState(): Promise<ReviewPromptState> {
    if (this.reviewStatePromise === null) {
      this.reviewStatePromise = this.loadReviewState();
    }
    return this.reviewStatePromise;
  }

  private async loadReviewState(): Promise<ReviewPromptState> {
    try {
      const stored = await this.deps.storage.local.get<ReviewPromptState>(REVIEW_STATE_STORAGE_KEY);
      return stored ?? {};
    } catch (error) {
      console.warn('[support-prompt] Failed to load review prompt state:', error);
      return {};
    }
  }

  private async updateReviewState(updates: Partial<ReviewPromptState>): Promise<void> {
    const current = await this.getReviewState();
    const next: ReviewPromptState = { ...current, ...updates };
    try {
      await this.deps.storage.local.set(REVIEW_STATE_STORAGE_KEY, next);
      this.reviewStatePromise = Promise.resolve(next);
    } catch (error) {
      console.warn('[support-prompt] Failed to update review prompt state:', error);
    }
  }

  private async trackUsageEvent(
    name: string,
    params?: TrackUsageEventPayload['params']
  ): Promise<void> {
    try {
      await this.deps.messaging.send({
        type: 'track',
        event: name,
        ...(params !== undefined && { params })
      });
    } catch (error) {
      console.debug('[support-prompt] Failed to send analytics event:', error);
    }
  }
}

export type { SupportPromptMessages, SupportPromptOptions } from './supportPrompt/types';
