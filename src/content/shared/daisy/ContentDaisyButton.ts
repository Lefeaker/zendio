import { Icons, createIcon } from '@shared/utils/iconHelpers';

export type ContentDaisyButtonVariant = 'primary' | 'secondary' | 'ghost' | 'error';
export type ContentDaisyButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ContentDaisyButtonProps {
  label: string;
  variant?: ContentDaisyButtonVariant;
  size?: ContentDaisyButtonSize;
  icon?: keyof typeof Icons;
  disabled?: boolean;
  ariaLabel?: string;
  dataRole?: string;
  onClick?: (event: MouseEvent) => void;
}

const VARIANT_CLASS: Record<ContentDaisyButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  error: 'btn-error'
};

const SIZE_CLASS: Record<ContentDaisyButtonSize, string> = {
  xs: 'btn-xs',
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg'
};

export class ContentDaisyButton {
  constructor(private readonly host: HTMLElement) {}

  render(props: ContentDaisyButtonProps): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = this.composeClass(props);
    button.textContent = props.label;

    if (props.dataRole) {
      button.dataset.role = props.dataRole;
    }

    if (props.ariaLabel) {
      button.setAttribute('aria-label', props.ariaLabel);
    }

    if (props.disabled) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
    }

    if (props.icon) {
      const iconNode = Icons[props.icon];
      if (iconNode) {
        const iconWrapper = document.createElement('span');
        iconWrapper.className = 'inline-flex items-center';
        iconWrapper.setAttribute('aria-hidden', 'true');
        iconWrapper.append(
          createIcon(iconNode, {
            size: 16,
            className: 'inline-block'
          })
        );
        button.prepend(iconWrapper);
      }
    }

    if (props.onClick) {
      button.addEventListener('click', props.onClick);
    }

    this.host.append(button);
    return button;
  }

  private composeClass(props: ContentDaisyButtonProps): string {
    const variant = props.variant ?? 'primary';
    const size = props.size ?? 'md';
    return ['btn', VARIANT_CLASS[variant], SIZE_CLASS[size], 'gap-2']
      .filter(Boolean)
      .join(' ');
  }
}
