import type { Messages } from '../../i18n/locales';
import { getMessages, initI18n, formatMessage } from '../../i18n';
import { createElement, getElementById } from '../utils/dom';
import {
  addAdditionalVault,
  addRoutingRule,
  getVaultsSnapshot,
  removeAdditionalVault,
  removeRoutingRule,
  updateAdditionalVault,
  updateRoutingRule
} from '../state/vaultRouterStore';
import type { VaultConfig, RoutingRule, ConnectionTestResult } from '../../shared/types';
import { showConfirmDialog } from './confirmDialog';
import { isVaultConnectionTestRunning, requestVaultConnectionTest } from '../services/connectionTester';
import { collectOptionsFromForm } from './optionsForm';
import { getLastLoadedOptions, saveOptionsToStorage, setLastLoadedOptions } from '../state/optionsStore';
import { collectPortEntriesFromConfig, findDuplicatePorts } from '../utils/ports';

let autoSaveTimer: number | undefined;

function scheduleVaultRouterAutoSave(): void {
  if (typeof window !== 'undefined') {
    if (autoSaveTimer !== undefined) {
      window.clearTimeout(autoSaveTimer);
    }
    autoSaveTimer = window.setTimeout(() => {
      void persistVaultRouterOptions();
    }, 400);
  } else {
    void persistVaultRouterOptions();
  }
}

async function persistVaultRouterOptions(): Promise<void> {
  try {
    autoSaveTimer = undefined;
    if (typeof document === 'undefined' || !document.getElementById('restHttpsUrl')) {
      return;
    }

    const previous = getLastLoadedOptions();
    const options = collectOptionsFromForm(previous);
    await saveOptionsToStorage(options);
    setLastLoadedOptions(options);
  } catch (error) {
    console.error('[vaultRouter] Failed to auto-save vault router configuration:', error);
  }
}

export async function renderAdditionalVaults(): Promise<void> {
  const container = getElementById<HTMLDivElement>('additionalVaultsList');
  container.innerHTML = '';

  const vaults = getVaultsSnapshot();
  if (vaults.length === 0) {
    await initI18n();
    return;
  }

  const msgs = await getMessages();
  const fragment = document.createDocumentFragment();

  for (const vault of vaults) {
    fragment.appendChild(createVaultEntry(vault, msgs));
  }

  container.appendChild(fragment);
  await initI18n();
}

export async function handleAddAdditionalVault(): Promise<void> {
  addAdditionalVault();
  await renderAdditionalVaults();
  scheduleVaultRouterAutoSave();
}

function createVaultEntry(vault: VaultConfig, msgs: Messages): HTMLDivElement {
  const entry = createElement('div');
  entry.className = 'vault-entry';
  entry.dataset.id = vault.id;

  entry.appendChild(createVaultForm(vault, msgs));
  entry.appendChild(createVaultRulesBlock(vault, msgs));

  return entry;
}

function createVaultForm(vault: VaultConfig, msgs: Messages): HTMLDivElement {
  const form = createElement('div');
  form.className = 'vault-form-row';
  form.dataset.id = vault.id;

  form.appendChild(createVaultUrlRow(vault, msgs));
  form.appendChild(createVaultMetaRow(vault, msgs));
  form.appendChild(createVaultActionsRow(vault, msgs));

  return form;
}

function createVaultUrlRow(vault: VaultConfig, msgs: Messages): HTMLDivElement {
  const row = createRow();

  const httpsGroup = createFormGroup();
  const httpsLabel = createElement('label');
  setI18nText(httpsLabel, 'httpsUrlLabel', msgs);
  httpsGroup.appendChild(httpsLabel);

  const httpsInput = createElement('input');
  httpsInput.type = 'text';
  httpsInput.className = 'vault-https-url';
  httpsInput.value = vault.httpsUrl ?? '';
  httpsInput.placeholder = 'https://127.0.0.1:27124/';
  httpsGroup.appendChild(httpsInput);

  const httpsHint = createElement('small');
  setI18nText(httpsHint, 'additionalVaultHttpsHint', msgs);
  httpsGroup.appendChild(httpsHint);

  httpsInput.addEventListener('input', () => {
    updateAdditionalVault(vault.id, { httpsUrl: httpsInput.value });
    scheduleVaultRouterAutoSave();
  });

  row.appendChild(httpsGroup);

  const httpGroup = createFormGroup();
  const httpLabel = createElement('label');
  setI18nText(httpLabel, 'httpUrlLabel', msgs);
  httpGroup.appendChild(httpLabel);

  const httpInput = createElement('input');
  httpInput.type = 'text';
  httpInput.className = 'vault-http-url';
  httpInput.value = vault.httpUrl ?? '';
  httpInput.placeholder = 'http://127.0.0.1:27123/';
  httpGroup.appendChild(httpInput);

  const httpHint = createElement('small');
  setI18nText(httpHint, 'httpUrlHint', msgs);
  httpGroup.appendChild(httpHint);

  httpInput.addEventListener('input', () => {
    updateAdditionalVault(vault.id, { httpUrl: httpInput.value });
    scheduleVaultRouterAutoSave();
  });

  row.appendChild(httpGroup);
  return row;
}

function createVaultMetaRow(vault: VaultConfig, msgs: Messages): HTMLDivElement {
  const row = createRow();

  const nameGroup = createFormGroup();
  const vaultLabel = createElement('label');
  setI18nText(vaultLabel, 'vaultNameLabel', msgs);
  nameGroup.appendChild(vaultLabel);

  const vaultInput = createElement('input');
  vaultInput.type = 'text';
  vaultInput.className = 'vault-vault';
  vaultInput.value = vault.vault;
  vaultInput.placeholder = 'YourVault';
  nameGroup.appendChild(vaultInput);

  const vaultHint = createElement('small');
  setI18nText(vaultHint, 'vaultNameHint', msgs);
  nameGroup.appendChild(vaultHint);

  vaultInput.addEventListener('input', () => {
    const value = vaultInput.value;
    updateAdditionalVault(vault.id, { vault: value, name: value });
    scheduleVaultRouterAutoSave();
  });

  row.appendChild(nameGroup);

  const apiGroup = createFormGroup();
  const apiLabel = createElement('label');
  setI18nText(apiLabel, 'apiKeyLabel', msgs);
  apiGroup.appendChild(apiLabel);

  const apiInput = createElement('input');
  apiInput.type = 'password';
  apiInput.className = 'vault-api-key';
  apiInput.value = vault.apiKey;
  apiInput.placeholder = '••••••••';
  apiGroup.appendChild(apiInput);

  const apiHint = createElement('small');
  setI18nText(apiHint, 'apiKeyHint', msgs);
  apiGroup.appendChild(apiHint);

  apiInput.addEventListener('input', () => {
    updateAdditionalVault(vault.id, { apiKey: apiInput.value });
    scheduleVaultRouterAutoSave();
  });

  row.appendChild(apiGroup);
  return row;
}

function createVaultActionsRow(vault: VaultConfig, msgs: Messages): HTMLDivElement {
  const actions = createElement('div');
  actions.className = 'connection-actions';

  const testButton = createElement('button');
  testButton.type = 'button';
  testButton.className = 'secondary';
  testButton.dataset.id = vault.id;
  testButton.dataset.state = 'idle';

  const testLabel = createElement('span');
  setI18nText(testLabel, 'testConnectionButton', msgs);
  testButton.appendChild(testLabel);

  const deleteButton = createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'btn-remove danger';
  deleteButton.dataset.id = vault.id;

  const deleteLabel = createElement('span');
  setI18nText(deleteLabel, 'deleteVaultButton', msgs);
  deleteButton.appendChild(deleteLabel);

  const result = createElement('div');
  result.className = 'connection-result';
  result.hidden = true;
  result.textContent = '';
  result.setAttribute('aria-live', 'polite');

  testButton.addEventListener('click', () => {
    void handleVaultConnectionTestClick(vault.id, testButton, result, msgs);
  });

  deleteButton.addEventListener('click', async () => {
    const confirmed = await showConfirmDialog({
      title: msgs.deleteVaultDialogTitle,
      message: msgs.deleteVaultConfirm,
      confirmLabel: msgs.deleteVaultButton,
      cancelLabel: msgs.cancelButton,
      tone: 'danger'
    });
    if (!confirmed) {
      return;
    }

    removeAdditionalVault(vault.id);
    await renderAdditionalVaults();
    scheduleVaultRouterAutoSave();
  });

  actions.append(testButton, deleteButton, result);
  return actions;
}

async function handleVaultConnectionTestClick(
  vaultId: string,
  button: HTMLButtonElement,
  result: HTMLDivElement,
  msgs: Messages
): Promise<void> {
  if (isVaultConnectionTestRunning(vaultId)) {
    return;
  }

  const vaultsSnapshot = getVaultsSnapshot();
  const latestVault = vaultsSnapshot.find(item => item.id === vaultId);
  if (!latestVault) {
    result.hidden = false;
    result.className = 'connection-result error';
    result.textContent = `${msgs.connectionFailed}: 未找到仓库配置`;
    return;
  }

  const restConfig = getRestEndpointsSnapshot();
  const portEntries = collectPortEntriesFromConfig(restConfig, vaultsSnapshot);
  const duplicatePorts = findDuplicatePorts(portEntries, latestVault.id);
  if (duplicatePorts.length > 0) {
    result.hidden = false;
    result.className = 'connection-result error';
    result.textContent = formatMessage(msgs.portConflictDetected, { ports: duplicatePorts.join(', ') });
    button.disabled = false;
    button.dataset.state = 'idle';
    return;
  }

  button.disabled = true;
  button.dataset.state = 'running';

  result.hidden = false;
  result.className = 'connection-result info';
  result.textContent = msgs.connectionTesting;

  try {
    const response = await requestVaultConnectionTest(latestVault);
    result.className = response.success ? 'connection-result success' : 'connection-result error';
    result.textContent = formatConnectionDetails(response).join('\n');
  } catch (error) {
    result.className = 'connection-result error';
    const message = error instanceof Error ? error.message : String(error);
    result.textContent = `${msgs.connectionFailed}: ${message}`;
  } finally {
    button.disabled = false;
    button.dataset.state = 'idle';
  }
}

function formatConnectionDetails(response: ConnectionTestResult): string[] {
  const details = [response.message];

  if (response.status !== undefined) {
    details.push(`状态码: ${response.status}`);
  }

  if (response.response) {
    details.push(`响应片段: ${response.response}`);
  }

  if (!response.success && response.error) {
    details.push(`错误: ${response.error}`);
  }

  return details;
}

function getRestEndpointsSnapshot(): { httpsUrl?: string; httpUrl?: string } {
  return {
    httpsUrl: readInputValue('restHttpsUrl'),
    httpUrl: readInputValue('restHttpUrl')
  };
}

function readInputValue(id: string): string | undefined {
  const element = document.getElementById(id) as HTMLInputElement | null;
  if (!element) {
    return undefined;
  }

  const value = element.value.trim();
  return value ? value : undefined;
}

function createVaultRulesBlock(vault: VaultConfig, msgs: Messages): HTMLDivElement {
  const block = createElement('div');
  block.className = 'vault-rules-block';
  block.dataset.id = vault.id;

  const header = createElement('div');
  header.className = 'vault-rules-block__header';

  const titleGroup = createElement('div');
  titleGroup.className = 'vault-rules-block__title-group';

  const title = createElement('h4');
  title.className = 'vault-rules-block__title';
  title.textContent = vault.name || vault.vault;
  titleGroup.appendChild(title);

  const subtitle = createElement('span');
  subtitle.className = 'vault-rules-block__subtitle';
  setI18nText(subtitle, 'routingRulesTitle', msgs);
  titleGroup.appendChild(subtitle);

  header.appendChild(titleGroup);

  const addButton = createElement('button');
  addButton.type = 'button';
  addButton.className = 'add-mapping-btn';
  setI18nText(addButton, 'addRuleButton', msgs);
  addButton.addEventListener('click', async () => {
    addRoutingRule({ vaultId: vault.id });
    await renderAdditionalVaults();
    scheduleVaultRouterAutoSave();
  });
  header.appendChild(addButton);

  block.appendChild(header);

  const rules = vault.rules ?? [];
  if (rules.length === 0) {
    const empty = createElement('div');
    empty.className = 'vault-rules-empty';
    setI18nText(empty, 'ruleEmptyPlaceholder', msgs);
    block.appendChild(empty);
    return block;
  }

  const table = createElement('div');
  table.className = 'vault-rules-table';
  table.appendChild(createVaultRulesHeaderRow(msgs));

  for (const rule of rules) {
    table.appendChild(createVaultRulesRow(vault, rule, msgs));
  }

  block.appendChild(table);
  return block;
}

function createVaultRulesHeaderRow(msgs: Messages): HTMLDivElement {
  const headerRow = createElement('div');
  headerRow.className = 'vault-rules-header';

  const enabledHeader = createElement('span');
  setI18nText(enabledHeader, 'ruleEnabledLabel', msgs);
  headerRow.appendChild(enabledHeader);

  const typeHeader = createElement('span');
  setI18nText(typeHeader, 'ruleTypeLabel', msgs);
  headerRow.appendChild(typeHeader);

  const patternHeader = createElement('span');
  setI18nText(patternHeader, 'rulePatternLabel', msgs);
  headerRow.appendChild(patternHeader);

  const priorityHeader = createElement('span');
  setI18nText(priorityHeader, 'rulePriorityLabel', msgs);
  headerRow.appendChild(priorityHeader);

  const actionsHeader = createElement('span');
  actionsHeader.textContent = '';
  headerRow.appendChild(actionsHeader);

  return headerRow;
}

function createVaultRulesRow(vault: VaultConfig, rule: RoutingRule, msgs: Messages): HTMLDivElement {
  const row = createElement('div');
  row.className = 'vault-rules-row';
  row.dataset.id = rule.id;
  updateRuleRowState(row, rule.enabled);

  const enabledCell = createElement('div');
  enabledCell.className = 'rule-enabled-checkbox';
  const enabledLabel = createElement('label');
  const enabledCheckbox = createElement('input');
  enabledCheckbox.type = 'checkbox';
  enabledCheckbox.checked = rule.enabled;
  enabledCheckbox.addEventListener('change', () => {
    const enabled = enabledCheckbox.checked;
    updateRoutingRule(rule.id, { enabled });
    updateRuleRowState(row, enabled);
    scheduleVaultRouterAutoSave();
  });
  const enabledText = createElement('span');
  setI18nText(enabledText, 'ruleEnabledLabel', msgs);
  enabledLabel.append(enabledCheckbox, enabledText);
  enabledCell.appendChild(enabledLabel);
  row.appendChild(enabledCell);

  const typeCell = createElement('div');
  const typeSelect = createElement('select');
  typeSelect.className = 'rule-type';
  const domainOption = createOption('domain', 'ruleTypeDomain', msgs);
  const keywordOption = createOption('keyword', 'ruleTypeKeyword', msgs);
  const urlPatternOption = createOption('url-pattern', 'ruleTypeUrlPattern', msgs);
  typeSelect.append(domainOption, keywordOption, urlPatternOption);
  typeSelect.value = rule.type;
  typeSelect.addEventListener('change', () => {
    updateRoutingRule(rule.id, { type: typeSelect.value as RoutingRule['type'] });
    scheduleVaultRouterAutoSave();
  });
  typeCell.appendChild(typeSelect);
  row.appendChild(typeCell);

  const patternCell = createElement('div');
  const patternInput = createElement('input');
  patternInput.type = 'text';
  patternInput.className = 'rule-pattern';
  patternInput.value = rule.pattern;
  setI18nPlaceholder(patternInput, 'rulePatternPlaceholder', msgs);
  patternInput.title = msgs.rulePatternPlaceholder;
  patternInput.addEventListener('input', () => {
    updateRoutingRule(rule.id, { pattern: patternInput.value });
    scheduleVaultRouterAutoSave();
  });
  patternCell.appendChild(patternInput);
  row.appendChild(patternCell);

  const priorityCell = createElement('div');
  const priorityInput = createElement('input');
  priorityInput.type = 'number';
  priorityInput.className = 'rule-priority';
  priorityInput.value = String(rule.priority);
  priorityInput.min = '0';
  priorityInput.max = '100';
  priorityInput.placeholder = '10';
  priorityInput.addEventListener('input', () => {
    const value = parseInt(priorityInput.value, 10);
    updateRoutingRule(rule.id, { priority: Number.isFinite(value) ? value : 10 });
    scheduleVaultRouterAutoSave();
  });
  priorityCell.appendChild(priorityInput);
  row.appendChild(priorityCell);

  const actionsCell = createElement('div');
  const removeButton = createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn-remove danger';
  setI18nText(removeButton, 'deleteRuleButton', msgs);
  removeButton.addEventListener('click', async () => {
    const confirmed = await showConfirmDialog({
      title: msgs.deleteRuleDialogTitle,
      message: msgs.ruleDeleteConfirm,
      confirmLabel: msgs.deleteRuleButton,
      cancelLabel: msgs.cancelButton,
      tone: 'danger'
    });
    if (!confirmed) {
      return;
    }

    removeRoutingRule(rule.id);
    await renderAdditionalVaults();
    scheduleVaultRouterAutoSave();
  });
  actionsCell.appendChild(removeButton);
  row.appendChild(actionsCell);

  return row;
}

function updateRuleRowState(row: HTMLElement, enabled: boolean): void {
  row.style.opacity = enabled ? '1' : '0.6';
}

function createRow(): HTMLDivElement {
  const row = createElement('div');
  row.className = 'row';
  return row;
}

function createFormGroup(): HTMLDivElement {
  const group = createElement('div');
  group.className = 'form-group';
  return group;
}

function createOption(value: string, key: keyof Messages, msgs: Messages): HTMLOptionElement {
  const option = createElement('option');
  option.value = value;
  setI18nText(option, key, msgs);
  return option;
}

function setI18nText(element: HTMLElement, key: keyof Messages, msgs: Messages): void {
  element.dataset.i18n = key;
  element.textContent = msgs[key];
}

function setI18nPlaceholder(element: HTMLInputElement | HTMLTextAreaElement, key: keyof Messages, msgs: Messages): void {
  element.dataset.i18nPlaceholder = key;
  element.placeholder = msgs[key];
}
