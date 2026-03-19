import { icons } from 'lucide';
import { BaseComponent } from './BaseComponent';
import { createIcon } from '@shared/utils/iconHelpers';

export type BadgeVariant = 'default' | 'primary' | 'secondary' | 'accent' | 'ghost';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  iconName?: keyof typeof icons;
}

const BADGE_VARIANT_CLASS: Record<BadgeVariant, string> = {
  default: '',
  primary: 'badge-primary',
  secondary: 'badge-secondary',
  accent: 'badge-accent',
  ghost: 'badge-ghost'
};

const BADGE_SIZE_CLASS: Record<BadgeSize, string> = {
  sm: 'badge-sm',
  md: '',
  lg: 'badge-lg'
};

/**
 * Lightweight wrapper for DaisyUI badge with optional icon prefix.
 */
export class DaisyBadge extends BaseComponent<BadgeProps> {
  render(props: BadgeProps): HTMLSpanElement {
    this.assertActive();

    const badge = this.createElement('span');
    badge.className = this.composeClassNames(props);

    if (props.iconName) {
      const iconNode = icons[props.iconName];
      if (iconNode) {
        const iconEl = createIcon(iconNode, { size: 12, className: 'inline-block' });
        const iconWrapper = this.createElement('span', 'inline-flex items-center');
        iconWrapper.setAttribute('aria-hidden', 'true');
        iconWrapper.append(iconEl);
        badge.append(iconWrapper);
      }
    }

    badge.append(document.createTextNode(props.label));
    this.container.replaceChildren(badge);
    return badge;
  }

  private composeClassNames(props: BadgeProps): string {
    const variantClass = BADGE_VARIANT_CLASS[props.variant ?? 'default'];
    const sizeClass = BADGE_SIZE_CLASS[props.size ?? 'md'];
    return ['badge', variantClass, sizeClass, 'gap-1'].filter(Boolean).join(' ').trim();
  }
}
