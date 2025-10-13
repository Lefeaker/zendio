/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Messages } from '../../src/i18n/locales';

const initI18nMock = vi.fn();
const getMessagesMock = vi.fn();
const showConfirmDialogMock = vi.fn();
const getVaultsSnapshotMock = vi.fn();
const addAdditionalVaultMock = vi.fn();
const addRoutingRuleMock = vi.fn();
const removeAdditionalVaultMock = vi.fn();
const removeRoutingRuleMock = vi.fn();
const updateAdditionalVaultMock = vi.fn();
const updateRoutingRuleMock = vi.fn();
const requestVaultConnectionTestMock = vi.fn();
const isVaultConnectionTestRunningMock = vi.fn();

vi.mock('../../src/i18n', () => ({
  initI18n: initI18nMock,
  getMessages: getMessagesMock,
  formatMessage: (template: string, params: Record<string, string>) => {
    return template.replace(/\{(\w+)\}/g, (match, key) => (params[key] ?? match));
  }
}));

vi.mock('../../src/options/components/confirmDialog', () => ({
  showConfirmDialog: showConfirmDialogMock
}));

vi.mock('../../src/options/services/connectionTester', () => ({
  requestVaultConnectionTest: requestVaultConnectionTestMock,
  isVaultConnectionTestRunning: isVaultConnectionTestRunningMock
}));

vi.mock('../../src/options/state/vaultRouterStore', () => ({
  getVaultsSnapshot: getVaultsSnapshotMock,
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
  additionalVaultHttpsHint: 'HTTPS unique hint',
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
  testConnectionButton: 'Test Connection',
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
  readerHintSelectionFailure: '',
  connectionTesting: 'Testing connection...',
  portConflictDetected: 'Port conflict: {ports}',
  connectionFailed: 'Connection failed'
} as Messages;

describe('vaultRouterSection UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <div id="additionalVaultsList"></div>
    `;
    window.alert = vi.fn();
    getMessagesMock.mockResolvedValue(mockMessages);
    showConfirmDialogMock.mockResolvedValue(true);
    requestVaultConnectionTestMock.mockResolvedValue({
      success: true,
      message: 'ok'
    });
    isVaultConnectionTestRunningMock.mockReturnValue(false);
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
        isDefault: false,
        rules: []
      }
    ]);

    const module = await import('../../src/options/components/vaultRouterSection');

    await module.renderAdditionalVaults();

    const entries = document.querySelectorAll('.vault-entry');
    expect(entries.length).toBe(1);

    const formRow = entries[0].querySelector('.vault-form-row') as HTMLElement;
    expect(formRow).toBeTruthy();

    const httpsInput = formRow.querySelector('.vault-https-url') as HTMLInputElement;
    httpsInput.value = 'https://demo/';
    httpsInput.dispatchEvent(new Event('input'));
    expect(updateAdditionalVaultMock).toHaveBeenCalledWith('vault-1', { httpsUrl: 'https://demo/' });

    const httpInput = formRow.querySelector('.vault-http-url') as HTMLInputElement;
    httpInput.value = 'http://demo/';
    httpInput.dispatchEvent(new Event('input'));
    expect(updateAdditionalVaultMock).toHaveBeenCalledWith('vault-1', { httpUrl: 'http://demo/' });

    const apiInput = formRow.querySelector('.vault-api-key') as HTMLInputElement;
    apiInput.value = 'secret';
    apiInput.dispatchEvent(new Event('input'));
    expect(updateAdditionalVaultMock).toHaveBeenCalledWith('vault-1', { apiKey: 'secret' });

    const vaultInput = formRow.querySelector('.vault-vault') as HTMLInputElement;
    vaultInput.value = 'Updated Vault';
    vaultInput.dispatchEvent(new Event('input'));
    expect(updateAdditionalVaultMock).toHaveBeenCalledWith('vault-1', { vault: 'Updated Vault', name: 'Updated Vault' });

    const removeButton = formRow.querySelector('.btn-remove') as HTMLButtonElement;
    removeButton.click();
    await flushPromises();
    expect(showConfirmDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      title: mockMessages.deleteVaultDialogTitle,
      message: mockMessages.deleteVaultConfirm
    }));
    expect(removeAdditionalVaultMock).toHaveBeenCalledWith('vault-1');

    expect(initI18nMock).toHaveBeenCalled();
  });

  it('triggers connection test for vault and renders result', async () => {
    initI18nMock.mockResolvedValue(undefined);
    getVaultsSnapshotMock.mockReturnValue([
      {
        id: 'vault-1',
        name: 'Secondary Vault',
        httpsUrl: 'https://127.0.0.1:27124/',
        httpUrl: 'http://127.0.0.1:27123/',
        vault: 'Secondary',
        apiKey: 'key',
        isDefault: false,
        rules: []
      }
    ]);

    requestVaultConnectionTestMock.mockResolvedValue({
      success: true,
      message: 'done',
      status: 200,
      response: 'pong'
    });

    const module = await import('../../src/options/components/vaultRouterSection');
    await module.renderAdditionalVaults();

    const testButton = document.querySelector('.connection-actions .secondary') as HTMLButtonElement;
    expect(testButton.dataset.state).toBe('idle');

    testButton.click();
    await flushPromises();

    expect(requestVaultConnectionTestMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'vault-1',
      httpsUrl: 'https://127.0.0.1:27124/',
      httpUrl: 'http://127.0.0.1:27123/',
      apiKey: 'key'
    }));

    const result = document.querySelector('.connection-result') as HTMLDivElement;
    expect(result.hidden).toBe(false);
    expect(result.className).toContain('success');
    expect(result.textContent).toContain('done');
    expect(testButton.dataset.state).toBe('idle');
  });

  it('renders routing rules and propagates user interactions', async () => {
    initI18nMock.mockResolvedValue(undefined);
    getVaultsSnapshotMock.mockReturnValue([
      {
        id: 'vault-1',
        name: 'A',
        httpsUrl: '',
        httpUrl: '',
        vault: 'A',
        apiKey: '',
        isDefault: false,
        rules: [
          {
            id: 'rule-1',
            vaultId: 'vault-1',
            type: 'domain',
            pattern: 'example.com',
            enabled: true,
            priority: 10
          }
        ]
      },
      {
        id: 'vault-2',
        name: 'B',
        httpsUrl: '',
        httpUrl: '',
        vault: 'B',
        apiKey: '',
        isDefault: false,
        rules: []
      }
    ]);

    const module = await import('../../src/options/components/vaultRouterSection');

    await module.renderAdditionalVaults();

    const ruleRows = document.querySelectorAll('.vault-rules-row');
    expect(ruleRows.length).toBe(1);

    const row = ruleRows[0] as HTMLElement;

    const typeSelect = row.querySelector('.rule-type') as HTMLSelectElement;
    typeSelect.value = 'keyword';
    typeSelect.dispatchEvent(new Event('change'));
    expect(updateRoutingRuleMock).toHaveBeenCalledWith('rule-1', { type: 'keyword' });

    const patternInput = row.querySelector('.rule-pattern') as HTMLInputElement;
    patternInput.value = 'updated.com';
    patternInput.dispatchEvent(new Event('input'));
    expect(updateRoutingRuleMock).toHaveBeenCalledWith('rule-1', { pattern: 'updated.com' });

    const priorityInput = row.querySelector('.rule-priority') as HTMLInputElement;
    priorityInput.value = '42';
    priorityInput.dispatchEvent(new Event('input'));
    expect(updateRoutingRuleMock).toHaveBeenCalledWith('rule-1', { priority: 42 });

    const enabledCheckbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
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
