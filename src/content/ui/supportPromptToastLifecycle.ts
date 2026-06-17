import type { UsageEventName, UsageEventParamMap } from '../../shared/types/analytics';
import type {
  LikeToastVariant,
  ReviewPromptState,
  SupportPromptMessages
} from './supportPrompt/types';
import type { SupportPromptToastController } from './supportPrompt/SupportPromptToastController';

interface SupportPromptToastLifecycleOptions {
  doc: Document;
  resolveReviewUrl(): string;
  resolveMessages(): Promise<SupportPromptMessages>;
  getReviewState(): Promise<ReviewPromptState>;
  updateReviewState(updates: Partial<ReviewPromptState>): Promise<void>;
  trackUsageEvent<EventName extends UsageEventName>(
    name: EventName,
    params?: UsageEventParamMap[EventName]
  ): Promise<void>;
}

export function createSupportPromptToastLifecycle(options: SupportPromptToastLifecycleOptions) {
  let toastControllerPromise: Promise<SupportPromptToastController> | null = null;

  async function getToastController(): Promise<SupportPromptToastController> {
    if (!toastControllerPromise) {
      toastControllerPromise = import('./supportPrompt/SupportPromptToastController').then(
        ({ SupportPromptToastController }) =>
          new SupportPromptToastController({
            doc: options.doc,
            resolveReviewUrl: () => options.resolveReviewUrl(),
            onReviewLinkClick: async (variant) => {
              await options.trackUsageEvent(
                'support_review_link_clicked',
                variant === undefined ? undefined : { variant }
              );
              await options.updateReviewState({ hasClickedReview: true });
              window.open(options.resolveReviewUrl(), '_blank', 'noopener');
            },
            onReviewAcknowledgedClick: async (variant) => {
              await options.trackUsageEvent(
                'support_review_acknowledged_clicked',
                variant === undefined ? undefined : { variant }
              );
              await options.updateReviewState({
                hasClickedReview: true,
                hasConfirmedReview: true
              });
              const controller = await getToastController();
              controller.dismissToast();
            },
            onDislikeRedditClick: () => {
              void options.trackUsageEvent('support_dislike_reddit_clicked');
            },
            onGitHubFeedbackClick: () => {
              void options.trackUsageEvent('support_github_feedback_clicked');
            },
            onLikeToastShown: (variant) => {
              void options.trackUsageEvent('support_like_toast_shown', { variant });
            },
            onDislikeToastShown: () => {
              void options.trackUsageEvent('support_dislike_toast_shown');
            }
          })
      );
    }
    return toastControllerPromise;
  }

  return {
    destroy(): void {
      if (toastControllerPromise) {
        void toastControllerPromise.then((controller) => controller.destroy());
      }
    },
    async handleLikeClick(): Promise<void> {
      const [messages, state, toastController] = await Promise.all([
        options.resolveMessages(),
        options.getReviewState(),
        getToastController()
      ]);
      const variant: LikeToastVariant = state.hasConfirmedReview
        ? 'acknowledged'
        : state.hasClickedReview
          ? 'returning'
          : 'first';

      toastController.showLikeToast(messages, variant);
      await options.trackUsageEvent('support_like_clicked', { variant });
    },
    async handleDislikeClick(): Promise<void> {
      const [messages, toastController] = await Promise.all([
        options.resolveMessages(),
        getToastController()
      ]);
      toastController.showDislikeToast(messages);
      await options.trackUsageEvent('support_dislike_clicked');
    },
    async showRewardQr(image: { imageSrc: string; imageAlt?: string | undefined }): Promise<void> {
      const toastController = await getToastController();
      toastController.showRewardQrToast(image);
    },
    async preload(): Promise<void> {
      await Promise.all([options.getReviewState(), getToastController()]);
    }
  };
}
