import { ensureContentI18n, getContentI18nResource, getContentMessages } from '../i18n/context';
import type { AppError } from '../../shared/errors';
import { ErrorSeverity } from '../../shared/errors';
import type { TrackUsageEventPayload } from '../../shared/types/analytics';
import { getService, resolveRepository } from '../../shared/di';
import { TOKENS, DI_TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import type { IMessagingRepository } from '../../shared/repositories';
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
import type { SupportPromptToastController } from './supportPrompt/SupportPromptToastController';
import type { PopupCoordinator } from '../runtime/popupCoordinator';
import { resolveContentPopupCoordinator } from '../runtime/popupCoordinatorAccess';
import { createTaskSuccessSurfaceContent } from '@content/stitch/runtimeSurfaceContent';
import { renderStitchRuntimeSurface } from '@content/stitch/runtimeSurfaceRenderer';
import { panelStyleSheetManager } from '@content/shared/panels/styleSheetManager';

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
  dislikeQrLinkLabel: '扫码反馈',
  dislikeQrPlaceholder: '二维码暂不可用'
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
  private host: HTMLElement | null = null;
  private readonly deps: SupportPromptDependencies;
  private readonly popupCoordinator: PopupCoordinator | null;
  private messagesPromise: Promise<SupportPromptMessages> | null = null;
  private toastControllerPromise: Promise<SupportPromptToastController> | null = null;
  private reviewStatePromise: Promise<ReviewPromptState> | null = null;
  private unregisterPopup: (() => void) | null = null;

  constructor(private readonly doc: Document) {
    this.deps = resolveSupportPromptDependencies();
    this.popupCoordinator = resolveContentPopupCoordinator();
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
      }
    ];

    const appData = createTaskSuccessSurfaceContent();
    appData.surfaces.taskSuccess = {
      ...appData.surfaces.taskSuccess,
      status: promptStatus,
      statusMessage: statusMessage.text,
      statusDetail: statusMessage.extraLine ?? '',
      feedbackLabel: messages.feedbackGroupLabel,
      likeLabel: messages.likeLabel,
      dislikeLabel: messages.dislikeLabel,
      dismissLabel: messages.dismiss,
      likeToast: {
        ...appData.surfaces.taskSuccess.likeToast,
        title: messages.likeThankYou,
        actions: [messages.reviewLinkLabel, messages.reviewAcknowledgedLabel]
      },
      dislikeToast: {
        ...appData.surfaces.taskSuccess.dislikeToast,
        title: messages.dislikeToastTitle,
        actions: [messages.dislikeRedditLinkLabel, messages.githubTitle]
      }
    };
    appData.resources.support = {
      ...appData.resources.support,
      channels: links.map((link) => ({
        title: link.title,
        icon: link.icon,
        ...(link.description ? { subtitle: link.description } : {}),
        href: link.url
      }))
    };

    const surface = renderStitchRuntimeSurface({
      surfaceId: 'task-success',
      appData,
      actions: {
        'resource:close': () => this.hide(),
        'task-success:like': () => {
          void this.handleLikeClick();
        },
        'task-success:dislike': () => {
          void this.handleDislikeClick();
        }
      }
    });
    this.decorateSurface(surface);

    const host = this.doc.createElement('div');
    host.id = 'aiob-support-prompt';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    const shadow = host.attachShadow({ mode: 'open' });
    panelStyleSheetManager.applyStitchRuntimeStyles(shadow);
    shadow.append(surface);
    this.doc.body.append(host);
    this.host = host;
    if (!this.unregisterPopup && this.popupCoordinator) {
      this.unregisterPopup = this.popupCoordinator.register(this);
    }
    queueMicrotask(() => host.focus());
    await this.preloadLowFrequencyPaths();
  }

  mount(options?: SupportPromptOptions): Promise<void> {
    return this.show(options);
  }

  update(options?: SupportPromptOptions): Promise<void> {
    return this.show(options);
  }

  hide(): void {
    this.unregisterPopup?.();
    this.unregisterPopup = null;
    this.host?.remove();
    this.host = null;
  }

  destroy(): void {
    this.hide();
    if (this.toastControllerPromise) {
      void this.toastControllerPromise.then((controller) => controller.destroy());
    }
  }

  private async handleLikeClick(): Promise<void> {
    this.hide();
    const [messages, state, toastController] = await Promise.all([
      this.resolveMessages(),
      this.getReviewState(),
      this.getToastController()
    ]);
    const variant: LikeToastVariant = state.hasConfirmedReview
      ? 'acknowledged'
      : state.hasClickedReview
        ? 'returning'
        : 'first';

    toastController.showLikeToast(messages, variant);
    await this.trackUsageEvent('support_like_clicked', { variant });
  }

  private decorateSurface(surface: HTMLElement): void {
    surface.style.pointerEvents = 'auto';
    const like = surface.querySelector<HTMLElement>('[data-action-id="task-success:like"]');
    const dislike = surface.querySelector<HTMLElement>('[data-action-id="task-success:dislike"]');
    like?.setAttribute('data-role', 'like-btn');
    dislike?.setAttribute('data-role', 'dislike-btn');
    surface
      .querySelector<HTMLElement>('.task-header-status')
      ?.setAttribute('data-role', 'status-text');
    surface
      .querySelector<HTMLElement>('.task-feedback-dismiss')
      ?.setAttribute('data-role', 'dismiss-text');
    const detail = surface.querySelector<HTMLElement>('.task-status-detail');
    detail?.setAttribute('data-role', 'status-detail');
    surface.querySelectorAll<HTMLAnchorElement>('.task-support-link[href]').forEach((link) => {
      link.addEventListener('click', () => {
        void this.trackUsageEvent('support_link_clicked', { url: link.href });
      });
    });
  }

  private async handleDislikeClick(): Promise<void> {
    this.hide();
    const [messages, toastController] = await Promise.all([
      this.resolveMessages(),
      this.getToastController()
    ]);
    toastController.showDislikeToast(messages);
    await this.trackUsageEvent('support_dislike_clicked');
  }

  private async preloadLowFrequencyPaths(): Promise<void> {
    await Promise.all([this.getReviewState(), this.getToastController()]);
  }

  private async getToastController(): Promise<SupportPromptToastController> {
    if (!this.toastControllerPromise) {
      this.toastControllerPromise = import('./supportPrompt/SupportPromptToastController').then(
        ({ SupportPromptToastController }) =>
          new SupportPromptToastController({
            doc: this.doc,
            resolveReviewUrl: () => this.resolveReviewUrl(),
            onReviewLinkClick: async (variant) => {
              await this.trackUsageEvent('support_review_link_clicked', { variant });
              await this.updateReviewState({ hasClickedReview: true });
              window.open(this.resolveReviewUrl(), '_blank', 'noopener');
            },
            onReviewAcknowledgedClick: async (variant) => {
              await this.trackUsageEvent('support_review_acknowledged_clicked', { variant });
              await this.updateReviewState({ hasClickedReview: true, hasConfirmedReview: true });
              const controller = await this.getToastController();
              controller.dismissToast();
            },
            onDislikeRedditClick: () => {
              void this.trackUsageEvent('support_dislike_reddit_clicked');
            },
            onGitHubFeedbackClick: () => {
              void this.trackUsageEvent('support_github_feedback_clicked');
            },
            onLikeToastShown: (variant) => {
              void this.trackUsageEvent('support_like_toast_shown', { variant });
            },
            onDislikeToastShown: () => {
              void this.trackUsageEvent('support_dislike_toast_shown');
            }
          })
      );
    }
    return this.toastControllerPromise;
  }

  private async resolveMessages(): Promise<SupportPromptMessages> {
    let messagesPromise = this.messagesPromise;
    if (messagesPromise === null) {
      messagesPromise = (async () => {
        try {
          await ensureContentI18n(this.doc);
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
              messages.supportPromptReviewLinkLabel ??
              FALLBACK_SUPPORT_PROMPT_MESSAGES.reviewLinkLabel,
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
      })();
      this.messagesPromise = messagesPromise;
    }

    return messagesPromise;
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
