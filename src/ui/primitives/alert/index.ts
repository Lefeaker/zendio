import type { UiIconName } from '../../foundation/icons';
import { createUiIconByName } from '../../foundation/icons';

export type AlertType = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  type: AlertType;
  message: string;
  description?: string;
  iconName?: UiIconName;
  dismissible?: boolean;
  onDismiss?: () => void;
}

const ALERT_TYPE_CLASS: Record<AlertType, string> = {
  info: 'alert-info',
  success: 'alert-success',
  warning: 'alert-warning',
  error: 'alert-error'
};

const DEFAULT_ICON: Record<AlertType, UiIconName> = {
  info: 'Info',
  success: 'CheckCircle',
  warning: 'AlertTriangle',
  error: 'XCircle'
};

export function createAlertElement(props: AlertProps): HTMLDivElement {
  const alert = document.createElement('div');
  alert.className = ['alert', ALERT_TYPE_CLASS[props.type]].join(' ');

  const icon = createUiIconByName(props.iconName ?? DEFAULT_ICON[props.type], { size: 20 });
  if (icon) {
    const wrapper = document.createElement('span');
    wrapper.className = 'inline-flex items-center';
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.append(icon);
    alert.append(wrapper);
  }

  const content = document.createElement('div');
  content.className = 'flex flex-col gap-1';
  const message = document.createElement('span');
  message.className = 'font-medium';
  message.textContent = props.message;
  content.append(message);
  if (props.description) {
    const description = document.createElement('span');
    description.className = 'text-sm opacity-80';
    description.textContent = props.description;
    content.append(description);
  }
  alert.append(content);

  if (props.dismissible) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-ghost btn-circle';
    const closeIcon = createUiIconByName('X', { size: 16 });
    if (closeIcon) {
      button.append(closeIcon);
    } else {
      button.textContent = '×';
    }
    button.addEventListener('click', () => {
      props.onDismiss?.();
      alert.remove();
    });
    alert.append(button);
  }

  return alert;
}

export class UiAlert {
  constructor(private readonly host: HTMLElement) {}

  render(props: AlertProps): HTMLDivElement {
    const alert = createAlertElement(props);
    this.host.replaceChildren(alert);
    return alert;
  }
}
