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
  getAppData(): PreviewContent;
  getCurrentMessages(): Messages | null;
  getDraft(): CompleteOptions;
  getState(): PreviewStoreState;
  setAppData(appData: PreviewContent): void;
  setConnectionNotice(notice: PreviewContent['storage']['connectionNotice']): void;
  setDraft(draft: CompleteOptions): void;
  setDomainMappingRows(entries: Array<[string, string]>): void;
  setMaintenanceLog(log: PreviewContent['maintenanceLog']): void;
  setState(state: PreviewStoreState): void;
  getConnectionNotice(): PreviewContent['storage']['connectionNotice'] | undefined;
  refreshAppData(): void;
  render(): void;
  scheduleDraftSave(): void;
}

export function createProductionStitchShellRuntimeServices(
  options: ProductionStitchShellRuntimeServicesOptions
) {
  const {
    controller,
    getAppData,
    getConnectionNotice,
    getCurrentMessages,
    getDraft,
    getState,
    messagingRepository,
    now,
    optionsRepository,
    refreshAppData,
    render,
    scheduleDraftSave,
    setAppData,
    setConnectionNotice,
    setDomainMappingRows,
    setDraft,
    setMaintenanceLog,
    setState,
    storage
  } = options;
  const storageController = createProductionStitchStorageController({
    getConnectionNotice,
    getDraft,
    getMessagingRepository: () => messagingRepository,
    getState,
    setConnectionNotice,
    refreshAppData,
    render,
    scheduleDraftSave
  });

  const widgetHost = createProductionStitchWidgetHost({
    getDraft,
    getState,
    getMessages: getCurrentMessages,
    ensureVaultRouter: () => storageController.ensureVaultRouter(),
    mergePartialIntoDraft: (partial) =>
      mergePartialIntoDraft(getDraft(), setDomainMappingRows, partial),
    syncDefaultVaultFromRest: () => storageController.syncDefaultVaultFromRest(),
    refreshAppData,
    scheduleDraftSave
  });

  const persistence = createProductionStitchPersistence({
    controller,
    optionsRepository,
    messagingRepository,
    ...(storage ? { storage } : {}),
    ...(now ? { now } : {}),
    getAppData,
    getCurrentMessages,
    getDraft,
    getState,
    setAppData,
    setDraft,
    setMaintenanceLog,
    setState,
    collectDraftWithWidgets: () => widgetHost.collectDraftWithWidgets(),
    refreshAppData,
    render,
    syncDefaultVaultFromRest: () => storageController.syncDefaultVaultFromRest()
  });

  return {
    persistence,
    storageController,
    widgetHost
  };
}
