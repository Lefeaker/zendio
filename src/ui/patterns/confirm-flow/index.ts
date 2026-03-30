import { getOptionsI18nBinder } from '../../../options/app/i18nContext';
import {
  bindLocalizedText,
  unbindLocalizedContent,
  type BoundElement,
  type LocalizedContent
} from '../../../options/utils/localizedText';
import { createOptionsButtonElement } from '../../primitives/button';
import { createOptionsActionRow, createOptionsPanel } from '../../primitives/layout';
import { FocusTrapController } from '../../foundation/a11y';

type DialogText = string | LocalizedContent;

export interface ConfirmDialogOptions {
  title: DialogText;
  message: DialogText;
  confirmLabel: DialogText;
  cancelLabel?: DialogText;
  tone?: 'primary' | 'danger';
  focusCancel?: boolean;
}

export function showOptionsConfirmFlow(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const boundElements: BoundElement<HTMLElement>[] = [];
    const binder = getOptionsI18nBinder();

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

    boundElements.push(bindLocalizedText(title, options.title, binder));
    boundElements.push(bindLocalizedText(message, options.message, binder));
    boundElements.push(bindLocalizedText(confirmButton, options.confirmLabel, binder));
    if (cancelButton && options.cancelLabel) {
      boundElements.push(bindLocalizedText(cancelButton, options.cancelLabel, binder));
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
      boundElements.forEach(unbindLocalizedContent);
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
