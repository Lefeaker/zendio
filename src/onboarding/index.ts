import { registerFallbackRepositories, registerRepositories } from '../shared/di/serviceRegistry';
import { registerService, TOKENS } from '../shared/di';
import { getPlatformServices } from '../platform';
import { createPreviewPlatformServices } from '../platform/preview/services';

if (typeof chrome !== 'undefined' && chrome.runtime) {
  const platformServices = getPlatformServices();
  registerRepositories({
    storage: platformServices.storage,
    messaging: platformServices.messaging,
    tabs: platformServices.tabs,
    runtime: platformServices.runtime
  });
} else {
  registerService(TOKENS.platformServices, () => createPreviewPlatformServices());
  registerFallbackRepositories();
}

const run = () => {
  void import('./bootstrap').then(({ bootstrapOnboardingApp }) => bootstrapOnboardingApp());
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run, { once: true });
} else {
  run();
}
