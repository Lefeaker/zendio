import type { LikeToastVariant, SupportPromptMessages, ToastVariant } from './types';
import { panelStyleSheetManager } from '../../shared/panels/styleSheetManager';
import { getControlledRuntimeTheme } from '@content/stitch/runtimeTheme';

const TOAST_AUTO_DISMISS_MS = 5000;
type SupportPromptToastKind = 'like' | 'dislike' | 'reward-qr';
type ActiveToastVariant = ToastVariant | 'reward-qr';

interface RewardQrToastOptions {
  imageSrc: string;
  imageAlt?: string | undefined;
}

interface ShowToastOptions {
  autoDismiss: boolean;
}

interface SupportPromptToastControllerOptions {
  doc: Document;
  resolveReviewUrl: () => string;
  onReviewLinkClick: (variant?: LikeToastVariant) => Promise<void>;
  onReviewAcknowledgedClick: (variant?: LikeToastVariant) => Promise<void>;
  onDislikeRedditClick: () => void;
  onGitHubFeedbackClick: () => void;
  onLikeToastShown: (variant: LikeToastVariant) => void;
  onDislikeToastShown: () => void;
}

export class SupportPromptToastController {
  private activeHost: HTMLDivElement | null = null;
  private activeToast: HTMLDivElement | null = null;
  private activeToastVariant: ActiveToastVariant | null = null;
  private toastTimer: number | null = null;

  private readonly handleToastPointerDown = (event: PointerEvent): void => {
    if (!this.activeToast) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && this.activeHost?.contains(target)) {
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

    this.showToast(toast, variant);
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
    redditLink.href =
      'https://www.reddit.com/r/ObsidianMD/comments/1oahhds/i_made_a_browser_extension_for_a_better/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button';
    redditLink.target = '_blank';
    redditLink.rel = 'noopener noreferrer';
    redditLink.textContent = messages.dislikeRedditLinkLabel;
    redditLink.addEventListener('click', () => {
      this.options.onDislikeRedditClick();
    });
    links.appendChild(redditLink);

    const githubLink = this.options.doc.createElement('a');
    githubLink.dataset.role = 'github-link';
    githubLink.className = 'toast-link-button';
    githubLink.href = 'https://github.com/Lefeaker/AllinOB/issues';
    githubLink.target = '_blank';
    githubLink.rel = 'noopener noreferrer';
    githubLink.textContent = messages.githubTitle;
    githubLink.addEventListener('click', () => {
      this.options.onGitHubFeedbackClick();
    });
    links.appendChild(githubLink);

    toast.appendChild(links);

    this.showToast(toast, 'dislike');
    this.options.onDislikeToastShown();
  }

  showRewardQrToast({ imageSrc, imageAlt }: RewardQrToastOptions): void {
    const toast = this.createBaseToast('reward-qr');
    toast.setAttribute('role', 'dialog');
    toast.setAttribute('aria-modal', 'false');
    toast.setAttribute('aria-label', imageAlt ?? 'WeChat reward code');

    const image = this.options.doc.createElement('img');
    image.className = 'support-prompt-reward-qr';
    image.dataset.role = 'wechat-reward-qr-image';
    image.src = imageSrc;
    image.alt = imageAlt ?? 'WeChat reward code';
    toast.appendChild(image);

    this.showToast(toast, 'reward-qr', { autoDismiss: false });
  }

  private createBaseToast(kind: SupportPromptToastKind): HTMLDivElement {
    this.dismissToast(true);
    const host = this.options.doc.createElement('div');
    host.id = 'aiob-support-toast-host';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    const shadow = host.attachShadow({ mode: 'open' });
    void panelStyleSheetManager.initialize();
    panelStyleSheetManager.applyStitchRuntimeStyles(shadow);

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
    this.activeHost = host;
    return toast;
  }

  private showToast(
    toast: HTMLDivElement,
    variant: ActiveToastVariant,
    options: ShowToastOptions = { autoDismiss: true }
  ): void {
    if (!this.activeHost) {
      return;
    }
    this.options.doc.body.appendChild(this.activeHost);
    this.activeToast = toast;
    this.activeToastVariant = variant;

    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    if (options.autoDismiss) {
      this.toastTimer = window.setTimeout(() => this.dismissToast(), TOAST_AUTO_DISMISS_MS);
    }
    this.options.doc.addEventListener('pointerdown', this.handleToastPointerDown, true);
    this.options.doc.addEventListener('keydown', this.handleToastKeyDown, true);
  }

  dismissToast(immediate = false): void {
    if (!this.activeToast) {
      return;
    }
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.options.doc.removeEventListener('pointerdown', this.handleToastPointerDown, true);
    this.options.doc.removeEventListener('keydown', this.handleToastKeyDown, true);

    const toast = this.activeToast;
    const remove = () => {
      toast.removeEventListener('transitionend', remove);
      this.activeHost?.remove();
      if (this.activeToast === toast) {
        this.activeHost = null;
        this.activeToast = null;
        this.activeToastVariant = null;
      }
    };

    if (immediate) {
      remove();
      return;
    }

    toast.addEventListener('transitionend', remove);
    toast.classList.remove('is-visible');
  }
}
