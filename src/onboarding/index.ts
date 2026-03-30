import { bootstrapPage } from '../options/app/routing';
import { registerFallbackRepositories, registerRepositories } from '../shared/di/serviceRegistry';
import { registerService, TOKENS } from '../shared/di';
import { getPlatformServices } from '../platform';
import { createPreviewPlatformServices } from '../platform/preview/services';
import { bootstrapOnboardingApp } from './bootstrap';

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

bootstrapPage('onboarding', bootstrapOnboardingApp);
