import type { StorageService } from '@platform/interfaces/storage';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { CompleteOptions } from '@shared/types/options';
import type { Messages } from '@i18n';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { OptionsController } from './optionsController';
import { createProductionStitchPersistence } from './productionStitchPersistence';
import { createProductionStitchStorageController } from './productionStitchStorageController';
import { createProductionStitchWidgetHost } from './productionStitchWidgetHost';
import { mergePartialIntoDraft } from './productionStitchShellState';

interface ProductionStitchShellRuntimeServicesOptions {
  controller: OptionsController;
  optionsRepository: Pick<IOptionsRepository, 'get' | 'set' | 'onChange'>;
  messagingRepository: Pick<IMessagingRepository, 'send' | 'onMessage'>;
  storage?: StorageService;
  now?: () => number;
  getAppData: () => PreviewContent;
  getCurrentMessages: () => Messages | null;
  getDraft: () => CompleteOptions;
  getState: () => PreviewStoreState;
  setAppData: (appData: PreviewContent) => void;
  setConnectionNotice: (notice: PreviewContent['storage']['connectionNotice']) => void;
  setDraft: (draft: CompleteOptions) => void;
  setDomainMappingRows: (entries: Array<[string, string]>) => void;
  setMaintenanceLog: (log: PreviewContent['maintenanceLog']) => void;
  setState: (state: PreviewStoreState) => void;
  getConnectionNotice: () => PreviewContent['storage']['connectionNotice'] | undefined;
  refreshAppData: () => void;
  render: () => void;
  scheduleDraftSave: () => void;
}

export function createProductionStitchShellRuntimeServices(
  options: ProductionStitchShellRuntimeServicesOptions
) {
  const { controller, messagingRepository, now, optionsRepository, storage } = options;
  const storageController = createProductionStitchStorageController({
    getConnectionNotice: () => options.getConnectionNotice(),
    getDraft: () => options.getDraft(),
    getMessagingRepository: () => messagingRepository,
    getMessages: () => options.getCurrentMessages(),
    getState: () => options.getState(),
    setConnectionNotice: (notice) => options.setConnectionNotice(notice),
    refreshAppData: () => options.refreshAppData(),
    render: () => options.render(),
    scheduleDraftSave: () => options.scheduleDraftSave()
  });

  const widgetHost = createProductionStitchWidgetHost({
    getDraft: () => options.getDraft(),
    getState: () => options.getState(),
    getMessages: () => options.getCurrentMessages(),
    ensureVaultRouter: () => storageController.ensureVaultRouter(),
    mergePartialIntoDraft: (partial) =>
      mergePartialIntoDraft(options.getDraft(), options.setDomainMappingRows, partial),
    syncDefaultVaultFromRest: () => storageController.syncDefaultVaultFromRest(),
    refreshAppData: () => options.refreshAppData(),
    scheduleDraftSave: () => options.scheduleDraftSave()
  });

  const persistence = createProductionStitchPersistence({
    controller,
    optionsRepository,
    messagingRepository,
    ...(storage ? { storage } : {}),
    ...(now ? { now } : {}),
    getAppData: () => options.getAppData(),
    getCurrentMessages: () => options.getCurrentMessages(),
    getDraft: () => options.getDraft(),
    getState: () => options.getState(),
    setAppData: (appData) => options.setAppData(appData),
    setDraft: (draft) => options.setDraft(draft),
    setMaintenanceLog: (log) => options.setMaintenanceLog(log),
    setState: (state) => options.setState(state),
    collectDraftWithWidgets: () => widgetHost.collectDraftWithWidgets(),
    refreshAppData: () => options.refreshAppData(),
    render: () => options.render(),
    syncDefaultVaultFromRest: () => storageController.syncDefaultVaultFromRest()
  });

  return {
    persistence,
    storageController,
    widgetHost
  };
}
