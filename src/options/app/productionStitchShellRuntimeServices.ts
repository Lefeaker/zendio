import type { StorageService } from '@platform/interfaces/storage';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { CompleteOptions } from '@shared/types/options';
import type { Messages } from '@i18n';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { OptionsController } from './optionsController';
import { createProductionStitchStorageController } from './productionStitchStorageController';
import { createProductionStitchWidgetHost } from './productionStitchWidgetHost';
import { mergePartialIntoDraft } from './productionStitchShellState';
import type { UsageStatsClientLike } from './usage-dashboard/usageStatsClient';
import type { SectionInvalidationRequest } from '@ui/stitch-runtime/render/sectionInvalidation';
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
  setMaintenanceLog: (log: PreviewContent['maintenanceLog']) => void;
  getConnectionNotice: () => PreviewContent['storage']['connectionNotice'] | undefined;
  refreshAppData: () => void;
  render: (scopes: SectionInvalidationRequest) => void;
  scheduleDraftSave: () => void;
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

  const widgetHost = createProductionStitchWidgetHost({
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
    setMaintenanceLog: options.setMaintenanceLog,
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
