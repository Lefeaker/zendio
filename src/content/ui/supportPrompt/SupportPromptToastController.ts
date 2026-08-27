import type { LikeToastVariant, SupportPromptMessages } from './types';
import {
  panelStyleSheetManager,
  prepareStyleHost,
  revealStyleHost
} from '../../shared/panels/styleSheetManager';
import { getControlledRuntimeTheme } from '@content/stitch/runtimeTheme';
import { ZENDIO_RESOURCE_LINKS } from '@shared/links/zendioResourceLinks';
import type { StyleAttachmentHandle } from '@ui/foundation/style-host';
const TOAST_AUTO_DISMISS_MS = 5000;
const TOAST_EXIT_FALLBACK_MS = 350;
type SupportPromptToastKind = 'like' | 'dislike' | 'reward-qr';
interface RewardQrToastOptions {
  imageSrc: string;
  imageAlt?: string | undefined;
  imageRole?: string | undefined;
  caption?: string | undefined;
  captionRole?: string | undefined;
  channel?: 'wechat-reward' | 'xiaohongshu-feedback' | undefined;
}
interface SupportPromptToastControllerOptions {
  doc: Document;
  resolveReviewUrl: () => string;
  onReviewLinkClick: (variant?: LikeToastVariant) => Promise<void>;
  onReviewAcknowledgedClick: (variant?: LikeToastVariant) => Promise<void>;
  onDislikeRedditClick: () => void;
  onDislikeXiaohongshuClick: (image: { imageAlt: string; caption: string }) => void;
  onGitHubFeedbackClick: () => void;
  onLikeToastShown: (variant: LikeToastVariant) => void;
  onDislikeToastShown: () => void;
}
type ActiveToast = {
  host: HTMLDivElement;
  toast: HTMLDivElement;
  styleAttachment: StyleAttachmentHandle;
  animationFrame: number | null;
};
export class SupportPromptToastController {
  private activeToast: ActiveToast | null = null;
  private toastTimer: number | null = null;
  private toastExitTimer: number | null = null;
  private readonly handleToastPointerDown = (event: PointerEvent): void => {
    const activeToast = this.activeToast;
    if (!activeToast) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && activeToast.host.contains(target)) {
      return;
    }
    this.dismissToast();
  };
  private readonly handleToastKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.dismissToast();
    }
  };
  constructor(private readonly options: SupportPromptToastControllerOptions) {}
  destroy(): void {
    this.dismissToast(true);
  }
  showLikeToast(messages: SupportPromptMessages, variant: LikeToastVariant): void {
    const toast = this.createBaseToast('like');
    toast.dataset.variant = variant;
    const messageLine = this.options.doc.createElement('strong');
    messageLine.dataset.role = 'like-toast-message';
    messageLine.textContent = messages.likeThankYou;
    toast.appendChild(messageLine);
    if (variant !== 'acknowledged') {
      const links = this.options.doc.createElement('div');
      links.className = 'toast-action-list';
      if (variant === 'returning') {
        const acknowledgedLink = this.options.doc.createElement('button');
        acknowledgedLink.type = 'button';
        acknowledgedLink.dataset.role = 'review-acknowledged-btn';
        acknowledgedLink.className = 'toast-link-button';
        acknowledgedLink.textContent = messages.reviewAcknowledgedLabel;
        acknowledgedLink.addEventListener('click', (event) => {
          event.preventDefault();
          void this.options.onReviewAcknowledgedClick(variant);
        });
        links.appendChild(acknowledgedLink);
      }
      const reviewLink = this.options.doc.createElement('button');
      reviewLink.type = 'button';
      reviewLink.dataset.role = 'review-link-btn';
      reviewLink.className = 'toast-link-button';
      reviewLink.textContent = messages.reviewLinkLabel;
      reviewLink.addEventListener('click', (event) => {
        event.preventDefault();
        void this.options.onReviewLinkClick(variant);
      });
      links.appendChild(reviewLink);
      toast.appendChild(links);
    }
    this.showToast(toast, false);
    this.options.onLikeToastShown(variant);
  }
  showDislikeToast(messages: SupportPromptMessages): void {
    const toast = this.createBaseToast('dislike');
    const title = this.options.doc.createElement('strong');
    title.dataset.role = 'dislike-toast-title';
    title.textContent = messages.dislikeToastTitle;
    toast.appendChild(title);
    const links = this.options.doc.createElement('div');
    links.className = 'toast-action-list';
    const redditLink = this.options.doc.createElement('a');
    redditLink.dataset.role = 'reddit-link';
    redditLink.className = 'toast-link-button';
    redditLink.href = ZENDIO_RESOURCE_LINKS.redditFeedbackThread;
    redditLink.target = '_blank';
    redditLink.rel = 'noopener noreferrer';
    redditLink.textContent = messages.dislikeRedditLinkLabel;
    redditLink.addEventListener('click', () => {
      this.options.onDislikeRedditClick();
    });
    links.appendChild(redditLink);
    const xiaohongshuButton = this.options.doc.createElement('button');
    xiaohongshuButton.type = 'button';
    xiaohongshuButton.dataset.role = 'xiaohongshu-feedback-btn';
    xiaohongshuButton.className = 'toast-link-button';
    xiaohongshuButton.textContent = messages.dislikeQrLinkLabel;
    xiaohongshuButton.addEventListener('click', (event) => {
      event.preventDefault();
      this.options.onDislikeXiaohongshuClick({
        imageAlt: messages.dislikeQrLinkLabel,
        caption: messages.dislikeQrCaption
      });
    });
    links.appendChild(xiaohongshuButton);
    const githubLink = this.options.doc.createElement('a');
    githubLink.dataset.role = 'github-link';
    githubLink.className = 'toast-link-button';
    githubLink.href = ZENDIO_RESOURCE_LINKS.githubIssues;
    githubLink.target = '_blank';
    githubLink.rel = 'noopener noreferrer';
    githubLink.textContent = messages.githubTitle;
    githubLink.addEventListener('click', () => {
      this.options.onGitHubFeedbackClick();
    });
    links.appendChild(githubLink);
    toast.appendChild(links);
    this.showToast(toast, false);
    this.options.onDislikeToastShown();
  }
  showRewardQrToast({
    imageSrc,
    imageAlt,
    imageRole,
    caption,
    captionRole,
    channel
  }: RewardQrToastOptions): void {
    const toast = this.createBaseToast('reward-qr');
    if (channel === 'xiaohongshu-feedback') {
      toast.classList.add('reward-qr--xiaohongshu');
    }
    toast.setAttribute('role', 'dialog');
    toast.setAttribute('aria-modal', 'false');
    toast.setAttribute('aria-label', imageAlt ?? 'WeChat reward code');
    const image = this.options.doc.createElement('img');
    image.className = 'support-prompt-reward-qr';
    image.dataset.role = imageRole ?? 'wechat-reward-qr-image';
    image.src = imageSrc;
    image.alt = imageAlt ?? 'WeChat reward code';
    toast.appendChild(image);
    if (caption) {
      const captionLine = this.options.doc.createElement('span');
      captionLine.className = 'support-prompt-reward-qr-caption';
      if (captionRole) {
        captionLine.dataset.role = captionRole;
      }
      captionLine.textContent = caption;
      toast.appendChild(captionLine);
    }
    this.showToast(toast, false);
  }
  private createBaseToast(kind: SupportPromptToastKind): HTMLDivElement {
    this.dismissToast(true);
    const host = this.options.doc.createElement('div');
    host.id = 'aiob-support-toast-host';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    prepareStyleHost(host);
    host.dataset.aiobStyleReveal = 'true';
    const shadow = host.attachShadow({ mode: 'open' });
    const styleAttachment = panelStyleSheetManager.applyPromptTaskStyles(shadow);
    const root = this.options.doc.createElement('div');
    root.className = 'support-prompt-toast-root stitch-runtime-surface';
    root.dataset.previewSkin = 'stitch-secondary';
    root.dataset.previewTheme = getControlledRuntimeTheme() ?? 'dark';
    const toast = this.options.doc.createElement('div');
    toast.id = 'aiob-support-toast';
    toast.dataset.kind = kind;
    toast.className = `support-prompt-toast prompt-toast ${kind}`;
    root.appendChild(toast);
    shadow.appendChild(root);
    this.activeToast = { host, toast, styleAttachment, animationFrame: null };
    return toast;
  }
  private showToast(toast: HTMLDivElement, autoDismiss = true): void {
    const activeToast = this.activeToast;
    if (!activeToast || activeToast.toast !== toast) {
      throw new Error('Support toast lifecycle is missing');
    }
    this.options.doc.body.appendChild(activeToast.host);
    void revealStyleHost(activeToast.host, activeToast.styleAttachment).then((ready) => {
      if (this.activeToast !== activeToast) return;
      if (!ready) {
        this.dismissToast(true);
        return;
      }
      activeToast.animationFrame = requestAnimationFrame(() => {
        activeToast.animationFrame = null;
        if (this.activeToast === activeToast) toast.classList.add('is-visible');
      });
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
        this.toastTimer = null;
      }
      if (this.toastExitTimer !== null) {
        window.clearTimeout(this.toastExitTimer);
        this.toastExitTimer = null;
      }
      if (autoDismiss) {
        this.toastTimer = window.setTimeout(() => this.dismissToast(), TOAST_AUTO_DISMISS_MS);
      }
      this.options.doc.addEventListener('pointerdown', this.handleToastPointerDown, true);
      this.options.doc.addEventListener('keydown', this.handleToastKeyDown, true);
    });
  }
  dismissToast(immediate = false): void {
    const activeToast = this.activeToast;
    if (!activeToast) {
      return;
    }
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.options.doc.removeEventListener('pointerdown', this.handleToastPointerDown, true);
    this.options.doc.removeEventListener('keydown', this.handleToastKeyDown, true);
    if (activeToast.animationFrame !== null) {
      cancelAnimationFrame(activeToast.animationFrame);
      activeToast.animationFrame = null;
    }
    const { toast } = activeToast;
    let removed = false;
    const remove = (): void => {
      if (removed || this.activeToast !== activeToast) return;
      removed = true;
      toast.removeEventListener('transitionend', handleTransitionEnd);
      activeToast.styleAttachment.dispose();
      activeToast.host.remove();
      if (this.activeToast === activeToast) {
        if (this.toastExitTimer !== null) {
          window.clearTimeout(this.toastExitTimer);
          this.toastExitTimer = null;
        }
        this.activeToast = null;
      }
    };
    const handleTransitionEnd = (event: TransitionEvent): void => {
      if (event.target === toast) {
        remove();
      }
    };
    if (immediate) {
      remove();
      return;
    }
    toast.addEventListener('transitionend', handleTransitionEnd);
    toast.classList.remove('is-visible');
    this.toastExitTimer = window.setTimeout(remove, TOAST_EXIT_FALLBACK_MS);
  }
}
