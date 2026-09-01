import {
  configureI18nStorage,
  createDefaultPageI18nController,
  type Language,
  type PageI18nController
} from '@i18n';
import { configureAnalyticsConfigManager } from '../../shared/errors/analytics/analyticsConfig';
import { configureGlobalStateManagerStorage } from '../../shared/state/globalStateManager';
import { DI_TOKENS } from '../../shared/di/tokens';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import type { IOptionsRepository, IMessagingRepository } from '../../shared/repositories';
import type { StoredOptions } from '../../shared/types/options';
import type { RuntimeService } from '../../platform/interfaces/runtime';
import type { StorageService } from '../../platform/interfaces/storage';
import { showStatusMessage } from '../components/messages';
import { createOptionsFormAdapter } from '../components/optionsFormAdapter';
import { chromeOptionsPersistence } from '../services/persistence';
import { consumeYamlMigrationNotice } from '../state/optionsStore';
import { createOptionsController, type OptionsController } from './optionsController';
import {
  consumePendingAutoSaveSource,
  registerOptionsController
} from './optionsControllerContext';
import { getOptionsMessages, setOptionsI18nContext } from './i18nContext';
import {
  mountProductionStitchShell,
  type MountedProductionStitchShell
} from './productionStitchShell';
import { trackInitialOptionsTelemetry } from './productionStitchTelemetry';
import type { UsageStatsClientLike } from './usage-dashboard/usageStatsClient';

export interface OptionsAppBootstrapDependencies {
  storage: StorageService;
  runtime?: Pick<RuntimeService, 'getURL' | 'getBrowserTarget'>;
  usageStatsClient?: UsageStatsClientLike;
}

type CleanupFn = () => void | Promise<void>;
const cleanupHandlers: CleanupFn[] = [];
let optionsAppBootstrapStorage: StorageService | null = null;
let declarativeI18nController: PageI18nController | null = null;
let unloadCleanupRegistered = false;
let optionsController: OptionsController | null = null;
let mountedShell: MountedProductionStitchShell | null = null;

export function configureOptionsAppBootstrapStorage(storage: StorageService): void {
  optionsAppBootstrapStorage = storage;
}

function resolveOptionsAppBootstrapDependencies(
  dependencies?: Partial<OptionsAppBootstrapDependencies>
): OptionsAppBootstrapDependencies {
  if (dependencies?.storage) {
    optionsAppBootstrapStorage = dependencies.storage;
    return {
      storage: dependencies.storage,
      ...(dependencies.runtime ? { runtime: dependencies.runtime } : {}),
      ...(dependencies.usageStatsClient ? { usageStatsClient: dependencies.usageStatsClient } : {})
    };
  }

  if (!optionsAppBootstrapStorage) {
    throw new Error('[Options] StorageService is required for bootstrap.');
  }

  return {
    storage: optionsAppBootstrapStorage
  };
}

async function ensureDeclarativeI18nController(): Promise<PageI18nController> {
  if (!declarativeI18nController) {
    const controller = createDefaultPageI18nController();
    await controller.load();
    if (typeof document !== 'undefined') {
      controller.mount(document);
    }
    declarativeI18nController = controller;
  }

  const resource = declarativeI18nController.getCurrentResource();
  setOptionsI18nContext(declarativeI18nController.getBinder(), resource);
  return declarativeI18nController;
}

async function initializeOptionsController(): Promise<OptionsController> {
  if (optionsController) {
    await optionsController.dispose();
    optionsController = null;
  }

  const controller = createOptionsController({
    persistence: chromeOptionsPersistence,
    formAdapter: createOptionsFormAdapter(),
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
      if (source) {
        void showAutoSaveNotice(source);
      }
    }
  });

  optionsController = controller;
  registerOptionsController(controller);
  registerCleanup(async () => {
    await controller.dispose();
    if (optionsController === controller) {
      optionsController = null;
    }
  });
  return controller;
}

export async function bootstrapOptionsApp(
  dependencies?: Partial<OptionsAppBootstrapDependencies>
): Promise<void> {
  await disposeCleanupHandlers();
  teardownMountedShell();
  ensureUnloadCleanup();

  const { storage, runtime, usageStatsClient } =
    resolveOptionsAppBootstrapDependencies(dependencies);
  configureAnalyticsConfigManager(storage);
  configureGlobalStateManagerStorage(storage);
  configureI18nStorage(storage.sync);

  const i18nController = await ensureDeclarativeI18nController();
  const resource = i18nController.getCurrentResource();
  const controller = await initializeOptionsController();
  const stored = await controller.loadInitialState();
  const { getFooterMeta, getFooterView, getSettingsView, previewContent } =
    await import('./productionStitchAssets');

  mountedShell = mountProductionStitchShell({
    controller,
    initialOptions: stored,
    getFooterMeta,
    getFooterView,
    getSettingsView,
    previewContent,
    messages: resource?.messages ?? null,
    language: (resource?.language ?? 'zh-CN') as Language,
    ...(runtime ? { runtime } : {}),
    ...(usageStatsClient ? { usageStatsClient } : {}),
    storage,
    optionsRepository: resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository),
    messagingRepository: resolveRepository<IMessagingRepository>(DI_TOKENS.IMessagingRepository),
    changeLanguage: async (language) => {
      await i18nController.changeLanguage(language);
      const nextResource = i18nController.getCurrentResource();
      setOptionsI18nContext(i18nController.getBinder(), nextResource);
      return {
        messages: nextResource?.messages ?? null,
        language: (nextResource?.language ?? language) as Language
      };
    }
  });
  registerCleanup(() => {
    teardownMountedShell();
  });

  await applyOptionsSnapshot(stored);
  await trackInitialOptionsTelemetry();
}

async function applyOptionsSnapshot(options: StoredOptions): Promise<void> {
  mountedShell?.refreshOptions(options);

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
  const handoffOnPageExit = (): void => {
    void optionsController?.flushPendingAutoSave().catch((error) => {
      console.error('[Options] page-exit durability handoff failed:', error);
    });
  };

  window.addEventListener('pagehide', handoffOnPageExit);
  window.addEventListener('beforeunload', handoffOnPageExit);
  cleanupHandlers.push(() => {
    window.removeEventListener('pagehide', handoffOnPageExit);
    window.removeEventListener('beforeunload', handoffOnPageExit);
  });
  unloadCleanupRegistered = true;
}
async function disposeCleanupHandlers(): Promise<void> {
  await optionsController?.flushPendingAutoSave();
  while (cleanupHandlers.length > 0) {
    const handler = cleanupHandlers[cleanupHandlers.length - 1];
    try {
      await handler?.();
      cleanupHandlers.pop();
    } catch (error) {
      console.error('[Options] cleanup failed:', error);
      throw error;
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
    console.error('[Options] Stitch shell cleanup failed:', error);
  }
}
