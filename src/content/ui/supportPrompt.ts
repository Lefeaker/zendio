import type { TrackUsageEventPayload } from '../../shared/types/analytics';
import type { UiMountable } from '../../ui/hosts/shared/contract';
import type {
  ReviewPromptState,
  SupportLink,
  SupportPromptMessages,
  SupportPromptOptions
} from './supportPrompt/types';
import type { PopupCoordinator } from '../runtime/popupCoordinator';
import { resolveContentPopupCoordinator } from '../runtime/popupCoordinatorAccess';
import { createTaskSuccessSurfaceContent } from '@content/stitch/runtimeSurfaceContent';
import { renderStitchRuntimeSurface } from '@content/stitch/runtimeSurfaceRenderer';
import { panelStyleSheetManager } from '@content/shared/panels/styleSheetManager';
import {
  mapSeverityToStatus,
  resolveStatusMessage,
  resolveSupportPromptMessages,
  resolveSupportPromptProgress,
  resolveSupportPromptReason
} from './supportPromptMessages';
import {
  resolveSupportPromptDependencies,
  type SupportPromptDependencies
} from './supportPromptServices';
import { createSupportPromptToastLifecycle } from './supportPromptToastLifecycle';

const REVIEW_BASE_URL =
  'https://chromewebstore.google.com/detail/all-in-ob/eoohmbhdepgknfemajanfaejmonckgmo';
const REVIEW_STATE_STORAGE_KEY = 'support_prompt_review_state';
const TERMINAL_PROGRESS_DISMISS_MS = 2200;

export class SupportPrompt
  implements
    UiMountable<SupportPromptOptions | undefined, SupportPromptOptions | undefined, Promise<void>>
{
  private host: HTMLElement | null = null;
  private readonly deps: SupportPromptDependencies;
  private readonly popupCoordinator: PopupCoordinator | null;
  private readonly toastLifecycle: ReturnType<typeof createSupportPromptToastLifecycle>;
  private messagesPromise: Promise<SupportPromptMessages> | null = null;
  private reviewStatePromise: Promise<ReviewPromptState> | null = null;
  private unregisterPopup: (() => void) | null = null;
  private autoDismissTimer: number | null = null;
  private renderSequence = 0;

  constructor(private readonly doc: Document) {
    this.deps = resolveSupportPromptDependencies();
    this.popupCoordinator = resolveContentPopupCoordinator();
    this.toastLifecycle = createSupportPromptToastLifecycle({
      doc: this.doc,
      resolveReviewUrl: () => this.resolveReviewUrl(),
      resolveMessages: () => this.resolveMessages(),
      getReviewState: () => this.getReviewState(),
      updateReviewState: (updates) => this.updateReviewState(updates),
      trackUsageEvent: (name, params) => this.trackUsageEvent(name, params)
    });
  }

  async show(options?: SupportPromptOptions): Promise<void> {
    const renderId = ++this.renderSequence;
    this.removeHost();
    const messages = await this.resolveMessages();
    if (renderId !== this.renderSequence) {
      return;
    }
    const resolvedError = options?.error;
    const promptStatus =
      options?.status ?? (resolvedError ? mapSeverityToStatus(resolvedError.severity) : 'success');
    const reason = resolveSupportPromptReason(resolvedError, options?.errorMessage);
    const vaultLabel = options?.vaultName?.trim();
    const statusMessage = resolveStatusMessage({
      status: promptStatus,
      ...(vaultLabel ? { vaultLabel } : {}),
      ...(reason !== undefined && { reason }),
      messages,
      ...(resolvedError !== undefined && { error: resolvedError }),
      ...(options?.progress?.label ? { progressLabel: options.progress.label } : {})
    });
    const progress = resolveSupportPromptProgress(options, promptStatus);

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
      progress,
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
    this.scheduleAutoDismiss(options);
    await this.preloadLowFrequencyPaths();
  }

  mount(options?: SupportPromptOptions): Promise<void> {
    return this.show(options);
  }

  update(options?: SupportPromptOptions): Promise<void> {
    return this.show(options);
  }

  hide(): void {
    this.renderSequence += 1;
    this.removeHost();
  }

  private removeHost(): void {
    this.clearAutoDismiss();
    this.unregisterPopup?.();
    this.unregisterPopup = null;
    this.doc.querySelectorAll<HTMLElement>('#aiob-support-prompt').forEach((host) => {
      host.remove();
    });
    this.host = null;
  }

  destroy(): void {
    this.hide();
    this.toastLifecycle.destroy();
  }

  private async handleLikeClick(): Promise<void> {
    this.hide();
    await this.toastLifecycle.handleLikeClick();
  }

  private scheduleAutoDismiss(options?: SupportPromptOptions): void {
    this.clearAutoDismiss();
    const variant = options?.progress?.variant;
    if (variant !== 'success' && variant !== 'failure' && variant !== 'warning') {
      return;
    }
    const view = this.doc.defaultView ?? window;
    this.autoDismissTimer = view.setTimeout(() => {
      this.hide();
    }, TERMINAL_PROGRESS_DISMISS_MS);
  }

  private clearAutoDismiss(): void {
    if (this.autoDismissTimer === null) {
      return;
    }
    const view = this.doc.defaultView ?? window;
    view.clearTimeout(this.autoDismissTimer);
    this.autoDismissTimer = null;
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
      .querySelector<HTMLElement>('.task-progress-track')
      ?.setAttribute('data-role', 'task-progress');
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
    await this.toastLifecycle.handleDislikeClick();
  }

  private async preloadLowFrequencyPaths(): Promise<void> {
    await this.toastLifecycle.preload();
  }

  private async resolveMessages(): Promise<SupportPromptMessages> {
    let messagesPromise = this.messagesPromise;
    if (messagesPromise === null) {
      messagesPromise = resolveSupportPromptMessages(this.doc);
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
