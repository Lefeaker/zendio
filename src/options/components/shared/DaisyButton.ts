import { icons } from 'lucide';
import type { IconNode } from 'lucide';
import { BaseComponent } from './BaseComponent';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'error';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconName?: keyof typeof icons;
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: (event: MouseEvent) => void;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  error: 'btn-error'
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg'
};

/**
 * DaisyUI button wrapper with Lucide icon support and accessibility hooks.
 */
export class DaisyButton extends BaseComponent<ButtonProps> {
  render(props: ButtonProps): HTMLButtonElement {
    this.assertActive();

    const button = this.createElement('button');
    button.type = 'button';
    button.className = this.composeClassNames(props);

    if (props.ariaLabel) {
      button.setAttribute('aria-label', props.ariaLabel);
    }

    if (props.disabled) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
    }

    this.injectIcon(button, props.iconName);
    button.append(document.createTextNode(props.label));

    if (props.onClick) {
      button.addEventListener('click', props.onClick);
    }

    this.container.replaceChildren(button);
    return button;
  }

  private composeClassNames(props: ButtonProps): string {
    const variant = props.variant ?? 'primary';
    const size = props.size ?? 'md';
    const classes = ['btn', VARIANT_CLASS[variant], SIZE_CLASS[size], 'gap-2'];
    return classes.filter(Boolean).join(' ').trim();
  }

  private injectIcon(target: HTMLElement, iconName?: keyof typeof icons): void {
    if (!iconName) {
      return;
    }

    const iconNode = icons[iconName];
    if (!iconNode) {
      return;
    }

    const iconWrapper = this.createElement('span', 'inline-flex items-center');
    iconWrapper.setAttribute('aria-hidden', 'true');
    const svg = this.createIconElement(iconNode);
    iconWrapper.append(svg);
    target.append(iconWrapper);
  }

  private createIconElement(node: IconNode): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.classList.add('inline-block');

    for (const [tag, attributes] of node) {
      const child = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attributes)) {
        child.setAttribute(key, String(value));
      }
      svg.append(child);
    }

    return svg;
  }
}
