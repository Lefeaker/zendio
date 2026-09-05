import { getPlatformServices } from '../platform';
import { registerRepositories } from '../shared/di/serviceRegistry';
import { startBackgroundRuntime } from './backgroundStartup';
import { createDefaultTrialLifecycleDependencies, registerTrialLifecycle } from './trialLifecycle';
import { ChromeOptionsRepository } from '../infrastructure/repositories/ChromeOptionsRepository';
import { snapshotPlainStructuredData } from '../shared/config/losslessObjectBoundary';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '../shared/config/losslessObjectBoundaryTypes';
import { OptionsMutationError } from '../shared/types/optionsMutationMessages';
import {
  createBackgroundOptionsRepository,
  createOptionsMutationCoordinator
} from './services/optionsMutationCoordinator';
import { DeviceLocalVaultCleanupJournal } from '../shared/config/deviceLocalVaultCleanupJournal';
import { createDeviceLocalPrivacyCommitter } from './services/deviceLocalPrivacyCommitter';

function rawObject(value: PlainStructuredValue | null): PlainStructuredObject {
  if (value === null) return {};
  const snapshot = snapshotPlainStructuredData(value);
  if (
    !snapshot.ok ||
    typeof snapshot.value !== 'object' ||
    snapshot.value === null ||
    Array.isArray(snapshot.value)
  ) {
    throw new OptionsMutationError('OPTIONS_MUTATION_REJECTED');
  }
  return snapshot.value;
}

const platformServices = getPlatformServices();
const optionsStorageRepository = new ChromeOptionsRepository(platformServices.storage);
const deviceLocalPrivacyCommitter = createDeviceLocalPrivacyCommitter(
  platformServices.storage,
  optionsStorageRepository
);
const deviceLocalVaultCleanupJournal = new DeviceLocalVaultCleanupJournal(
  platformServices.storage.local,
  () => optionsStorageRepository.readVaultBindings(),
  (folderId) => platformServices.fileSystemAccess.removeDirectory(folderId),
  {
    readPortableRaw: async () => rawObject(await optionsStorageRepository.readRaw()),
    writeBindings: (snapshot) => optionsStorageRepository.writeVaultBindings(snapshot),
    compensate: (request) => {
      const compensate = deviceLocalPrivacyCommitter.compensate;
      if (!compensate) throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
      return compensate(request);
    }
  }
);
const optionsMutationCoordinator = createOptionsMutationCoordinator(optionsStorageRepository, {
  deviceLocalPrivacyCommitter,
  deviceLocalVaultCleanupJournal
});

registerRepositories({
  storage: platformServices.storage,
  messaging: platformServices.messaging,
  tabs: platformServices.tabs,
  runtime: platformServices.runtime,
  optionsRepository: createBackgroundOptionsRepository(
    optionsStorageRepository,
    optionsMutationCoordinator
  )
});

startBackgroundRuntime({
  action: platformServices.action,
  contextMenus: platformServices.contextMenus,
  messaging: platformServices.messaging,
  runtime: platformServices.runtime,
  scripting: platformServices.scripting,
  storage: platformServices.storage,
  tabs: platformServices.tabs,
  optionsMutationCoordinator
});

registerTrialLifecycle(
  createDefaultTrialLifecycleDependencies(
    {
      ...platformServices.runtime,
      registerOnSuspend: (listener) => {
        chrome.runtime.onSuspend.addListener(listener);
      }
    },
    platformServices.storage,
    platformServices.tabs,
    platformServices.notifications
  )
);
