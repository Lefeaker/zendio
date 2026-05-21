import type { IMessagingRepository } from '@shared/repositories';
import type { CompleteOptions } from '@shared/types/options';
import type { ConnectionTestResult } from '@shared/types/connection';
import type { VaultRouterConfig } from '@shared/types/vault';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import { createProductionStitchStorageFeedback } from './productionStitchStorageFeedback';
import { createProductionStitchStorageLoad } from './productionStitchStorageLoad';
import { createProductionStitchStorageSave } from './productionStitchStorageSave';
import { createProductionStitchStorageSubscriptions } from './productionStitchStorageSubscriptions';

export interface ProductionStitchStorageControllerOptions {
  getConnectionNotice(): PreviewContent['storage']['connectionNotice'] | undefined;
  getDraft(): CompleteOptions;
  getMessagingRepository(): Pick<IMessagingRepository, 'send' | 'onMessage'>;
  getState(): PreviewStoreState;
  setConnectionNotice(notice: PreviewContent['storage']['connectionNotice'] | undefined): void;
  refreshAppData(): void;
  render(): void;
  scheduleDraftSave(): void;
}

export interface ProductionStitchStorageController {
  activateVaultLocalFolder(index: number): Promise<void>;
  applyConnectionNotice(result: ConnectionTestResult): void;
  chooseVaultLocalFolder(index: number): Promise<void>;
  clearVaultLocalFolder(index: number): void;
  ensureVaultRouter(): VaultRouterConfig;
  runVaultListConnectionTest(): Promise<ConnectionTestResult>;
  syncDefaultVaultFromRest(): void;
  syncRoutingRulesToDraft(): void;
  updateVaultField(index: number, field: string, value: unknown): void;
}

export function createProductionStitchStorageController(
  options: ProductionStitchStorageControllerOptions
): ProductionStitchStorageController {
  const load = createProductionStitchStorageLoad(options);
  const save = createProductionStitchStorageSave(options, load);
  const subscriptions = createProductionStitchStorageSubscriptions(options, load);
  const feedback = createProductionStitchStorageFeedback(options, load);

  return {
    activateVaultLocalFolder: subscriptions.activateVaultLocalFolder,
    applyConnectionNotice: feedback.applyConnectionNotice,
    chooseVaultLocalFolder: subscriptions.chooseVaultLocalFolder,
    clearVaultLocalFolder: subscriptions.clearVaultLocalFolder,
    ensureVaultRouter: load.ensureVaultRouter,
    runVaultListConnectionTest: feedback.runVaultListConnectionTest,
    syncDefaultVaultFromRest: load.syncDefaultVaultFromRest,
    syncRoutingRulesToDraft: save.syncRoutingRulesToDraft,
    updateVaultField: save.updateVaultField
  };
}
