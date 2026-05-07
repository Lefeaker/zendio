import { UiButton as DaisyButton } from '@ui/primitives/button';
import { DaisyTable } from '@ui/primitives/table';
import { createOptionsActionRow } from '@ui/primitives/layout';
import type { RestSectionMessagesLike } from './restSectionLayout';
import { buildRestDefaultRow } from './restSectionDefaultRow';

export interface RestDefaultVaultInputRefs {
  defaultNameInput: HTMLInputElement | null;
  defaultHttpsInput: HTMLInputElement | null;
  defaultHttpInput: HTMLInputElement | null;
  defaultApiKeyInput: HTMLInputElement | null;
}

export function buildRestVaultTable(args: {
  createElement: typeof document.createElement;
  messages: RestSectionMessagesLike | null;
  additionalRowsHost: HTMLElement;
  additionalEmptyHint: HTMLElement;
  updateDefaultVaultField: (
    field: 'name' | 'httpsUrl' | 'httpUrl' | 'apiKey',
    value: string
  ) => void;
}): RestDefaultVaultInputRefs & { tableHost: HTMLElement } {
  const {
    createElement,
    messages,
    additionalRowsHost,
    additionalEmptyHint,
    updateDefaultVaultField
  } = args;
  let defaultNameInput: HTMLInputElement | null = null;
  let defaultHttpsInput: HTMLInputElement | null = null;
  let defaultHttpInput: HTMLInputElement | null = null;
  let defaultApiKeyInput: HTMLInputElement | null = null;

  const tableHost = createElement('div');
  new DaisyTable(tableHost).render({
    minWidthClass: 'min-w-[900px]',
    header: buildRestVaultHeaderRow(createElement, messages),
    body: [
      buildRestDefaultRow({
        createElement,
        messages,
        onNameInput: (value) => updateDefaultVaultField('name', value),
        onHttpsInput: (value) => updateDefaultVaultField('httpsUrl', value),
        onHttpInput: (value) => updateDefaultVaultField('httpUrl', value),
        onApiKeyInput: (value) => updateDefaultVaultField('apiKey', value),
        bindDefaultNameInput: (input) => {
          defaultNameInput = input;
        },
        bindDefaultHttpsInput: (input) => {
          defaultHttpsInput = input;
        },
        bindDefaultHttpInput: (input) => {
          defaultHttpInput = input;
        },
        bindDefaultApiKeyInput: (input) => {
          defaultApiKeyInput = input;
        }
      }),
      additionalRowsHost,
      additionalEmptyHint
    ]
  });

  return {
    tableHost,
    defaultNameInput,
    defaultHttpsInput,
    defaultHttpInput,
    defaultApiKeyInput
  };
}

export function buildRestVaultControls(
  createElement: typeof document.createElement,
  messages: RestSectionMessagesLike | null,
  addVault: () => void
): HTMLElement {
  const controls = createOptionsActionRow();
  const addButtonHost = createElement('div');
  const addButton = new DaisyButton(addButtonHost).render({
    label: messages?.addVaultButton ?? '+ 添加仓库',
    variant: 'secondary',
    size: 'sm',
    iconName: 'Plus',
    onClick: addVault
  });
  addButton.id = 'addAdditionalVaultBtn';
  controls.append(addButtonHost);

  const testButtonHost = createElement('div');
  const testButton = new DaisyButton(testButtonHost).render({
    label: messages?.testConnectionButton ?? '⚡ 测试连接',
    variant: 'primary',
    size: 'sm',
    iconName: 'Activity'
  });
  testButton.id = 'testConnectionBtn';
  testButton.dataset.state = 'idle';
  controls.append(testButtonHost);

  return controls;
}

function buildRestVaultHeaderRow(
  createElement: typeof document.createElement,
  messages: RestSectionMessagesLike | null
): HTMLElement {
  const labels = [
    messages?.ruleEnabledLabel ?? '启用',
    messages?.vaultNameLabel ?? '仓库名称',
    messages?.httpsUrlLabel ?? 'HTTPS URL',
    messages?.httpUrlLabel ?? 'HTTP URL',
    messages?.apiKeyLabel ?? 'API Key',
    '操作'
  ];

  const headerRow = createElement('div');
  headerRow.className =
    'grid grid-cols-[60px_140px_minmax(150px,1fr)_minmax(150px,1fr)_160px_80px] gap-2 p-3 bg-base-200 border-b border-base-300 font-medium text-base-content/60';
  for (const label of labels) {
    const cell = document.createElement('span');
    cell.textContent = label;
    headerRow.append(cell);
  }
  return headerRow;
}
