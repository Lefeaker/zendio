export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  focusCancel?: boolean;
}

export function showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'options-modal-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'options-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const titleId = `options-modal-title-${Date.now()}`;
    const title = document.createElement('h3');
    title.id = titleId;
    title.className = 'options-modal__title';
    title.textContent = options.title;
    dialog.setAttribute('aria-labelledby', titleId);

    const message = document.createElement('p');
    message.className = 'options-modal__message';
    message.textContent = options.message;

    const actions = document.createElement('div');
    actions.className = 'options-modal__actions';

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = options.tone === 'danger' ? 'btn-danger' : 'btn-primary';
    confirmButton.textContent = options.confirmLabel;

    let cancelButton: HTMLButtonElement | null = null;
    if (options.cancelLabel) {
      cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'btn-ghost';
      cancelButton.textContent = options.cancelLabel;
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
