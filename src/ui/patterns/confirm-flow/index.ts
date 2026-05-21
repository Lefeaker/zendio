import type { I18nBinder, Messages } from '@i18n';
import { createOptionsButtonElement } from '../../primitives/button';
import { createOptionsActionRow, createOptionsPanel } from '../../primitives/layout';
import { FocusTrapController } from '../../foundation/a11y';

export interface LocalizedContent {
  key: keyof Messages;
  fallback?: string;
  text?: string;
}

type DialogText = string | LocalizedContent;

export interface BoundElement<T extends HTMLElement> {
  element: T;
  dispose(): void;
}

interface ConfirmFlowLocalization {
  binder?: I18nBinder | null;
  bindText<T extends HTMLElement>(
    element: T,
    content: DialogText,
    binder?: I18nBinder | null
  ): BoundElement<T>;
  unbind(binding: BoundElement<HTMLElement> | null | undefined): void;
}

export interface ConfirmDialogOptions {
  title: DialogText;
  message: DialogText;
  confirmLabel: DialogText;
  cancelLabel?: DialogText;
  tone?: 'primary' | 'danger';
  focusCancel?: boolean;
  localization?: ConfirmFlowLocalization;
}

export function showOptionsConfirmFlow(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const boundElements: BoundElement<HTMLElement>[] = [];
    const localization = options.localization ?? {
      binder: null,
      bindText: bindPlainText,
      unbind: unbindPlainText
    };

    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';

    const dialog = createOptionsPanel({
      className: [
        'mx-4',
        'w-full',
        'max-w-md',
        'rounded-lg',
        'border',
        'border-base-300',
        'bg-base-200',
        'p-6',
        'shadow-card'
      ].join(' ')
    });
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const titleId = `options-modal-title-${Date.now()}`;
    const title = document.createElement('h3');
    title.id = titleId;
    title.className = 'text-lg font-semibold text-base-content mb-3';
    dialog.setAttribute('aria-labelledby', titleId);

    const message = document.createElement('p');
    message.className = 'text-sm text-base-content/60 leading-relaxed mb-6';
    const messageId = `options-modal-message-${Date.now()}`;
    message.id = messageId;
    dialog.setAttribute('aria-describedby', messageId);

    const actions = createOptionsActionRow({ className: 'flex gap-2 justify-end' });

    const confirmButton = createOptionsButtonElement({
      label: '',
      variant: options.tone === 'danger' ? 'danger' : 'primary',
      className: 'btn-adaptive'
    });

    let cancelButton: HTMLButtonElement | null = null;
    if (options.cancelLabel) {
      cancelButton = createOptionsButtonElement({
        label: '',
        variant: 'ghost',
        className: 'btn-adaptive'
      });
    }

    boundElements.push(localization.bindText(title, options.title, localization.binder));
    boundElements.push(localization.bindText(message, options.message, localization.binder));
    boundElements.push(
      localization.bindText(confirmButton, options.confirmLabel, localization.binder)
    );
    if (cancelButton && options.cancelLabel) {
      boundElements.push(
        localization.bindText(cancelButton, options.cancelLabel, localization.binder)
      );
    }

    actions.append(confirmButton);
    if (cancelButton) {
      actions.append(cancelButton);
    }

    dialog.append(title, message, actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    const previousActive =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTrap = new FocusTrapController(dialog, {
      initialFocus: () => (options.focusCancel && cancelButton ? cancelButton : confirmButton),
      fallbackFocus: dialog,
      escapeDeactivates: Boolean(cancelButton),
      clickOutsideDeactivates: Boolean(cancelButton)
    });
    focusTrap.activate();

    const cleanup = () => {
      boundElements.forEach((binding) => localization.unbind(binding));
      backdrop.removeEventListener('click', handleBackdropClick);
      focusTrap.deactivate();
      backdrop.remove();
      previousActive?.focus();
    };

    const resolveAndCleanup = (value: boolean) => {
      cleanup();
      resolve(value);
    };

    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target === backdrop && cancelButton) {
        resolveAndCleanup(false);
      }
    };

    backdrop.addEventListener('click', handleBackdropClick);
    confirmButton.addEventListener('click', () => resolveAndCleanup(true));
    cancelButton?.addEventListener('click', () => resolveAndCleanup(false));
  });
}

function resolveDialogText(content: DialogText): string {
  if (typeof content === 'string') {
    return content;
  }
  return content.text ?? content.fallback ?? content.key;
}

function bindPlainText<T extends HTMLElement>(element: T, content: DialogText): BoundElement<T> {
  element.textContent = resolveDialogText(content);
  return {
    element,
    dispose() {
      element.textContent = '';
    }
  };
}

function unbindPlainText(binding: BoundElement<HTMLElement> | null | undefined): void {
  binding?.dispose();
}
