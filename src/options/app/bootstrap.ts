import {
  createDefaultPageI18nController,
  type PageI18nController,
  type Language,
  configureI18nStorage
} from '../../i18n';
import {
  showTransferMessage,
  clearTransferMessage,
  showStatusMessage,
  formatOptionsError
} from '../components/messages';
import {
  copyOptionsToClipboard,
  parseConfigInput,
  readConfigTextFromClipboard,
  type ConfigTransferPayload
} from '../services/configTransfer';
import { consumeYamlMigrationNotice } from '../state/optionsStore';
import type { StoredOptions } from '../../shared/types/options';
import { normalizeOptionsForTransfer } from '../utils/optionsTransfer';
import { chromeOptionsPersistence } from '../services/persistence';
import { createOptionsFormAdapter } from '../components/optionsFormAdapter';
import { createOptionsController } from './optionsController';
import type { OptionsController } from './optionsController';
import {
  registerOptionsController,
  consumePendingAutoSaveSource
} from './optionsControllerContext';
import { setOptionsI18nContext, getOptionsMessages } from './i18nContext';
import {
  exportAnalyticsTransferPayload,
  applyAnalyticsTransferPayload
} from '../services/analyticsTransfer';
import { mountOptionsShell, type MountedOptionsShell } from './optionsShell';
import { configureOptionsActions } from './optionsActions';
import { FormSectionRegistry } from '../components/formSections/formSectionManager';
import { ThemeSwitcher } from '../../ui/domains/theme';
import { configureAnalyticsConfigManager } from '../../shared/errors/analytics/analyticsConfig';
import { configureGlobalStateManagerStorage } from '../../shared/state/globalStateManager';
import type { StorageService } from '../../platform/interfaces/storage';
import {
  createOptionsModalBindings,
  handleOptionsUrlHash,
  prepareOptionsChangelogModal
} from './bootstrapUi';

let formSectionRegistry: FormSectionRegistry | null = null;
let optionsController: OptionsController | null = null;
let themeSwitcher: ThemeSwitcher | null = null;
let diagnosticsModulePromise: Promise<typeof import('../components/diagnostics')> | null = null;

function loadDiagnosticsModule(): Promise<typeof import('../components/diagnostics')> {
  if (!diagnosticsModulePromise) {
    diagnosticsModulePromise = import('../components/diagnostics');
  }
  return diagnosticsModulePromise;
}

function initializeThemeSwitcher(): void {
  const container = document.getElementById('theme-switcher');
  if (!container) {
    console.warn('[Options] Theme switcher container not found');
    return;
  }

  if (themeSwitcher) {
    themeSwitcher.destroy();
    themeSwitcher = null;
  }

  themeSwitcher = new ThemeSwitcher(container);
  themeSwitcher.init();

  registerCleanup(() => {
    if (themeSwitcher) {
      themeSwitcher.destroy();
      themeSwitcher = null;
    }
  });
}

function initializeOptionsRuntime(): void {
  if (optionsController) {
    optionsController.dispose();
    optionsController = null;
  }
  if (formSectionRegistry) {
    formSectionRegistry.clear();
    formSectionRegistry = null;
  }

  const registry = new FormSectionRegistry();
  formSectionRegistry = registry;

  const formAdapter = createOptionsFormAdapter(registry);
  const controller = createOptionsController({
    persistence: chromeOptionsPersistence,
    formAdapter,
    formRegistry: registry,
    autoSaveDebounceMs: 400,
    onSaveError: (reason, error) => {
      if (reason === 'auto') {
        console.error('[options] Auto-save failed:', error);
      }
    },
    onSaveSuccess: (reason) => {
      if (reason !== 'auto') {
        return;
      }
      const source = consumePendingAutoSaveSource();
      if (!source) {
        return;
      }
      void showAutoSaveNotice(source);
    }
  });

  optionsController = controller;
  registerOptionsController(controller);

  registerCleanup(() => {
    if (optionsController === controller) {
      optionsController = null;
    }
    controller.dispose();
  });

  registerCleanup(() => {
    if (formSectionRegistry === registry) {
      formSectionRegistry = null;
    }
    registry.clear();
  });
}

function requireOptionsController(): OptionsController {
  if (!optionsController) {
    throw new Error('[Options] OptionsController is not initialized.');
  }
  return optionsController;
}

type CleanupFn = () => void;
const cleanupHandlers: CleanupFn[] = [];
let declarativeI18nController: PageI18nController | null = null;
let unloadCleanupRegistered = false;
let mountedShell: MountedOptionsShell | null = null;
const PRELOAD_SECTION_IDS = ['rest', 'routing', 'templates', 'yaml'];
async function ensureDeclarativeI18nController(): Promise<PageI18nController> {
  if (!declarativeI18nController) {
    const controller = createDefaultPageI18nController();
    await controller.load();

    if (typeof document !== 'undefined') {
      controller.mount(document);
    }

    declarativeI18nController = controller;
    setOptionsI18nContext(controller.getBinder(), controller.getCurrentResource());
  }

  return declarativeI18nController;
}

async function applyI18n(): Promise<void> {
  const controller = await ensureDeclarativeI18nController();
  setOptionsI18nContext(controller.getBinder(), controller.getCurrentResource());
}

export interface OptionsAppBootstrapDependencies {
  storage: StorageService;
}

let optionsAppBootstrapStorage: StorageService | null = null;

export function configureOptionsAppBootstrapStorage(storage: StorageService): void {
  optionsAppBootstrapStorage = storage;
}

function resolveOptionsAppBootstrapDependencies(
  dependencies?: Partial<OptionsAppBootstrapDependencies>
): OptionsAppBootstrapDependencies {
  if (dependencies?.storage) {
    optionsAppBootstrapStorage = dependencies.storage;
    return { storage: dependencies.storage };
  }

  if (!optionsAppBootstrapStorage) {
    throw new Error('[Options] StorageService is required for bootstrap.');
  }

  return {
    storage: optionsAppBootstrapStorage
  };
}

export async function bootstrapOptionsApp(
  dependencies?: Partial<OptionsAppBootstrapDependencies>
): Promise<void> {
  // 二次启动时先释放上一轮注册的 shell 与清理回调，防止热刷新残留状态。
  teardownMountedShell();
  disposeCleanupHandlers();
  ensureUnloadCleanup();
  const { storage } = resolveOptionsAppBootstrapDependencies(dependencies);
  configureAnalyticsConfigManager(storage);
  configureGlobalStateManagerStorage(storage);
  configureI18nStorage(storage.sync);
  await applyI18n();

  // ✅ Phase 3: 初始化主题切换器
  initializeThemeSwitcher();

  initializeOptionsRuntime();

  const registry = formSectionRegistry;
  if (!registry) {
    throw new Error('[Options] Failed to initialize FormSectionRegistry.');
  }

  const shell = await mountOptionsShell(registry);
  mountedShell = shell;
  registerCleanup(() => {
    teardownMountedShell();
  });
  const modalBindings = createOptionsModalBindings({
    prepareChangelogModal: () =>
      prepareOptionsChangelogModal({
        ensureDeclarativeI18nController
      })
  });
  void shell.preloadSections(PRELOAD_SECTION_IDS).catch((error) => {
    console.warn('[Options] Section preload failed:', error);
  });

  configureOptionsActions({
    stateManager: shell.stateManager,
    changeLanguage: handleLanguageChange,
    copyConfig: () => handleCopyConfig(),
    importConfig: () => handleImportConfig(),
    saveOptions: () => handleSave(),
    runDiagnostics: () => handleRunDiagnostics(),
    fixConfiguration: () => handleFix(),
    reloadDiagnostics: () => handleReload()
  });

  await refreshUIFromStorage();
  await ensureInitialSectionVisible(shell);
  await ensureAllSectionsMounted(shell);
  shell.configureUI({ modalBindings });

  // 处理 URL hash 锚点
  handleOptionsUrlHash({
    hash: window.location.hash,
    mountedShell: shell,
    revealFragmentShortcuts
  });
}

async function ensureInitialSectionVisible(shell: MountedOptionsShell): Promise<void> {
  const initialSection = shell.initialSection;
  await shell.mountSection(initialSection, { activate: true });
  const currentState = shell.stateManager.getState();
  if (currentState.activeSection !== initialSection) {
    await shell.navigateTo(initialSection);
  }
}

async function ensureAllSectionsMounted(shell: MountedOptionsShell): Promise<void> {
  await shell.mountAllSections();
}

type PrivacySectionActions = {
  refreshSettings: () => Promise<void>;
  saveSettings: (options?: { showInlineStatus?: boolean }) => Promise<void>;
};

type FragmentSectionActions = {
  highlightKeyboardShortcuts: () => boolean;
};

async function getMountedShellSection<T>(sectionId: string): Promise<T | null> {
  if (!mountedShell) {
    return null;
  }

  await mountedShell.mountSection(sectionId, { activate: false });
  return mountedShell.getMountedSection(sectionId) as T | null;
}

async function refreshMountedPrivacySection(): Promise<void> {
  const section = await getMountedShellSection<PrivacySectionActions>('privacy');
  await section?.refreshSettings();
}

async function saveMountedPrivacySection(options?: { showInlineStatus?: boolean }): Promise<void> {
  const section = await getMountedShellSection<PrivacySectionActions>('privacy');
  await section?.saveSettings(options);
}

function revealFragmentShortcuts(): boolean {
  const section = mountedShell?.getMountedSection('fragment') as
    | FragmentSectionActions
    | null
    | undefined;
  return section?.highlightKeyboardShortcuts() ?? false;
}

async function refreshUIFromStorage(): Promise<void> {
  const controller = requireOptionsController();
  const stored = await controller.loadInitialState();
  await applyOptionsSnapshot(stored);
}

async function handleLanguageChange(language: Language): Promise<Language> {
  const controller = await ensureDeclarativeI18nController();
  await controller.changeLanguage(language);
  setOptionsI18nContext(controller.getBinder(), controller.getCurrentResource());
  await refreshUIFromStorage();
  await refreshMountedPrivacySection();
  const resource = controller.getCurrentResource();
  return (resource?.language ?? language) as Language;
}

async function applyOptionsSnapshot(options: StoredOptions): Promise<void> {
  const controller = requireOptionsController();
  await controller.applyToForm(options);
  clearTransferMessage();

  const migrationNotice = consumeYamlMigrationNotice();
  if (migrationNotice) {
    const msgs = await getOptionsMessages();
    const text =
      msgs.yamlConfigMigrated ?? 'YAML field configuration has been migrated to the latest format.';
    showStatusMessage('success', { key: migrationNotice, text });
  }
}

export async function showAutoSaveNotice(source: string): Promise<void> {
  const msgs = await getOptionsMessages();
  if (source === 'yamlConfig') {
    const text = msgs.yamlConfigAutoSaved ?? 'YAML field configuration changes saved.';
    showStatusMessage('success', { key: 'yamlConfigAutoSaved', text });
    return;
  }

  if (source === 'templates') {
    const text = msgs.templatesAutoSaved ?? 'Template settings saved automatically.';
    showStatusMessage('success', { key: 'templatesAutoSaved', text });
  }
}

function registerCleanup(handler: CleanupFn | null | undefined): void {
  if (typeof handler === 'function') {
    cleanupHandlers.push(handler);
  }
}

function ensureUnloadCleanup(): void {
  if (unloadCleanupRegistered) {
    return;
  }

  const disposeOnUnload = (): void => {
    disposeCleanupHandlers();
  };

  window.addEventListener('beforeunload', disposeOnUnload);
  cleanupHandlers.push(() => {
    window.removeEventListener('beforeunload', disposeOnUnload);
  });

  unloadCleanupRegistered = true;
}

function disposeCleanupHandlers(): void {
  while (cleanupHandlers.length > 0) {
    const handler = cleanupHandlers.pop();
    try {
      handler?.();
    } catch (error) {
      console.error('[Options] 清理增强功能时出错:', error);
    }
  }
  unloadCleanupRegistered = false;
}

function teardownMountedShell(): void {
  if (!mountedShell) {
    return;
  }
  const currentShell = mountedShell;
  mountedShell = null;
  try {
    currentShell.cleanup();
  } catch (error) {
    console.error('[Options] 卸载 shell 时出错:', error);
  }
}

async function handleCopyConfig(): Promise<void> {
  clearTransferMessage();
  const msgs = await getOptionsMessages();

  try {
    const controller = requireOptionsController();
    const options = controller.readForm();
    const payload = normalizeOptionsForTransfer(options);
    const analyticsPayload = await exportAnalyticsTransferPayload();
    const transferPayload: ConfigTransferPayload = {
      version: 1,
      options: payload
    };
    if (analyticsPayload) {
      transferPayload.analytics = analyticsPayload;
    }
    await copyOptionsToClipboard(transferPayload);
    showTransferMessage('success', { key: 'copyConfigSuccess', text: msgs.copyConfigSuccess });
  } catch (error) {
    showTransferMessage('error', formatOptionsError(error, msgs));
  }
}

async function handleImportConfig(): Promise<void> {
  clearTransferMessage();
  const msgs = await getOptionsMessages();

  try {
    const controller = requireOptionsController();
    const raw = await readConfigTextFromClipboard();
    const parsed = parseConfigInput(raw);
    const normalized = normalizeOptionsForTransfer(parsed.options);
    await applyOptionsSnapshot(normalized);
    await controller.saveSnapshot({ reason: 'import', draft: normalized });
    await applyAnalyticsTransferPayload(parsed.analytics);
    await refreshMountedPrivacySection();

    showTransferMessage('success', { key: 'importSuccess', text: msgs.importSuccess });
    showStatusMessage('success', { key: 'importSuccess', text: msgs.importSuccess });
  } catch (error) {
    showTransferMessage('error', formatOptionsError(error, msgs));
  }
}

async function handleSave(): Promise<void> {
  const msgs = await getOptionsMessages();

  try {
    const controller = requireOptionsController();
    await controller.saveSnapshot({ reason: 'manual' });
    await saveMountedPrivacySection({ showInlineStatus: false });
    showStatusMessage('success', { key: 'saveSuccess', text: msgs.saveSuccess });
  } catch (error) {
    showStatusMessage('error', `${msgs.saveFailed}: ${formatOptionsError(error, msgs)}`);
  }
}

async function handleFix(): Promise<void> {
  const { fixConfiguration } = await loadDiagnosticsModule();
  await fixConfiguration(refreshUIFromStorage);
}

async function handleReload(): Promise<void> {
  await refreshUIFromStorage();
  await handleRunDiagnostics();
}

async function handleRunDiagnostics(): Promise<void> {
  const { runDiagnostics } = await loadDiagnosticsModule();
  await runDiagnostics();
}
