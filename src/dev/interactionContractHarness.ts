import {
  el,
  renderRuntimeSurface,
  surfaceComponents,
  type RuntimeRendererContext,
  type RuntimeSchemaContext,
  type RuntimeViewSchema
} from '../ui/stitch-runtime';
import { buttonNode, div, element } from '../ui/stitch-surfaces/builders/primitives';
import { applyValidationA11y } from '../ui/foundation/a11y';
import { createPrimitiveButtonElement } from '../ui/primitives/button';
import { createCheckboxElement } from '../ui/primitives/checkbox';
import { createInputElement } from '../ui/primitives/input';
import { createSelectElement } from '../ui/primitives/select';

type HarnessContext = RuntimeSchemaContext<Record<string, never>, { previewTheme: 'dark' }>;

let activeDialog: HTMLElement | null = null;
let runtimeContext: RuntimeRendererContext<HarnessContext>;

function createOptionsContractPanel(): HTMLElement {
  const view: RuntimeViewSchema<HarnessContext> = {
    id: 'options-interaction-contract',
    kind: 'standalone-page',
    className: 'grid gap-4 rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm',
    children: [
      element<HarnessContext>('h2', {
        className: 'm-0 text-lg font-semibold text-base-content',
        text: 'Options shared controls'
      }),
      element<HarnessContext>('p', {
        className: 'm-0 text-sm text-base-content/60',
        text: 'Neutral runtime buttons and fields preserve the shared interaction contract.'
      }),
      div<HarnessContext>('flex flex-wrap items-start gap-3', [
        buttonNode<HarnessContext>('Primary', 'primary', undefined, false, {
          contractRole: 'primary-button'
        })
      ]),
      element<HarnessContext>(
        'div',
        {
          className: 'grid gap-3 md:grid-cols-3',
          dataset: { contractRole: 'field-grid' }
        },
        [
          {
            kind: 'textarea',
            value: 'textarea content',
            className: 'textarea',
            dataset: { contractRole: 'textarea' }
          }
        ]
      )
    ]
  };
  const panel = renderRuntimeSurface(view, runtimeContext);
  const buttonRow = panel.querySelector('[data-contract-role="primary-button"]')?.parentElement;
  buttonRow?.append(
    createPrimitiveButtonElement({
      label: 'Saving destructive change',
      variant: 'danger',
      loading: true,
      dataAttributes: { contractRole: 'loading-danger-button' }
    })
  );

  const fieldGrid = panel.querySelector('[data-contract-role="field-grid"]');
  const inputError = document.createElement('p');
  inputError.id = 'contract-input-error';
  inputError.textContent = 'A value is required.';
  const input = createInputElement({
    value: '',
    ariaLabel: 'Required contract value',
    validationState: 'error',
    ariaDescribedBy: inputError.id,
    dataAttributes: { contractRole: 'validated-input' },
    onChange(value, event) {
      const target = event.target as HTMLInputElement;
      const invalid = value.trim().length === 0;
      applyValidationA11y(target, invalid ? 'error' : 'default', inputError.id);
      target.classList.toggle('input-error', invalid);
    }
  });

  const checkboxError = document.createElement('p');
  checkboxError.id = 'contract-checkbox-error';
  checkboxError.textContent = 'Confirmation is required.';
  const checkbox = createCheckboxElement({
    label: 'Require confirmation',
    ariaLabel: 'Require confirmation',
    validationState: 'error',
    ariaDescribedBy: checkboxError.id,
    dataAttributes: { contractRole: 'validated-checkbox' },
    onChange(checked, event) {
      const target = event.target as HTMLInputElement;
      applyValidationA11y(target, checked ? 'default' : 'error', checkboxError.id);
      target.classList.toggle('checkbox-error', !checked);
      target.classList.toggle('checkbox-accent', checked);
    }
  });

  fieldGrid?.append(
    input,
    inputError,
    checkbox.root,
    checkboxError,
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
  return panel;
}

function createContentContractPanel(): HTMLElement {
  const view: RuntimeViewSchema<HarnessContext> = {
    id: 'content-interaction-contract',
    kind: 'standalone-page',
    className: 'grid gap-4 rounded-xl border border-base-300 bg-base-100 p-5',
    children: [
      element<HarnessContext>('h2', {
        className: 'm-0 text-lg font-semibold text-base-content',
        text: 'Content dialog contract'
      }),
      element<HarnessContext>('p', {
        className: 'm-0 text-sm text-base-content/60',
        text: 'The neutral surface renderer owns dialog semantics and dismissal.'
      }),
      div<HarnessContext>('flex justify-start', [
        buttonNode<HarnessContext>('Open dialog', 'ghost', 'contract:open-dialog')
      ])
    ]
  };
  return renderRuntimeSurface(view, runtimeContext);
}

function openContractDialog(): void {
  closeContractDialog();
  const view: RuntimeViewSchema<HarnessContext> = {
    id: 'interaction-contract-dialog',
    kind: 'modal',
    title: 'Contract dialog',
    description: 'Shared runtime dialog semantics remain visible in the dev harness.',
    size: 'medium',
    children: [
      div<HarnessContext>('grid gap-3', [
        element<HarnessContext>('p', {
          text: 'Dialog body is rendered by the accepted neutral runtime.'
        }),
        div<HarnessContext>('flex justify-end', [
          buttonNode<HarnessContext>('Dismiss', 'danger', 'contract:dismiss-dialog')
        ])
      ])
    ]
  };
  activeDialog = renderRuntimeSurface(view, runtimeContext);
  document.body.append(activeDialog);
}

function closeContractDialog(): void {
  activeDialog?.remove();
  activeDialog = null;
}

async function mount(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) {
    return;
  }

  runtimeContext = {
    appData: {},
    state: { previewTheme: 'dark' },
    el,
    ui: surfaceComponents,
    dispatch(id) {
      if (id === 'contract:open-dialog') {
        openContractDialog();
        return;
      }
      if (id === 'contract:dismiss-dialog' || id === 'resource:close') {
        closeContractDialog();
      }
    }
  };

  document.documentElement.classList.add('aobx-preview');
  app.replaceChildren(createOptionsContractPanel(), createContentContractPanel());
}

void mount();
