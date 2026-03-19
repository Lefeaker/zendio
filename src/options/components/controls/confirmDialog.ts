import { getOptionsI18nBinder } from '../../app/i18nContext';
import { bindLocalizedText, unbindLocalizedContent, type BoundElement, type LocalizedContent } from '../../utils/localizedText';
import { createButton } from '../shared/DaisyUIHelpers';

type DialogText = string | LocalizedContent;

export interface ConfirmDialogOptions {
  title: DialogText;
  message: DialogText;
  confirmLabel: DialogText;
  cancelLabel?: DialogText;
  tone?: 'primary' | 'danger';
  focusCancel?: boolean;
}

export function showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise(resolve => {
    const boundElements: BoundElement<HTMLElement>[] = [];
    const binder = getOptionsI18nBinder();

    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';

    const dialog = document.createElement('div');
    dialog.className = [
      'bg-base-200',
      'rounded-lg',
      'border',
      'border-base-300',
      'shadow-card',
      'p-6',
      'max-w-md',
      'w-full',
      'mx-4'
    ].join(' ');
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

    const actions = document.createElement('div');
    actions.className = 'flex gap-2 justify-end';

    // ✅ Phase 1B: 使用 createButton 工厂函数（支持 danger 变体和 className）
    const confirmButton = createButton('', {
      variant: options.tone === 'danger' ? 'danger' : 'primary',
      className: 'btn-adaptive'
    });

    let cancelButton: HTMLButtonElement | null = null;
    if (options.cancelLabel) {
      // ✅ Phase 1B: 使用 createButton 工厂函数
      cancelButton = createButton('', {
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

    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const cleanup = () => {
      boundElements.forEach(unbindLocalizedContent);
      dialog.removeEventListener('keydown', handleKeyDown, true);
      backdrop.removeEventListener('click', handleBackdropClick);
      if (backdrop.parentElement) {
        backdrop.parentElement.removeChild(backdrop);
      }
      if (previousActive) {
        previousActive.focus();
      }
    };

    const resolveAndCleanup = (value: boolean) => {
      cleanup();
      resolve(value);
    };

    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const trapFocus = (event: KeyboardEvent) => {
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelectors)).filter(el => !el.hasAttribute('disabled'));
      if (focusable.length === 0) {
        return;
      }
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      let nextIndex = currentIndex;
      if (event.shiftKey) {
        nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
      } else {
        nextIndex = currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
      }
      focusable[nextIndex].focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        trapFocus(event);
        return;
      }
      if (event.key === 'Escape') {
        if (cancelButton) {
          event.preventDefault();
          resolveAndCleanup(false);
        }
      }
    };

    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target === backdrop && cancelButton) {
        resolveAndCleanup(false);
      }
    };

    dialog.addEventListener('keydown', handleKeyDown, true);
    backdrop.addEventListener('click', handleBackdropClick);

    confirmButton.addEventListener('click', () => resolveAndCleanup(true));
    if (cancelButton) {
      cancelButton.addEventListener('click', () => resolveAndCleanup(false));
    }

    const initialFocusTarget = options.focusCancel && cancelButton ? cancelButton : confirmButton;
    queueMicrotask(() => initialFocusTarget.focus());
  });
}
