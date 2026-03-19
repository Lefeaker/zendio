import { ContentDaisyBadge } from '../../shared/daisy/ContentDaisyBadge';
import { ContentDaisyButton } from '../../shared/daisy/ContentDaisyButton';
import { ContentDaisyDialog } from '../../shared/daisy/ContentDaisyDialog';
import type { SupportPromptViewConfig } from './types';

const STATUS_BADGE_VARIANT: Record<SupportPromptViewConfig['status'], 'info' | 'neutral'> = {
  success: 'info',
  warning: 'neutral',
  failure: 'neutral'
};

export class SupportPromptView {
  private readonly dialog: ContentDaisyDialog;

  constructor(private readonly config: SupportPromptViewConfig) {
    this.dialog = new ContentDaisyDialog({
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
    const container = document.createElement('div');
    container.className = 'space-y-4';

    const linkGrid = document.createElement('div');
    linkGrid.className = 'grid grid-cols-1 gap-2';

    this.config.links.forEach((link) => {
      const anchor = document.createElement('a');
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.dataset.role = 'support-link';
      anchor.dataset.url = link.url;
      anchor.className = 'rounded-xl border border-base-300 bg-base-200/50 px-4 py-3 no-underline transition hover:bg-base-200';
      anchor.addEventListener('click', () => this.config.onLinkClick?.(link.url));

      const titleRow = document.createElement('div');
      titleRow.className = 'flex items-center gap-2';
      const title = document.createElement('span');
      title.className = 'text-sm font-semibold text-base-content';
      title.textContent = link.title;
      titleRow.append(title);

      if (link.description) {
        const desc = document.createElement('p');
        desc.className = 'mt-1 text-xs text-base-content/70';
        desc.textContent = link.description;
        anchor.append(titleRow, desc);
      } else {
        anchor.append(titleRow);
      }

      linkGrid.append(anchor);
    });

    const feedbackCard = document.createElement('section');
    feedbackCard.className = 'rounded-xl border border-base-300 bg-base-100/70 p-4 space-y-3';

    const label = document.createElement('p');
    label.className = 'text-sm font-medium text-base-content/80';
    label.textContent = this.config.messages.feedbackGroupLabel;

    const actions = document.createElement('div');
    actions.className = 'flex gap-2';
    new ContentDaisyButton(actions).render({
      label: this.config.messages.likeLabel,
      variant: 'primary',
      size: 'sm',
      dataRole: 'like-btn',
      onClick: this.config.onLike
    });
    new ContentDaisyButton(actions).render({
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
    const footer = document.createElement('div');
    footer.className = 'flex items-start justify-between gap-3 w-full';

    const left = document.createElement('div');
    left.className = 'space-y-2';

    const badgeHost = document.createElement('div');
    new ContentDaisyBadge(badgeHost).render({
      label: this.config.status,
      variant: STATUS_BADGE_VARIANT[this.config.status],
      dataRole: 'status-badge'
    });

    const statusText = document.createElement('div');
    statusText.dataset.role = 'status-text';
    statusText.className = 'text-xs text-base-content/80 space-y-1';
    statusText.textContent = this.config.statusMessage.text + (this.config.statusMessage.codeSuffix ?? '');
    if (this.config.statusMessage.extraLine) {
      const detail = document.createElement('div');
      detail.dataset.role = 'status-detail';
      detail.className = 'text-[11px] text-base-content/60';
      detail.textContent = this.config.statusMessage.extraLine;
      statusText.append(detail);
    }

    left.append(badgeHost, statusText);

    const dismiss = document.createElement('p');
    dismiss.dataset.role = 'dismiss-text';
    dismiss.className = 'text-[11px] text-base-content/50 text-right';
    dismiss.textContent = this.config.messages.dismiss;

    footer.append(left, dismiss);
    return footer;
  }
}
