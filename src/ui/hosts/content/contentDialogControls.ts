import type { BadgeVariant } from '../../primitives/badge';
import { createBadgeElement } from '../../primitives/badge';
import type { ButtonSize, ButtonVariant } from '../../primitives/button';
import { UiButton } from '../../primitives/button';
import { createContentActionRow, createContentLayoutElement } from '../../primitives/layout';

export interface ContentDialogAction {
  label: string;
  variant: ButtonVariant;
  dataRole?: string;
  size?: ButtonSize;
  onClick: (event: MouseEvent) => void;
}

export interface ContentDialogFooterControlsOptions {
  counterText: string;
  actions: ContentDialogAction[];
  badgeVariant?: BadgeVariant;
  footerClassName?: string;
  actionsClassName?: string;
}

export interface ContentDialogFooterControls {
  footer: HTMLDivElement;
  counterBadge: HTMLSpanElement;
}

export function createContentDialogFooterControls(
  options: ContentDialogFooterControlsOptions
): ContentDialogFooterControls {
  const footer = createContentActionRow({
    className: options.footerClassName ?? 'flex items-center justify-between gap-4'
  });
  const badgeHost = createContentLayoutElement();
  const counterBadge = createBadgeElement({
    label: options.counterText,
    variant: options.badgeVariant ?? 'info',
    dataRole: 'badge'
  });
  badgeHost.append(counterBadge);

  const actions = createContentActionRow({
    className: options.actionsClassName
  });
  for (const action of options.actions) {
    new UiButton(actions).render({
      label: action.label,
      variant: action.variant,
      ...(action.size ? { size: action.size } : {}),
      ...(action.dataRole ? { dataRole: action.dataRole } : {}),
      onClick: action.onClick
    });
  }

  footer.append(badgeHost, actions);
  return { footer, counterBadge };
}
