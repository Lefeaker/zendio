import type { UiIconName } from '../../foundation/icons';
import { getUiIconNode, createUiIcon } from '../../foundation/icons';
import { applyButtonBusyState } from '../../foundation/a11y';
import type { ButtonSize, ButtonVariant, DataAttributes } from '../../foundation/types';

export type { ButtonSize, ButtonVariant } from '../../foundation/types';

export interface PrimitiveButtonProps {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconName?: UiIconName;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  id?: string;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
  loading?: boolean;
  dataAttributes?: DataAttributes;
  dataRole?: string;
  onClick?: (event: MouseEvent) => void;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  outline: 'btn-outline',
  danger: 'btn-error btn-danger',
  error: 'btn-error'
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  xs: 'btn-xs',
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg'
};

function composeClassNames(props: PrimitiveButtonProps): string {
  const variant = props.variant ?? 'primary';
  const size = props.size ?? 'md';
  return ['btn', VARIANT_CLASS[variant], SIZE_CLASS[size], 'gap-2', props.className ?? '']
    .filter(Boolean)
    .join(' ')
    .trim();
}

function injectIcon(target: HTMLButtonElement, iconName?: UiIconName): void {
  const iconNode = getUiIconNode(iconName);
  if (!iconNode) {
    return;
  }

  const iconWrapper = document.createElement('span');
  iconWrapper.className = 'inline-flex items-center';
  iconWrapper.setAttribute('aria-hidden', 'true');
  iconWrapper.append(createUiIcon(iconNode, { size: 16, className: 'inline-block' }));
  target.append(iconWrapper);
}

export function createPrimitiveButtonElement(props: PrimitiveButtonProps): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = props.type ?? 'button';
  button.className = composeClassNames(props);

  if (props.id) {
    button.id = props.id;
  }
  if (props.title) {
    button.title = props.title;
  }
  if (props.ariaLabel) {
    button.setAttribute('aria-label', props.ariaLabel);
  }
  if (props.dataRole) {
    button.dataset.role = props.dataRole;
  }
  if (props.dataAttributes) {
    for (const [key, value] of Object.entries(props.dataAttributes)) {
      button.dataset[key] = value;
    }
  }

  applyButtonBusyState(button, {
    ...(typeof props.disabled === 'boolean' ? { disabled: props.disabled } : {}),
    ...(typeof props.loading === 'boolean' ? { loading: props.loading } : {})
  });

  injectIcon(button, props.iconName);
  button.append(document.createTextNode(props.label));

  if (props.onClick) {
    button.addEventListener('click', props.onClick);
  }

  return button;
}

export function createOptionsButtonElement(props: PrimitiveButtonProps): HTMLButtonElement {
  return createPrimitiveButtonElement(props);
}

export function createContentButtonElement(props: PrimitiveButtonProps): HTMLButtonElement {
  return createPrimitiveButtonElement(props);
}

export class UiButton {
  constructor(private readonly host: HTMLElement) {}

  render(props: PrimitiveButtonProps): HTMLButtonElement {
    const button = createPrimitiveButtonElement(props);
    this.host.append(button);
    return button;
  }
}
