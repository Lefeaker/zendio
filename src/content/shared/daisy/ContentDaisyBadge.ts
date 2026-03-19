export type ContentDaisyBadgeVariant = 'info' | 'neutral';

export interface ContentDaisyBadgeProps {
  label: string;
  variant?: ContentDaisyBadgeVariant;
  dataRole?: string;
}

export class ContentDaisyBadge {
  constructor(private readonly host: HTMLElement) {}

  render(props: ContentDaisyBadgeProps): HTMLSpanElement {
    const badge = document.createElement('span');
    badge.className = this.composeClass(props.variant ?? 'info');
    badge.textContent = props.label;
    if (props.dataRole) {
      badge.dataset.role = props.dataRole;
    }
    this.host.append(badge);
    return badge;
  }

  private composeClass(variant: ContentDaisyBadgeVariant): string {
    const base = 'badge text-xs font-medium';
    return variant === 'info' ? `${base} badge-info` : `${base} badge-neutral`;
  }
}
