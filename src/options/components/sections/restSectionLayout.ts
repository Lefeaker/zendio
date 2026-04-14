import { buildRestConnectionResult } from './restSectionConnectionResult';
import {
  buildRestVaultControls,
  buildRestVaultTable,
  type RestDefaultVaultInputRefs
} from './restSectionDefaultLayout';

export interface RestSectionMessagesLike {
  apiConfigTitle?: string;
  apiConfigHint?: string;
  additionalVaultsHint?: string;
  ruleEnabledLabel?: string;
  vaultNameLabel?: string;
  httpsUrlLabel?: string;
  httpUrlLabel?: string;
  apiKeyLabel?: string;
  defaultVaultBadge?: string;
  vaultNamePlaceholder?: string;
  addVaultButton?: string;
  testConnectionButton?: string;
  deleteVaultButton?: string;
}

export interface RestSectionLayoutRefs extends RestDefaultVaultInputRefs {
  additionalRowsHost: HTMLElement;
  additionalEmptyHint: HTMLElement;
  connectionResultHost: HTMLDivElement;
}

export { buildRestVaultRow, updateRestVaultRow } from './restSectionVaultRow';

export function buildRestSectionLayout(params: {
  createElement: typeof document.createElement;
  messages: RestSectionMessagesLike | null;
  updateDefaultVaultField: (
    field: 'name' | 'httpsUrl' | 'httpUrl' | 'apiKey',
    value: string
  ) => void;
  addVault: () => void;
}): RestSectionLayoutRefs & { body: HTMLElement } {
  const { createElement, messages, updateDefaultVaultField, addVault } = params;

  const body = createElement('div');
  body.className = 'space-y-4';

  const additionalRowsHost = createElement('div');
  additionalRowsHost.className = 'divide-y divide-border/50';
  const additionalEmptyHint = createElement('div');
  additionalEmptyHint.className = 'p-8 text-center text-base-content/60 italic';
  additionalEmptyHint.hidden = true;
  additionalEmptyHint.textContent =
    messages?.additionalVaultsHint ?? '添加更多仓库，通过路由规则自动分配内容';

  const table = buildRestVaultTable({
    createElement,
    messages,
    additionalRowsHost,
    additionalEmptyHint,
    updateDefaultVaultField
  });
  body.append(table.tableHost);
  body.append(buildRestVaultControls(createElement, messages, addVault));

  const connectionResultHost = createElement('div') as HTMLDivElement;
  connectionResultHost.className = 'space-y-3';
  connectionResultHost.id = 'connectionResult';
  connectionResultHost.hidden = true;
  connectionResultHost.setAttribute('aria-live', 'polite');
  body.append(buildRestConnectionResult(createElement, messages, connectionResultHost));

  const note = createElement('p');
  note.className = 'text-sm text-base-content/60';
  note.textContent =
    '提示：第一行是默认仓库，不符合路由规则的内容将保存到这里。测试连接会验证表格中所有已启用的仓库。';
  body.append(note);

  return {
    body,
    additionalRowsHost,
    additionalEmptyHint,
    connectionResultHost,
    defaultNameInput: table.defaultNameInput,
    defaultHttpsInput: table.defaultHttpsInput,
    defaultHttpInput: table.defaultHttpInput,
    defaultApiKeyInput: table.defaultApiKeyInput
  };
}
