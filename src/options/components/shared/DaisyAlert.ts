import { icons } from 'lucide';
import { BaseComponent } from './BaseComponent';
import { createIcon } from '@shared/utils/iconHelpers';

export type AlertType = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  type: AlertType;
  message: string;
  description?: string;
  iconName?: keyof typeof icons;
  dismissible?: boolean;
  onDismiss?: () => void;
}

const ALERT_TYPE_CLASS: Record<AlertType, string> = {
  info: 'alert-info',
  success: 'alert-success',
  warning: 'alert-warning',
  error: 'alert-error'
};

const DEFAULT_ICON: Record<AlertType, keyof typeof icons> = {
  info: 'Info',
  success: 'CheckCircle',
  warning: 'AlertTriangle',
  error: 'XCircle'
};

/**
 * DaisyUI alert with default icon set and dismiss controls.
 */
export class DaisyAlert extends BaseComponent<AlertProps> {
  render(props: AlertProps): HTMLDivElement {
    this.assertActive();

    const alert = this.createElement('div', this.composeClassNames(props.type));
    this.injectIcon(alert, props.iconName ?? DEFAULT_ICON[props.type]);
    alert.append(this.createMessageBlock(props));

    if (props.dismissible) {
      alert.append(this.createDismissButton(alert, props.onDismiss));
    }

    this.container.replaceChildren(alert);
    return alert;
  }

  private composeClassNames(type: AlertType): string {
    return ['alert', ALERT_TYPE_CLASS[type]].join(' ');
  }

  private injectIcon(container: HTMLElement, iconName: keyof typeof icons): void {
    const iconNode = icons[iconName];
    if (!iconNode) {
      return;
    }
    const iconEl = createIcon(iconNode, { size: 20 });
    const iconWrapper = this.createElement('span', 'inline-flex items-center');
    iconWrapper.setAttribute('aria-hidden', 'true');
    iconWrapper.append(iconEl);
    container.append(iconWrapper);
  }

  private createMessageBlock(props: AlertProps): HTMLElement {
    const wrapper = this.createElement('div', 'flex flex-col gap-1');
    const message = this.createElement('span', 'font-medium');
    message.textContent = props.message;
    wrapper.append(message);

    if (props.description) {
      const description = this.createElement('span', 'text-sm opacity-80');
      description.textContent = props.description;
      wrapper.append(description);
    }

    return wrapper;
  }

  private createDismissButton(alert: HTMLElement, onDismiss?: () => void): HTMLButtonElement {
    const button = this.createElement('button', 'btn btn-sm btn-ghost btn-circle');
    button.type = 'button';
    const closeIcon = icons.X;
    if (closeIcon) {
      button.append(createIcon(closeIcon, { size: 16 }));
    } else {
      button.textContent = '×';
    }

    button.addEventListener('click', () => {
      onDismiss?.();
      alert.remove();
    });

    return button;
  }
}
