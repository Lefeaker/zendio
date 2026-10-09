import type { RuntimeService } from '../../platform/interfaces/runtime';
import type { StorageAreaService } from '../../platform/interfaces/storage';
import {
  crossesLearningUpdate,
  LEARNING_UPDATE_AVAILABLE_KEY
} from '../../shared/learningUpdateNotice';

export function registerLearningUpdateNotice(
  runtime: Pick<RuntimeService, 'onInstalled' | 'getManifest'>,
  storage: Pick<StorageAreaService, 'set'>
): void {
  runtime.onInstalled((details) => {
    if (
      details.reason !== 'update' ||
      !crossesLearningUpdate(details.previousVersion, runtime.getManifest?.()?.version)
    )
      return;
    // Never reset the separate acknowledgement on reload or a later upgrade.
    void storage.set(LEARNING_UPDATE_AVAILABLE_KEY, true).catch((error) => {
      console.warn('[learning] Failed to record tutorial update:', error);
    });
  });
}
