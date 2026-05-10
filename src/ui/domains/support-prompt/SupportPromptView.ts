import { createBadgeElement } from '../../primitives/badge';
import { UiButton } from '../../primitives/button';
import { ContentDialogHost } from '../../hosts/content/ContentDialogHost';
import {
  createContentActionRow,
  createContentHintText,
  createContentLayoutElement,
  createContentSurfacePanel
} from '../../primitives/layout';
import type { SupportPromptViewConfig } from './types';

const STATUS_BADGE_VARIANT: Record<SupportPromptViewConfig['status'], 'info' | 'neutral'> = {
  success: 'info',
  warning: 'neutral',
  failure: 'neutral',
  progress: 'info'
};

export class SupportPromptView {
  private readonly dialog: ContentDialogHost;

  constructor(private readonly config: SupportPromptViewConfig) {
    this.dialog = new ContentDialogHost({
      title: config.messages.title,
      size: 'md',
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: config.onClose
    });
  }

  render(): HTMLElement {
    this.dialog.setContent(this.buildContent());
    this.dialog.setFooter(this.buildFooter());
    return this.dialog.render();
  }

  show(): void {
    this.dialog.show();
  }

  hide(): void {
    this.dialog.hide();
  }

  destroy(): void {
    this.dialog.destroy();
  }

  private buildContent(): HTMLElement {
    const container = createContentLayoutElement({ className: 'space-y-4' });

    const linkGrid = createContentLayoutElement({ className: 'grid grid-cols-1 gap-2' });

    this.config.links.forEach((link) => {
      const anchor = createContentSurfacePanel({
        tag: 'a',
        className:
          'rounded-xl border border-base-300 bg-base-200/50 px-4 py-3 no-underline transition hover:bg-base-200'
      });
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.dataset.role = 'support-link';
      anchor.dataset.url = link.url;
      anchor.addEventListener('click', () => this.config.onLinkClick?.(link.url));

      const titleRow = createContentActionRow({
        className: 'flex items-center gap-2'
      });
      const title = createContentLayoutElement({
        tag: 'span',
        className: 'text-sm font-semibold text-base-content'
      });
      title.textContent = link.title;
      titleRow.append(title);

      if (link.description) {
        const desc = createContentHintText({
          className: 'mt-1 text-xs text-base-content/70',
          textContent: link.description
        });
        anchor.append(titleRow, desc);
      } else {
        anchor.append(titleRow);
      }

      linkGrid.append(anchor);
    });

    const feedbackCard = createContentSurfacePanel({
      tag: 'section',
      className: 'rounded-xl border border-base-300 bg-base-100/70 p-4 space-y-3'
    });

    const label = createContentHintText({
      className: 'text-sm font-medium text-base-content/80',
      textContent: this.config.messages.feedbackGroupLabel
    });

    const actions = createContentActionRow();
    new UiButton(actions).render({
      label: this.config.messages.likeLabel,
      variant: 'primary',
      size: 'sm',
      dataRole: 'like-btn',
      onClick: this.config.onLike
    });
    new UiButton(actions).render({
      label: this.config.messages.dislikeLabel,
      variant: 'ghost',
      size: 'sm',
      dataRole: 'dislike-btn',
      onClick: this.config.onDislike
    });

    feedbackCard.append(label, actions);

    container.append(linkGrid, feedbackCard);
    return container;
  }

  private buildFooter(): HTMLElement {
    const footer = createContentActionRow({
      className: 'flex w-full items-start justify-between gap-3'
    });

    const left = createContentLayoutElement({ className: 'space-y-2' });

    const badgeHost = createContentLayoutElement();
    const badge = createBadgeElement({
      label: this.config.status,
      variant: STATUS_BADGE_VARIANT[this.config.status],
      dataRole: 'status-badge'
    });

    const statusText = createContentLayoutElement({
      className: 'space-y-1 text-xs text-base-content/80',
      attributes: { 'data-role': 'status-text' }
    });
    statusText.textContent =
      this.config.statusMessage.text + (this.config.statusMessage.codeSuffix ?? '');
    if (this.config.statusMessage.extraLine) {
      const detail = createContentLayoutElement({
        className: 'text-[11px] text-base-content/60',
        attributes: { 'data-role': 'status-detail' },
        textContent: this.config.statusMessage.extraLine
      });
      statusText.append(detail);
    }

    badgeHost.append(badge);
    left.append(badgeHost, statusText);

    const dismiss = createContentHintText({
      className: 'text-right text-[11px] text-base-content/50',
      attributes: { 'data-role': 'dismiss-text' },
      textContent: this.config.messages.dismiss
    });

    footer.append(left, dismiss);
    return footer;
  }
}
