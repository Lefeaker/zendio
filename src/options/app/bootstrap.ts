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
import { configureOptionsActions } from './optionsActions';
import { configureAnalyticsConfigManager } from '../../shared/errors/analytics/analyticsConfig';
import { configureGlobalStateManagerStorage } from '../../shared/state/globalStateManager';
import type { StorageService } from '../../platform/interfaces/storage';
import {
  mountProductionSchemaShell,
  type MountedProductionSchemaShell
} from './productionSchemaShell';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';
import type {
  IOptionsRepository,
  IMessagingRepository,
  IYamlRepository
} from '../../shared/repositories';

let optionsController: OptionsController | null = null;
let diagnosticsModulePromise: Promise<typeof import('../components/diagnostics')> | null = null;
let themeControlObserver: MutationObserver | null = null;

type OptionsTheme = 'light' | 'dark';

const OPTIONS_THEME_STORAGE_KEY = 'aob-theme';
const THEME_OPTION_SELECTOR = '.schema-settings-theme-option';

function loadDiagnosticsModule(): Promise<typeof import('../components/diagnostics')> {
  if (!diagnosticsModulePromise) {
    diagnosticsModulePromise = import('../components/diagnostics');
  }
  return diagnosticsModulePromise;
}

function readPreferredTheme(): OptionsTheme {
  try {
    const saved = localStorage.getItem(OPTIONS_THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
  } catch (error) {
    console.warn('[Options] Failed to read theme preference:', error);
  }

  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return 'light';
}

function getCurrentTheme(): OptionsTheme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function persistTheme(theme: OptionsTheme): void {
  try {
    localStorage.setItem(OPTIONS_THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn('[Options] Failed to persist theme preference:', error);
  }
}

function applyDocumentTheme(
  theme: OptionsTheme,
  options: { animate?: boolean; persist?: boolean } = {}
): void {
  const html = document.documentElement;
  if (options.animate) {
    html.classList.add('theme-transitioning');
    setTimeout(() => {
      html.classList.remove('theme-transitioning');
    }, 300);
  }

  html.setAttribute('data-theme', theme);
  if (options.persist) {
    persistTheme(theme);
  }

  window.dispatchEvent(
    new CustomEvent('theme-changed', {
      detail: { theme }
    })
  );
}

function syncEmbeddedThemeControl(): void {
  const root = document.getElementById('optionsShellRoot');
  if (!root) {
    return;
  }

  const activeTheme = getCurrentTheme();
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(THEME_OPTION_SELECTOR));
  buttons.forEach((button, index) => {
    const theme = index === 0 ? 'dark' : 'light';
    const isActive = theme === activeTheme;
    button.dataset.themeMode = theme;
    button.classList.toggle('is-active', isActive);
    button.classList.toggle('primary', isActive);
    button.classList.toggle('ghost', !isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function handleEmbeddedThemeClick(event: Event): void {
  if (!(event.target instanceof Element)) {
    return;
  }

  const button = event.target.closest<HTMLButtonElement>(THEME_OPTION_SELECTOR);
  if (!button) {
    return;
  }

  const theme = button.dataset.themeMode === 'light' ? 'light' : 'dark';
  if (theme === getCurrentTheme()) {
    syncEmbeddedThemeControl();
    return;
  }

  applyDocumentTheme(theme, { animate: true, persist: true });
  syncEmbeddedThemeControl();
}

function initializeEmbeddedThemeControl(): void {
  const root = document.getElementById('optionsShellRoot');
  if (!root) {
    return;
  }

  root.addEventListener('click', handleEmbeddedThemeClick);
  themeControlObserver?.disconnect();
  themeControlObserver = new MutationObserver(() => {
    syncEmbeddedThemeControl();
  });
  themeControlObserver.observe(root, {
    childList: true,
    subtree: true
  });
  syncEmbeddedThemeControl();

  registerCleanup(() => {
    root.removeEventListener('click', handleEmbeddedThemeClick);
    themeControlObserver?.disconnect();
    themeControlObserver = null;
  });
}

function createSchemaOptionsControllerProxy(controller: OptionsController): OptionsController {
  return new Proxy(controller, {
    get(target, property, receiver) {
      if (property === 'scheduleAutoSave') {
        return (collect?: unknown) => {
          const shell = mountedProductionShell;
          if (shell) {
            return target.scheduleAutoSave(() => shell.collectDraft());
          }
          return target.scheduleAutoSave(collect as never);
        };
      }
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value === 'function') {
        return (...args: unknown[]) =>
          Reflect.apply(value as (...callArgs: unknown[]) => unknown, target, args);
      }
      return value;
    }
  });
}

function initializeOptionsRuntime(): void {
  if (optionsController) {
    optionsController.dispose();
    optionsController = null;
  }

  const formAdapter = createOptionsFormAdapter();
  const controller = createOptionsController({
    persistence: chromeOptionsPersistence,
    formAdapter,
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
  registerOptionsController(createSchemaOptionsControllerProxy(controller));

  registerCleanup(() => {
    if (optionsController === controller) {
      optionsController = null;
    }
    controller.dispose();
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
let mountedProductionShell: MountedProductionSchemaShell | null = null;
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
  teardownMountedProductionShell();
  disposeCleanupHandlers();
  ensureUnloadCleanup();
  const { storage } = resolveOptionsAppBootstrapDependencies(dependencies);
  configureAnalyticsConfigManager(storage);
  configureGlobalStateManagerStorage(storage);
  configureI18nStorage(storage.sync);
  await applyI18n();
  applyDocumentTheme(readPreferredTheme(), { persist: false });

  initializeOptionsRuntime();

  const currentResource = (await ensureDeclarativeI18nController()).getCurrentResource();
  configureOptionsActions({
    stateManager: null,
    changeLanguage: handleLanguageChange,
    copyConfig: () => handleCopyConfig(),
    importConfig: () => handleImportConfig(),
    saveOptions: () => handleSave(),
    runDiagnostics: () => handleRunDiagnostics(),
    fixConfiguration: () => handleFix(),
    reloadDiagnostics: () => handleReload()
  });

  const container = document.getElementById('optionsShellRoot');
  if (!container) {
    throw new Error('[Options] Required #optionsShellRoot container is missing.');
  }

  const controller = requireOptionsController();
  await controller.loadInitialState();
  const optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  const messagingRepository = resolveRepository<IMessagingRepository>(
    DI_TOKENS.IMessagingRepository
  );
  const yamlRepository = resolveRepository<IYamlRepository>(DI_TOKENS.IYamlRepository);

  mountedProductionShell = mountProductionSchemaShell({
    container,
    controller,
    storage,
    optionsRepository,
    messagingRepository,
    yamlRepository,
    messages: currentResource?.messages ?? null,
    language: (currentResource?.language ?? 'en') as Language,
    onChangeLanguage: handleLanguageChange,
    onCopyConfig: handleCopyConfig,
    onImportConfig: handleImportConfig,
    onSave: handleSave,
    onRunDiagnostics: handleRunDiagnostics,
    onFixConfiguration: handleFix,
    onReloadDiagnostics: handleReload
  });
  initializeEmbeddedThemeControl();

  registerCleanup(() => {
    mountedProductionShell?.cleanup();
    mountedProductionShell = null;
  });
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
  const resource = controller.getCurrentResource();
  const resolvedLanguage = (resource?.language ?? language) as Language;
  if (mountedProductionShell) {
    mountedProductionShell.setMessages(resource?.messages ?? null, resolvedLanguage);
    mountedProductionShell.refreshOptions(requireOptionsController().readForm());
  }
  return resolvedLanguage;
}

async function applyOptionsSnapshot(options: StoredOptions): Promise<void> {
  const controller = requireOptionsController();
  controller.setSnapshot(options);
  mountedProductionShell?.refreshOptions(controller.readForm());
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

function teardownMountedProductionShell(): void {
  if (!mountedProductionShell) {
    return;
  }
  const shell = mountedProductionShell;
  mountedProductionShell = null;
  try {
    shell.cleanup();
  } catch (error) {
    console.error('[Options] 卸载 production schema shell 时出错:', error);
  }
}

function collectCurrentOptionsDraft(): StoredOptions {
  if (mountedProductionShell) {
    return mountedProductionShell.collectDraft() as StoredOptions;
  }
  return requireOptionsController().readForm() as StoredOptions;
}

async function handleCopyConfig(): Promise<void> {
  clearTransferMessage();
  const msgs = await getOptionsMessages();

  try {
    const options = collectCurrentOptionsDraft();
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
    await controller.saveSnapshot({ reason: 'manual', draft: collectCurrentOptionsDraft() });
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
