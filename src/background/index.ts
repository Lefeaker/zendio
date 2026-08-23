import { getPlatformServices } from '../platform';
import { registerRepositories } from '../shared/di/serviceRegistry';
import { startBackgroundRuntime } from './backgroundStartup';
import { createDefaultTrialLifecycleDependencies, registerTrialLifecycle } from './trialLifecycle';
import { ChromeOptionsRepository } from '../infrastructure/repositories/ChromeOptionsRepository';
import {
  createBackgroundOptionsRepository,
  createOptionsMutationCoordinator
} from './services/optionsMutationCoordinator';

const platformServices = getPlatformServices();
const optionsStorageRepository = new ChromeOptionsRepository(platformServices.storage);
const optionsMutationCoordinator = createOptionsMutationCoordinator(optionsStorageRepository);

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
