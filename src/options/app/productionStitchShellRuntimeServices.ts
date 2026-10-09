import type { StorageService } from '@platform/interfaces/storage';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { CompleteOptions } from '@shared/types/options';
import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { OptionsController } from './optionsController';
import { createProductionStitchStorageController } from './productionStitchStorageController';
import { createProductionStitchWidgetHost } from './productionStitchWidgetHost';
import { mergePartialIntoDraft } from './productionStitchShellState';
import type { UsageStatsClientLike } from './usage-dashboard/usageStatsClient';
import type { SectionInvalidationRequest } from '@ui/stitch-runtime/render/sectionInvalidation';
import type { ProductionMaintenanceActionNotice } from './productionStitchMaintenanceState';
import type { createAiConfiguration } from '../ai-configuration/feature';
import { AiConfigInputError } from '../ai-configuration/types';
import { mergeOptions } from '@shared/config/optionsMerger';
const { createProductionStitchPersistence } = await import('./productionStitchPersistence');

interface ProductionStitchShellRuntimeServicesOptions {
  controller: OptionsController;
  optionsRepository: Pick<IOptionsRepository, 'get' | 'patch' | 'replace' | 'onChange'>;
  messagingRepository: Pick<IMessagingRepository, 'send' | 'onMessage'>;
  usageStatsClient: UsageStatsClientLike;
  storage?: StorageService;
  now?: () => number;
  getAppData: () => PreviewContent;
  getCurrentMessages: () => Messages | null;
  getDraft: () => CompleteOptions;
  getState: () => PreviewStoreState;
  isActive: () => boolean;
  resetOptions: (options: CompleteOptions) => void;
  setAppData: (appData: PreviewContent) => void;
  setConnectionNotice: (notice: PreviewContent['storage']['connectionNotice']) => void;
  setDomainMappingRows: (entries: Array<[string, string]>) => void;
  setMaintenanceActionNotice: (notice: ProductionMaintenanceActionNotice) => void;
  getConnectionNotice: () => PreviewContent['storage']['connectionNotice'] | undefined;
  refreshAppData: () => void;
  render: (scopes: SectionInvalidationRequest) => void;
  scheduleDraftSave: () => void;
  browserTarget?: string;
}

export function createProductionStitchShellRuntimeServices(
  options: ProductionStitchShellRuntimeServicesOptions
) {
  const { controller, messagingRepository, now, optionsRepository, usageStatsClient } = options;
  const storageController = createProductionStitchStorageController({
    getConnectionNotice: options.getConnectionNotice,
    getDraft: options.getDraft,
    getMessagingRepository: () => messagingRepository,
    getMessages: options.getCurrentMessages,
    getState: options.getState,
    isActive: options.isActive,
    setConnectionNotice: options.setConnectionNotice,
    refreshAppData: options.refreshAppData,
    render: options.render,
    scheduleDraftSave: options.scheduleDraftSave
  });

  let aiConfiguration: Promise<ReturnType<typeof createAiConfiguration>> | undefined;
  const loadAiConfiguration = () =>
    (aiConfiguration ??= import('../ai-configuration/feature').then(({ createAiConfiguration }) => {
      return createAiConfiguration({
        repository: optionsRepository,
        getCurrent: () => mergeOptions(controller.getSnapshot() ?? options.getDraft()),
        getMessages: options.getCurrentMessages,
        browser: options.browserTarget ?? 'chrome',
        isActive: options.isActive,
        beforeApply: async (review) => {
          await controller.flushPendingAutoSave();
          if (
            review.patches.some(({ path }) => path[0] === 'yamlConfig') &&
            widgetHost.getRenderProtectionKeys().includes('yamlConfig')
          )
            throw new AiConfigInputError('yamlFieldSaveBlockedWarning');
        }
      });
    }));
  const widgetHost = createProductionStitchWidgetHost({
    mountAiConfiguration: (host) => {
      host.setAttribute('aria-busy', 'true');
      void loadAiConfiguration()
        .then((feature) => {
          if (options.isActive() && host.isConnected) feature.mount(host);
        })
        .catch((error) => {
          aiConfiguration = undefined;
          if (options.isActive() && host.isConnected)
            host.textContent = (
              options.getCurrentMessages() ?? DEFAULT_RUNTIME_MESSAGES
            ).aiConfigLoadFailed;
          console.warn('[Options] Failed to load AI configuration:', error);
        })
        .finally(() => host.removeAttribute('aria-busy'));
    },
    getDraft: options.getDraft,
    getState: options.getState,
    getMessages: options.getCurrentMessages,
    ensureVaultRouter: () => storageController.ensureVaultRouter(),
    mergePartialIntoDraft: (partial) =>
      mergePartialIntoDraft(options.getDraft(), options.setDomainMappingRows, partial),
    syncDefaultVaultFromRest: () => storageController.syncDefaultVaultFromRest(),
    refreshAppData: options.refreshAppData,
    scheduleDraftSave: options.scheduleDraftSave
  });

  const persistence = createProductionStitchPersistence({
    controller,
    optionsRepository,
    messagingRepository,
    usageStatsClient,
    ...(now ? { now } : {}),
    getAppData: options.getAppData,
    getCurrentMessages: options.getCurrentMessages,
    getDraft: options.getDraft,
    getState: options.getState,
    isActive: options.isActive,
    installImportedOptions: (imported) => {
      options.resetOptions(imported);
      widgetHost.resetDirty();
    },
    setAppData: options.setAppData,
    setMaintenanceActionNotice: options.setMaintenanceActionNotice,
    collectDraftWithWidgets: () => widgetHost.collectDraftWithWidgets(),
    refreshAppData: options.refreshAppData,
    render: options.render,
    syncDefaultVaultFromRest: () => storageController.syncDefaultVaultFromRest()
  });

  return {
    persistence,
    storageController,
    widgetHost
  };
}
