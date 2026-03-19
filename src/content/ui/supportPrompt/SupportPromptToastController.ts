import type { LikeToastVariant, SupportPromptMessages, ToastVariant } from './types';
import { panelStyleSheetManager } from '../../shared/panels/styleSheetManager';

const TOAST_AUTO_DISMISS_MS = 5000;

interface SupportPromptToastControllerOptions {
  doc: Document;
  resolveReviewUrl: () => string;
  onReviewLinkClick: (variant?: LikeToastVariant) => Promise<void>;
  onReviewAcknowledgedClick: (variant?: LikeToastVariant) => Promise<void>;
  onDislikeRedditClick: () => void;
  onDislikeQrClick: () => void;
  onLikeToastShown: (variant: LikeToastVariant) => void;
  onDislikeToastShown: () => void;
}

export class SupportPromptToastController {
  private activeHost: HTMLDivElement | null = null;
  private activeToast: HTMLDivElement | null = null;
  private activeToastVariant: ToastVariant | null = null;
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

  constructor(private readonly options: SupportPromptToastControllerOptions) {}

  destroy(): void {
    this.dismissToast(true);
  }

  showLikeToast(messages: SupportPromptMessages, variant: LikeToastVariant): void {
    const toast = this.createBaseToast('like');
    toast.dataset.variant = variant;

    const messageLine = this.options.doc.createElement('div');
    messageLine.dataset.role = 'like-toast-message';
    messageLine.className = 'm-0 text-[13px] font-semibold';
    messageLine.textContent = messages.likeThankYou;
    toast.appendChild(messageLine);

    if (variant !== 'acknowledged') {
      const links = this.options.doc.createElement('div');
      links.className = 'mt-2 flex flex-col gap-1.5';

      if (variant === 'returning') {
        const acknowledgedLink = this.options.doc.createElement('button');
        acknowledgedLink.type = 'button';
        acknowledgedLink.dataset.role = 'review-acknowledged-btn';
        acknowledgedLink.className = 'text-[12px] underline text-left';
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
      reviewLink.className = 'text-[12px] underline text-left';
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

    const title = this.options.doc.createElement('div');
    title.dataset.role = 'dislike-toast-title';
    title.className = 'm-0 text-[13px] font-semibold';
    title.textContent = messages.dislikeToastTitle;
    toast.appendChild(title);

    const links = this.options.doc.createElement('div');
    links.className = 'mt-2 flex flex-col gap-1.5';

    const redditLink = this.options.doc.createElement('a');
    redditLink.dataset.role = 'reddit-link';
    redditLink.className = 'text-[12px] underline';
    redditLink.href = 'https://www.reddit.com/r/ObsidianMD/comments/1oahhds/i_made_a_browser_extension_for_a_better/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button';
    redditLink.target = '_blank';
    redditLink.rel = 'noopener noreferrer';
    redditLink.textContent = messages.dislikeRedditLinkLabel;
    redditLink.addEventListener('click', () => {
      this.options.onDislikeRedditClick();
    });
    links.appendChild(redditLink);

    const qrLink = this.options.doc.createElement('button');
    qrLink.type = 'button';
    qrLink.dataset.role = 'qr-toggle-btn';
    qrLink.className = 'text-[12px] underline text-left';
    qrLink.textContent = messages.dislikeQrLinkLabel;

    const qrContainer = this.options.doc.createElement('div');
    qrContainer.dataset.role = 'qr-container';
    qrContainer.className = 'mt-2 rounded-[10px] bg-[rgba(42,46,74,0.65)] p-[10px] text-center';
    qrContainer.hidden = true;

    const qrPlaceholder = this.options.doc.createElement('div');
    qrPlaceholder.dataset.role = 'qr-placeholder';
    qrPlaceholder.className = 'text-[11px] text-[rgba(200,205,255,0.7)]';
    qrPlaceholder.textContent = messages.dislikeQrPlaceholder ?? '二维码即将提供';
    qrContainer.appendChild(qrPlaceholder);

    qrLink.addEventListener('click', (event) => {
      event.preventDefault();
      qrContainer.hidden = !qrContainer.hidden;
      this.options.onDislikeQrClick();
    });

    links.appendChild(qrLink);
    toast.append(links, qrContainer);

    this.showToast(toast, 'dislike');
    this.options.onDislikeToastShown();
  }

  private createBaseToast(kind: 'like' | 'dislike'): HTMLDivElement {
    this.dismissToast(true);
    const host = this.options.doc.createElement('div');
    host.id = 'aiob-support-toast-host';
    const shadow = host.attachShadow({ mode: 'open' });
    panelStyleSheetManager.initialize();
    panelStyleSheetManager.applyReaderStyles(shadow);

    const toast = this.options.doc.createElement('div');
    toast.id = 'aiob-support-toast';
    toast.dataset.kind = kind;
    toast.className = 'fixed right-6 bottom-6 z-[2147483647] min-w-[220px] max-w-[260px] rounded-[14px] p-[14px_16px] bg-[#171b30]/95 border border-[#7c5cff]/35 shadow-[0_10px_28px_rgba(17,22,45,0.45)] text-[#eef0ff] font-sans opacity-0 pointer-events-none translate-y-2 transition-all duration-200 ease-out backdrop-blur-[14px]';
    shadow.appendChild(toast);
    this.activeHost = host;
    return toast;
  }

  private showToast(toast: HTMLDivElement, variant: ToastVariant): void {
    if (!this.activeHost) {
      return;
    }
    this.options.doc.body.appendChild(this.activeHost);
    this.activeToast = toast;
    this.activeToastVariant = variant;

    requestAnimationFrame(() => {
      toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
      toast.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
    });

    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => this.dismissToast(), TOAST_AUTO_DISMISS_MS);
    this.options.doc.addEventListener('pointerdown', this.handleToastPointerDown, true);
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
    toast.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
    toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
  }
}
