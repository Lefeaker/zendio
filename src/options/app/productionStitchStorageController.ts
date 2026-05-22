import { createProductionStitchStorageFeedback } from './productionStitchStorageFeedback';
import { createProductionStitchStorageLoad } from './productionStitchStorageLoad';
import { createProductionStitchStorageSave } from './productionStitchStorageSave';
import { createProductionStitchStorageSubscriptions } from './productionStitchStorageSubscriptions';
import type {
  ProductionStitchStorageController,
  ProductionStitchStorageControllerOptions
} from './productionStitchStorageTypes';

export type {
  ProductionStitchStorageController,
  ProductionStitchStorageControllerOptions
} from './productionStitchStorageTypes';

export function createProductionStitchStorageController(
  options: ProductionStitchStorageControllerOptions
): ProductionStitchStorageController {
  const load = createProductionStitchStorageLoad(options);
  const save = createProductionStitchStorageSave(options, load);
  const subscriptions = createProductionStitchStorageSubscriptions(options, load);
  const feedback = createProductionStitchStorageFeedback(options, load);

  return {
    activateVaultLocalFolder: (index) => subscriptions.activateVaultLocalFolder(index),
    applyConnectionNotice: (result) => feedback.applyConnectionNotice(result),
    chooseVaultLocalFolder: (index) => subscriptions.chooseVaultLocalFolder(index),
    clearVaultLocalFolder: (index) => subscriptions.clearVaultLocalFolder(index),
    ensureVaultRouter: () => load.ensureVaultRouter(),
    runVaultListConnectionTest: () => feedback.runVaultListConnectionTest(),
    syncDefaultVaultFromRest: () => load.syncDefaultVaultFromRest(),
    syncRoutingRulesToDraft: () => save.syncRoutingRulesToDraft(),
    updateVaultField: (index, field, value) => save.updateVaultField(index, field, value)
  };
}
