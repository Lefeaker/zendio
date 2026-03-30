import { createOptionsButtonElement } from '../ui/primitives/button';
import { createCheckboxElement } from '../ui/primitives/checkbox';
import { createInputElement } from '../ui/primitives/input';
import {
  createOptionsActionRow,
  createOptionsHintText,
  createOptionsPanel,
  createContentActionRow,
  createContentHintText,
  createLayoutElement,
  createContentSurfacePanel
} from '../ui/primitives/layout';
import { createSelectElement } from '../ui/primitives/select';
import { createTextareaElement } from '../ui/primitives/textarea';
import { UiButton } from '../ui/primitives/button';
import { ContentDialogHost } from '../ui/hosts/content';

function createOptionsContractPanel(): HTMLElement {
  const panel = createOptionsPanel({
    className: 'grid gap-4 rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm'
  });

  const title = document.createElement('h2');
  title.className = 'm-0 text-lg font-semibold text-base-content';
  title.textContent = 'Options shared controls';

  const row = createOptionsActionRow({
    className: 'flex flex-wrap items-start gap-3'
  });
  row.append(
    createOptionsButtonElement({
      label: 'Primary',
      variant: 'primary',
      dataAttributes: { contractRole: 'primary-button' }
    }),
    createOptionsButtonElement({
      label: 'Danger',
      variant: 'danger',
      loading: true,
      dataAttributes: { contractRole: 'danger-loading-button' }
    })
  );

  const fieldGrid = document.createElement('div');
  fieldGrid.className = 'grid gap-3 md:grid-cols-2';
  fieldGrid.append(
    createInputElement({
      value: 'invalid value',
      validationState: 'error',
      ariaDescribedBy: 'input-error',
      dataAttributes: { contractRole: 'error-input' }
    }),
    createSelectElement({
      value: 'b',
      validationState: 'error',
      ariaDescribedBy: 'select-error',
      dataAttributes: { contractRole: 'error-select' },
      options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' }
      ]
    })
  );

  const textarea = createTextareaElement({
    value: 'textarea content',
    rows: 4,
    dataAttributes: { contractRole: 'textarea' }
  });

  const checkbox = createCheckboxElement({
    label: 'Require confirmation',
    validationState: 'error',
    dataAttributes: { contractRole: 'error-checkbox' }
  }).root;

  panel.append(
    title,
    createOptionsHintText({
      text: 'The error input/select/checkbox should expose aria-invalid and the danger button should expose aria-busy.'
    }),
    row,
    fieldGrid,
    textarea,
    checkbox
  );
  return panel;
}

function createContentContractPanel(): HTMLElement {
  const panel = createContentSurfacePanel({
    className: 'grid gap-4 rounded-xl border border-base-300 bg-base-100 p-5'
  });
  const title = document.createElement('h2');
  title.className = 'm-0 text-lg font-semibold text-base-content';
  title.textContent = 'Content dialog contract';

  const actions = createContentActionRow();
  const dialog = new ContentDialogHost({
    title: 'Contract dialog',
    closeOnBackdrop: true
  });

  new UiButton(actions).render({
    label: 'Open dialog',
    variant: 'outline',
    dataRole: 'open-dialog',
    onClick: () => {
      const body = createContentSurfacePanel({
        className: 'grid gap-3 rounded-xl border border-base-300 bg-base-100/70 p-4'
      });
      body.append(
        createLayoutElement({
          tag: 'p',
          textContent: 'Dialog body should expose header/body/footer markers and aria-labelledby.'
        }),
        createContentHintText({
          textContent: 'Close with button or backdrop to validate dismissal.'
        })
      );
      const footer = createContentActionRow({ className: 'flex justify-end gap-2' });
      new UiButton(footer).render({
        label: 'Dismiss',
        variant: 'danger',
        dataRole: 'dismiss-dialog',
        onClick: () => dialog.hide()
      });
      dialog.setContent(body);
      dialog.setFooter(footer);
      dialog.show();
    }
  });

  panel.append(
    title,
    createContentHintText({
      textContent:
        'The built dialog should expose role="dialog", aria-modal, and data-element markers.'
    }),
    actions,
    dialog.render()
  );

  return panel;
}

function mount(): void {
  const app = document.getElementById('app');
  if (!app) {
    return;
  }

  document.documentElement.classList.add('aobx-preview');
  app.replaceChildren(createOptionsContractPanel(), createContentContractPanel());
}

mount();
