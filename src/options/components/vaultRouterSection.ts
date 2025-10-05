import type { Messages } from '../../i18n/locales';
import { getMessages, initI18n } from '../../i18n';
import { createElement, getElementById } from '../utils/dom';
import {
  addAdditionalVault,
  addRoutingRule,
  getRulesSnapshot,
  getVaultsSnapshot,
  removeAdditionalVault,
  removeRoutingRule,
  updateAdditionalVault,
  updateRoutingRule
} from '../state/vaultRouterStore';
import type { VaultConfig, RoutingRule } from '../../shared/types';
import { showConfirmDialog } from './confirmDialog';

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
    fragment.appendChild(createVaultRow(vault, msgs));
  }

  container.appendChild(fragment);
  await initI18n();
}

export async function renderRoutingRules(): Promise<void> {
  const container = getElementById<HTMLDivElement>('routingRulesList');
  container.innerHTML = '';

  const rules = getRulesSnapshot();
  if (rules.length === 0) {
    await initI18n();
    return;
  }

  const msgs = await getMessages();
  const vaults = getVaultsSnapshot();
  const fragment = document.createDocumentFragment();

  for (const rule of rules) {
    fragment.appendChild(createRuleRow(rule, vaults, msgs));
  }

  container.appendChild(fragment);
  await initI18n();
}

export async function handleAddAdditionalVault(): Promise<void> {
  addAdditionalVault();
  await renderAdditionalVaults();
  await renderRoutingRules();
}

export async function handleAddRoutingRule(): Promise<void> {
  const vaults = getVaultsSnapshot();
  const msgs = await getMessages();

  if (vaults.length === 0) {
    await showConfirmDialog({
      title: msgs.infoDialogTitle,
      message: msgs.ruleAddVaultPrompt,
      confirmLabel: msgs.infoDialogConfirm,
      focusCancel: false
    });
    return;
  }

  const [firstVault] = vaults;
  addRoutingRule({ vaultId: firstVault.id });
  await renderRoutingRules();
}

function createVaultRow(vault: VaultConfig, msgs: Messages): HTMLDivElement {
  const row = createElement('div');
  row.className = 'vault-form-row';
  row.dataset.id = vault.id;

  row.appendChild(createVaultNameRow(vault, msgs));
  row.appendChild(createVaultUrlRow(vault, msgs));
  row.appendChild(createVaultMetaRow(vault, msgs));
  row.appendChild(createVaultActionsRow(vault, msgs));

  return row;
}

function createVaultNameRow(vault: VaultConfig, msgs: Messages): HTMLDivElement {
  const row = createRow();
  const group = createFormGroup();

  const label = createElement('label');
  setI18nText(label, 'multiVaultNameLabel', msgs);
  group.appendChild(label);

  const input = createElement('input');
  input.type = 'text';
  input.className = 'vault-name';
  input.value = vault.name;
  setI18nPlaceholder(input, 'multiVaultNamePlaceholder', msgs);
  group.appendChild(input);

  const hint = createElement('small');
  setI18nText(hint, 'multiVaultNameHint', msgs);
  group.appendChild(hint);

  input.addEventListener('input', () => {
    updateAdditionalVault(vault.id, { name: input.value });
  });

  row.appendChild(group);
  return row;
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
  setI18nText(httpsHint, 'httpsUrlHint', msgs);
  httpsGroup.appendChild(httpsHint);

  httpsInput.addEventListener('input', () => {
    updateAdditionalVault(vault.id, { httpsUrl: httpsInput.value });
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
    updateAdditionalVault(vault.id, { vault: vaultInput.value });
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
  });

  row.appendChild(apiGroup);
  return row;
}

function createVaultActionsRow(vault: VaultConfig, msgs: Messages): HTMLDivElement {
  const row = createElement('div');
  row.className = 'form-actions';

  const button = createElement('button');
  button.type = 'button';
  button.className = 'btn-remove danger';
  button.dataset.id = vault.id;

  const label = createElement('span');
  setI18nText(label, 'deleteVaultButton', msgs);
  button.appendChild(label);

  button.addEventListener('click', async () => {
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
    await renderRoutingRules();
  });

  row.appendChild(button);
  return row;
}

function createRuleRow(rule: RoutingRule, vaults: VaultConfig[], msgs: Messages): HTMLDivElement {
  const row = createElement('div');
  row.className = 'rule-form-row';
  row.dataset.id = rule.id;
  updateRuleOpacity(row, rule.enabled);

  row.appendChild(createRuleTypeRow(rule, msgs));
  row.appendChild(createRuleTargetRow(rule, vaults, msgs));
  row.appendChild(createRuleMetaRow(rule, msgs, row));
  row.appendChild(createRuleActionsRow(rule, msgs));

  return row;
}

function createRuleTypeRow(rule: RoutingRule, msgs: Messages): HTMLDivElement {
  const row = createRow();

  const typeGroup = createFormGroup();
  const typeLabel = createElement('label');
  setI18nText(typeLabel, 'ruleTypeLabel', msgs);
  typeGroup.appendChild(typeLabel);

  const typeSelect = createElement('select');
  typeSelect.className = 'rule-type';

  const domainOption = createOption('domain', 'ruleTypeDomain', msgs);
  const keywordOption = createOption('keyword', 'ruleTypeKeyword', msgs);
  const urlPatternOption = createOption('url-pattern', 'ruleTypeUrlPattern', msgs);

  typeSelect.append(domainOption, keywordOption, urlPatternOption);
  typeSelect.value = rule.type;

  typeSelect.addEventListener('change', () => {
    updateRoutingRule(rule.id, { type: typeSelect.value as RoutingRule['type'] });
  });

  typeGroup.appendChild(typeSelect);
  row.appendChild(typeGroup);

  const patternGroup = createFormGroup();
  const patternLabel = createElement('label');
  setI18nText(patternLabel, 'rulePatternLabel', msgs);
  patternGroup.appendChild(patternLabel);

  const patternInput = createElement('input');
  patternInput.type = 'text';
  patternInput.className = 'rule-pattern';
  patternInput.value = rule.pattern;
  setI18nPlaceholder(patternInput, 'rulePatternPlaceholder', msgs);
  patternGroup.appendChild(patternInput);

  const patternHint = createElement('small');
  setI18nText(patternHint, 'rulePatternPlaceholder', msgs);
  patternGroup.appendChild(patternHint);

  patternInput.addEventListener('input', () => {
    updateRoutingRule(rule.id, { pattern: patternInput.value });
  });

  row.appendChild(patternGroup);
  return row;
}

function createRuleTargetRow(rule: RoutingRule, vaults: VaultConfig[], msgs: Messages): HTMLDivElement {
  const row = createRow();

  const targetGroup = createFormGroup();
  const targetLabel = createElement('label');
  setI18nText(targetLabel, 'ruleTargetVaultLabel', msgs);
  targetGroup.appendChild(targetLabel);

  const vaultSelect = createElement('select');
  vaultSelect.className = 'rule-vault';

  if (vaults.length === 0) {
    const option = createOption('', 'ruleNoVaultOption', msgs);
    option.disabled = true;
    option.selected = true;
    vaultSelect.appendChild(option);
  } else {
    for (const vault of vaults) {
      const option = createElement('option');
      option.value = vault.id;
      option.textContent = vault.name;
      vaultSelect.appendChild(option);
    }
    if (vaults.some(v => v.id === rule.vaultId)) {
      vaultSelect.value = rule.vaultId;
    }
  }

  vaultSelect.addEventListener('change', () => {
    updateRoutingRule(rule.id, { vaultId: vaultSelect.value });
  });

  targetGroup.appendChild(vaultSelect);
  row.appendChild(targetGroup);

  const priorityGroup = createFormGroup();
  const priorityLabel = createElement('label');
  setI18nText(priorityLabel, 'rulePriorityLabel', msgs);
  priorityGroup.appendChild(priorityLabel);

  const priorityInput = createElement('input');
  priorityInput.type = 'number';
  priorityInput.className = 'rule-priority';
  priorityInput.value = String(rule.priority);
  priorityInput.min = '0';
  priorityInput.max = '100';
  priorityInput.placeholder = '10';
  priorityGroup.appendChild(priorityInput);

  const priorityHint = createElement('small');
  setI18nText(priorityHint, 'rulePriorityHint', msgs);
  priorityGroup.appendChild(priorityHint);

  priorityInput.addEventListener('input', () => {
    const value = parseInt(priorityInput.value, 10);
    updateRoutingRule(rule.id, { priority: Number.isFinite(value) ? value : 10 });
  });

  row.appendChild(priorityGroup);
  return row;
}

function createRuleMetaRow(rule: RoutingRule, msgs: Messages, rowElement: HTMLElement): HTMLDivElement {
  const metaRow = createRow();

  const descriptionGroup = createFormGroup();
  const descriptionLabel = createElement('label');
  setI18nText(descriptionLabel, 'ruleDescriptionLabel', msgs);
  descriptionGroup.appendChild(descriptionLabel);

  const descriptionInput = createElement('input');
  descriptionInput.type = 'text';
  descriptionInput.className = 'rule-description';
  descriptionInput.value = rule.description ?? '';
  setI18nPlaceholder(descriptionInput, 'ruleDescriptionPlaceholder', msgs);
  descriptionGroup.appendChild(descriptionInput);

  const descriptionHint = createElement('small');
  setI18nText(descriptionHint, 'ruleDescriptionHint', msgs);
  descriptionGroup.appendChild(descriptionHint);

  descriptionInput.addEventListener('input', () => {
    const value = descriptionInput.value.trim();
    updateRoutingRule(rule.id, { description: value || undefined });
  });

  metaRow.appendChild(descriptionGroup);

  const enabledGroup = createFormGroup();
  const enabledLabel = createElement('label');
  const enabledCheckbox = createElement('input');
  enabledCheckbox.type = 'checkbox';
  enabledCheckbox.className = 'rule-enabled';
  enabledCheckbox.checked = rule.enabled;

  enabledCheckbox.addEventListener('change', () => {
    const enabled = enabledCheckbox.checked;
    updateRoutingRule(rule.id, { enabled });
    updateRuleOpacity(rowElement, enabled);
  });

  const enabledText = createElement('span');
  setI18nText(enabledText, 'ruleEnabledLabel', msgs);

  enabledLabel.append(enabledCheckbox, enabledText);
  enabledGroup.appendChild(enabledLabel);
  metaRow.appendChild(enabledGroup);

  return metaRow;
}

function createRuleActionsRow(rule: RoutingRule, msgs: Messages): HTMLDivElement {
  const actionRow = createElement('div');
  actionRow.className = 'form-actions';

  const removeButton = createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn-remove danger';
  removeButton.dataset.id = rule.id;

  const removeLabel = createElement('span');
  setI18nText(removeLabel, 'deleteRuleButton', msgs);
  removeButton.appendChild(removeLabel);

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
    await renderRoutingRules();
  });

  actionRow.appendChild(removeButton);
  return actionRow;
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

function updateRuleOpacity(element: HTMLElement, enabled: boolean): void {
  element.style.opacity = enabled ? '1' : '0.6';
}
