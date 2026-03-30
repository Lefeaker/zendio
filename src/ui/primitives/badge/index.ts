import type { UiIconName } from '../../foundation/icons';
import { createUiIconByName } from '../../foundation/icons';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'ghost'
  | 'info'
  | 'neutral';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface PrimitiveBadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  iconName?: UiIconName;
  dataRole?: string;
}

const BADGE_VARIANT_CLASS: Record<BadgeVariant, string> = {
  default: '',
  primary: 'badge-primary',
  secondary: 'badge-secondary',
  accent: 'badge-accent',
  ghost: 'badge-ghost',
  info: 'badge-info',
  neutral: 'badge-neutral'
};

const BADGE_SIZE_CLASS: Record<BadgeSize, string> = {
  sm: 'badge-sm',
  md: '',
  lg: 'badge-lg'
};

export function createBadgeElement(props: PrimitiveBadgeProps): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = [
    'badge',
    BADGE_VARIANT_CLASS[props.variant ?? 'default'],
    BADGE_SIZE_CLASS[props.size ?? 'md'],
    'gap-1'
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (props.dataRole) {
    badge.dataset.role = props.dataRole;
  }

  if (props.iconName) {
    const icon = createUiIconByName(props.iconName, { size: 12, className: 'inline-block' });
    if (icon) {
      const wrapper = document.createElement('span');
      wrapper.className = 'inline-flex items-center';
      wrapper.setAttribute('aria-hidden', 'true');
      wrapper.append(icon);
      badge.append(wrapper);
    }
  }

  badge.append(document.createTextNode(props.label));
  return badge;
}

export class UiBadge {
  constructor(private readonly host: HTMLElement) {}

  render(props: PrimitiveBadgeProps): HTMLSpanElement {
    const badge = createBadgeElement(props);
    this.host.replaceChildren(badge);
    return badge;
  }
}
