/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Messages } from '../../src/i18n/locales';

const initI18nMock = vi.fn();
const getMessagesMock = vi.fn();
const showConfirmDialogMock = vi.fn();
const getVaultsSnapshotMock = vi.fn();
const getRulesSnapshotMock = vi.fn();
const addAdditionalVaultMock = vi.fn();
const addRoutingRuleMock = vi.fn();
const removeAdditionalVaultMock = vi.fn();
const removeRoutingRuleMock = vi.fn();
const updateAdditionalVaultMock = vi.fn();
const updateRoutingRuleMock = vi.fn();

vi.mock('../../src/i18n', () => ({
  initI18n: initI18nMock,
  getMessages: getMessagesMock
}));

vi.mock('../../src/options/components/confirmDialog', () => ({
  showConfirmDialog: showConfirmDialogMock
}));

vi.mock('../../src/options/state/vaultRouterStore', () => ({
  getVaultsSnapshot: getVaultsSnapshotMock,
  getRulesSnapshot: getRulesSnapshotMock,
  addAdditionalVault: addAdditionalVaultMock,
  addRoutingRule: addRoutingRuleMock,
  removeAdditionalVault: removeAdditionalVaultMock,
  removeRoutingRule: removeRoutingRuleMock,
  updateAdditionalVault: updateAdditionalVaultMock,
  updateRoutingRule: updateRoutingRuleMock
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const mockMessages = {
  // minimal set for tests
  extensionName: '',
  extensionSubtitle: '',
  settingsTitle: '',
  languageSettings: '',
  languageLabel: '',
  languageHint: '',
  apiConfigTitle: '',
  apiConfigHint: '',
  httpsUrlLabel: 'HTTPS URL',
  httpsUrlHint: 'HTTPS hint',
  httpUrlLabel: 'HTTP URL',
  httpUrlHint: 'HTTP hint',
  vaultNameLabel: 'Vault ID',
  vaultNamePlaceholder: 'YourVault',
  vaultNameHint: 'Vault hint',
  apiKeyLabel: 'API Key',
  apiKeyPlaceholder: '',
  apiKeyHint: 'API hint',
  templateConfigTitle: '',
  articleTemplateLabel: '',
  articleTemplateHint: '',
  fragmentTemplateLabel: '',
  fragmentTemplateHint: '',
  aiTemplateLabel: '',
  aiTemplateHint: '',
  availableVariables: '',
  domainMappingTitle: '',
  domainMappingHint: '',
  domainLabel: '',
  folderNameLabel: '',
  addMappingButton: '',
  configTransferTitle: '',
  configTransferHint: '',
  copyConfigButton: '',
  importConfigButton: '',
  configTransferNote: '',
  copyConfigSuccess: '',
  importSuccess: '',
  importParseFailed: '',
  emptyImportError: '',
  clipboardUnavailable: '',
  clipboardReadUnavailable: '',
  invalidTaxonomy: '',
  aiChatConfigTitle: '',
  aiChatConfigHint: '',
  includeTimestampsLabel: '',
  includeTimestampsHint: '',
  userNameLabel: '',
  userNamePlaceholder: '',
  userNameHint: '',
  captureContextLabel: '',
  deepResearchConfigTitle: '',
  deepResearchConfigHint: '',
  pureModeLabel: '',
  pureModeHint: '',
  multipleReportsInfo: '',
  clipDialogTitle: '',
  commentLabel: '',
  commentPlaceholder: '',
  cancelButton: 'Cancel',
  clipButton: '',
  openReaderButton: '',
  addToReaderButton: '',
  additionalVaultsTitle: '',
  additionalVaultsHint: '',
  addVaultButton: '',
  multiVaultNameLabel: 'Vault Name',
  multiVaultNamePlaceholder: 'My Vault',
  multiVaultNameHint: 'Friendly label',
  deleteVaultButton: 'Delete Vault',
  deleteVaultConfirm: 'Delete this vault?',
  defaultVaultBadge: '',
  deleteVaultDialogTitle: 'Remove Vault',
  deleteRuleDialogTitle: 'Remove Rule',
  infoDialogTitle: 'Notice',
  infoDialogConfirm: 'Got it',
  routingRulesTitle: '',
  routingRulesHint: '',
  addRuleButton: '',
  ruleTypeLabel: 'Rule Type',
  ruleTypeDomain: 'Domain',
  ruleTypeKeyword: 'Keyword',
  ruleTypeUrlPattern: 'URL Pattern',
  rulePatternLabel: 'Pattern',
  rulePatternPlaceholder: 'pattern placeholder',
  ruleTargetVaultLabel: 'Target Vault',
  rulePriorityLabel: 'Priority',
  rulePriorityHint: 'Priority hint',
  ruleDescriptionLabel: 'Description',
  ruleDescriptionPlaceholder: 'Description placeholder',
  ruleDescriptionHint: 'Description hint',
  ruleEnabledLabel: 'Enabled',
  classifierUnstableNotice: '',
  deleteRuleButton: 'Delete Rule',
  ruleDeleteConfirm: 'Delete this rule?',
  ruleNoVaultOption: 'Add a vault first',
  ruleAddVaultPrompt: 'Please add a vault first.',
  editRuleButton: '',
  readerPanelTitle: '',
  readerPanelStatus: '',
  readerPanelHint: '',
  readerPanelFinish: '',
  readerPanelCancel: '',
  readerPanelCounter: '',
  readerPanelCounterZero: '',
  readerHintNoHighlights: '',
  readerHintExporting: '',
  readerHintFailure: '',
  readerHintSelectionFailure: ''
} as Messages;

describe('vaultRouterSection UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <div id="additionalVaultsList"></div>
      <div id="routingRulesList"></div>
    `;
    window.alert = vi.fn();
    getRulesSnapshotMock.mockReturnValue([]);
    getMessagesMock.mockResolvedValue(mockMessages);
    showConfirmDialogMock.mockResolvedValue(true);
  });

  it('renders existing vaults and wires input handlers', async () => {
    initI18nMock.mockResolvedValue(undefined);
    getVaultsSnapshotMock.mockReturnValue([
      {
        id: 'vault-1',
        name: 'Secondary Vault',
        httpsUrl: 'https://127.0.0.1:27124/',
        httpUrl: 'http://127.0.0.1:27123/',
        vault: 'Secondary',
        apiKey: 'key',
        isDefault: false
      }
    ]);

    const module = await import('../../src/options/components/vaultRouterSection');

    await module.renderAdditionalVaults();

    const rows = document.querySelectorAll('.vault-form-row');
    expect(rows.length).toBe(1);

    const nameInput = rows[0].querySelector('.vault-name') as HTMLInputElement;
    nameInput.value = 'Updated Vault';
    nameInput.dispatchEvent(new Event('input'));
    expect(updateAdditionalVaultMock).toHaveBeenCalledWith('vault-1', { name: 'Updated Vault' });

    const removeButton = rows[0].querySelector('.btn-remove') as HTMLButtonElement;
    removeButton.click();
    await flushPromises();
    expect(showConfirmDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      title: mockMessages.deleteVaultDialogTitle,
      message: mockMessages.deleteVaultConfirm
    }));
    expect(removeAdditionalVaultMock).toHaveBeenCalledWith('vault-1');

    expect(initI18nMock).toHaveBeenCalled();
  });

  it('renders routing rules and propagates user interactions', async () => {
    initI18nMock.mockResolvedValue(undefined);
    getVaultsSnapshotMock.mockReturnValue([
      { id: 'vault-1', name: 'A', httpsUrl: '', httpUrl: '', vault: 'A', apiKey: '', isDefault: false },
      { id: 'vault-2', name: 'B', httpsUrl: '', httpUrl: '', vault: 'B', apiKey: '', isDefault: false }
    ]);
    getRulesSnapshotMock.mockReturnValue([
      {
        id: 'rule-1',
        vaultId: 'vault-1',
        type: 'domain',
        pattern: 'example.com',
        enabled: true,
        priority: 10,
        description: 'Example rule'
      }
    ]);

    const module = await import('../../src/options/components/vaultRouterSection');

    await module.renderRoutingRules();

    const row = document.querySelector('.rule-form-row') as HTMLElement;
    expect(row).toBeTruthy();

    const selects = row.querySelectorAll('select');
    const typeSelect = selects[0] as HTMLSelectElement;
    typeSelect.value = 'keyword';
    typeSelect.dispatchEvent(new Event('change'));
    expect(updateRoutingRuleMock).toHaveBeenCalledWith('rule-1', { type: 'keyword' });

    const patternInput = row.querySelector('.rule-pattern') as HTMLInputElement;
    patternInput.value = 'updated.com';
    patternInput.dispatchEvent(new Event('input'));
    expect(updateRoutingRuleMock).toHaveBeenCalledWith('rule-1', { pattern: 'updated.com' });

    const vaultSelect = row.querySelector('.rule-vault') as HTMLSelectElement;
    vaultSelect.value = 'vault-2';
    vaultSelect.dispatchEvent(new Event('change'));
    expect(updateRoutingRuleMock).toHaveBeenCalledWith('rule-1', { vaultId: 'vault-2' });

    const priorityInput = row.querySelector('.rule-priority') as HTMLInputElement;
    priorityInput.value = '42';
    priorityInput.dispatchEvent(new Event('input'));
    expect(updateRoutingRuleMock).toHaveBeenCalledWith('rule-1', { priority: 42 });

    const descriptionInput = row.querySelector('.rule-description') as HTMLInputElement;
    descriptionInput.value = 'Updated description';
    descriptionInput.dispatchEvent(new Event('input'));
    expect(updateRoutingRuleMock).toHaveBeenCalledWith('rule-1', { description: 'Updated description' });

    const enabledCheckbox = row.querySelector('.rule-enabled') as HTMLInputElement;
    enabledCheckbox.checked = false;
    enabledCheckbox.dispatchEvent(new Event('change'));
    expect(updateRoutingRuleMock).toHaveBeenCalledWith('rule-1', { enabled: false });
    expect(row.style.opacity).toBe('0.6');

    const removeButton = row.querySelector('.btn-remove') as HTMLButtonElement;
    removeButton.click();
    await flushPromises();
    expect(showConfirmDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      title: mockMessages.deleteRuleDialogTitle,
      message: mockMessages.ruleDeleteConfirm
    }));
    expect(removeRoutingRuleMock).toHaveBeenCalledWith('rule-1');

    expect(initI18nMock).toHaveBeenCalled();
  });
});
