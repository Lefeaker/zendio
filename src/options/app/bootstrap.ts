import { initI18n, getCurrentLanguage, setCurrentLanguage, getMessages } from '../../i18n';
import { renderOptionsForm, collectOptionsFromForm, bindOptionsFormEvents } from '../components/optionsForm';
import { addMappingRow } from '../components/domainMappings';
import {
  renderAdditionalVaults,
  renderRoutingRules,
  handleAddAdditionalVault,
  handleAddRoutingRule
} from '../components/vaultRouterSection';
import { showTransferMessage, clearTransferMessage, showStatusMessage, formatOptionsError } from '../components/messages';
import { runDiagnostics, fixConfiguration } from '../components/diagnostics';
import { setupConnectionTest } from '../components/connectionTest';
import { copyOptionsToClipboard, parseConfigInput, readConfigTextFromClipboard } from '../services/configTransfer';
import {
  loadOptionsFromStorage,
  saveOptionsToStorage,
  getLastLoadedOptions,
  setLastLoadedOptions
} from '../state/optionsStore';
import { initializeVaultRouterStore } from '../state/vaultRouterStore';
import type { StoredOptions } from '../../shared/types/options';

export async function bootstrapOptionsApp(): Promise<void> {
  bindEventHandlers();
  await initI18n();
  await refreshUIFromStorage();
}

async function refreshUIFromStorage(): Promise<void> {
  const stored = await loadOptionsFromStorage();
  await applyOptionsToUI(stored);
}

async function applyOptionsToUI(options: StoredOptions): Promise<void> {
  setLastLoadedOptions(options);
  initializeVaultRouterStore(options.vaultRouter ?? null);

  const currentLang = await getCurrentLanguage();
  const languageSelect = document.getElementById('languageSelect') as HTMLSelectElement | null;
  if (languageSelect) {
    languageSelect.value = currentLang;
  }

  renderOptionsForm(options);
  await renderAdditionalVaults();
  await renderRoutingRules();
  clearTransferMessage();
}

function bindEventHandlers(): void {
  bindOptionsFormEvents();
  setupConnectionTest();

  const languageSelect = document.getElementById('languageSelect') as HTMLSelectElement | null;
  languageSelect?.addEventListener('change', async (event) => {
    const newLang = (event.target as HTMLSelectElement).value as Parameters<typeof setCurrentLanguage>[0];
    await setCurrentLanguage(newLang);
    await initI18n();
    await refreshUIFromStorage();
  });

  const addMappingBtn = document.getElementById('addMappingBtn');
  addMappingBtn?.addEventListener('click', () => {
    addMappingRow();
  });

  const copyBtn = document.getElementById('copyConfigBtn');
  copyBtn?.addEventListener('click', () => { void handleCopyConfig(); });

  const importBtn = document.getElementById('importConfigBtn');
  importBtn?.addEventListener('click', () => { void handleImportConfig(); });

  const addVaultBtn = document.getElementById('addAdditionalVaultBtn');
  addVaultBtn?.addEventListener('click', () => { void handleAddAdditionalVault(); });

  const addRuleBtn = document.getElementById('addRoutingRuleBtn');
  addRuleBtn?.addEventListener('click', () => { void handleAddRoutingRule(); });

  const saveBtn = document.getElementById('saveBtn');
  saveBtn?.addEventListener('click', () => { void handleSave(); });

  const diagBtn = document.getElementById('diagBtn');
  diagBtn?.addEventListener('click', () => { void runDiagnostics(); });

  const fixBtn = document.getElementById('fixBtn');
  fixBtn?.addEventListener('click', () => { void handleFix(); });

  const reloadBtn = document.getElementById('reloadBtn');
  reloadBtn?.addEventListener('click', () => { void handleReload(); });
}

async function handleCopyConfig(): Promise<void> {
  clearTransferMessage();
  const msgs = await getMessages();

  try {
    const options = collectOptionsFromForm(getLastLoadedOptions());
    await copyOptionsToClipboard(options);
    showTransferMessage('success', msgs.copyConfigSuccess);
  } catch (error) {
    showTransferMessage('error', formatOptionsError(error, msgs));
  }
}

async function handleImportConfig(): Promise<void> {
  clearTransferMessage();
  const msgs = await getMessages();

  try {
    const raw = await readConfigTextFromClipboard();
    const parsed = parseConfigInput(raw);
    await applyOptionsToUI(parsed);

    const normalized = collectOptionsFromForm(parsed);
    await saveOptionsToStorage(normalized);
    setLastLoadedOptions(normalized);

    showTransferMessage('success', msgs.importSuccess);
    showStatusMessage('success', msgs.importSuccess);
  } catch (error) {
    showTransferMessage('error', formatOptionsError(error, msgs));
  }
}

async function handleSave(): Promise<void> {
  const msgs = await getMessages();

  try {
    const options = collectOptionsFromForm(getLastLoadedOptions());
    await saveOptionsToStorage(options);
    setLastLoadedOptions(options);
    showStatusMessage('success', msgs.saveSuccess);
  } catch (error) {
    showStatusMessage('error', `${msgs.saveFailed}: ${formatOptionsError(error, msgs)}`);
  }
}

async function handleFix(): Promise<void> {
  await fixConfiguration(refreshUIFromStorage);
}

async function handleReload(): Promise<void> {
  await refreshUIFromStorage();
  await runDiagnostics();
}
