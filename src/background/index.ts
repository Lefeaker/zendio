import { getPlatformServices } from '../platform';
import { startBackgroundRuntime } from './backgroundStartup';
import {
  createDefaultTrialLifecycleDependencies,
  registerTrialLifecycle
} from './trialLifecycle';

const platformServices = getPlatformServices();

startBackgroundRuntime({
  action: platformServices.action,
  contextMenus: platformServices.contextMenus,
  messaging: platformServices.messaging,
  runtime: platformServices.runtime,
  scripting: platformServices.scripting,
  storage: platformServices.storage,
  tabs: platformServices.tabs
});

registerTrialLifecycle(
  createDefaultTrialLifecycleDependencies(
    platformServices.runtime,
    platformServices.storage,
    platformServices.tabs
  )
);
