import {
  el,
  renderRuntimeSurface,
  surfaceComponents,
  type RuntimeRendererContext,
  type RuntimeSchemaContext,
  type RuntimeViewSchema
} from '../ui/stitch-runtime';
import { buttonNode, div, element } from '../ui/stitch-surfaces/builders/primitives';
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
        }),
        buttonNode<HarnessContext>('Danger', 'danger', undefined, false, {
          contractRole: 'danger-button'
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
            kind: 'input',
            value: 'invalid value',
            className: 'input is-error',
            dataset: { contractRole: 'error-input' }
          },
          {
            kind: 'textarea',
            value: 'textarea content',
            className: 'textarea',
            dataset: { contractRole: 'textarea' }
          }
        ]
      ),
      element<HarnessContext>('label', { className: 'flex items-center gap-2' }, [
        element<HarnessContext>('input', {
          type: 'checkbox',
          ariaLabel: 'Require confirmation',
          dataset: { contractRole: 'confirmation-toggle' }
        }),
        element<HarnessContext>('span', { text: 'Require confirmation' })
      ])
    ]
  };
  const panel = renderRuntimeSurface(view, runtimeContext);
  panel.querySelector('[data-contract-role="field-grid"]')?.append(
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
