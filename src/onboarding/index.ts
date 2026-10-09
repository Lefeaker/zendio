import { registerFallbackRepositories, registerRepositories } from '../shared/di/serviceRegistry';
import { registerService, TOKENS } from '../shared/di';
import { getPlatformServices } from '../platform';
import { createPreviewPlatformServices } from '../platform/preview/services';

const isPractice = document.documentElement.dataset.route === 'practice';

if (isPractice) {
  // The practice document loads the production content loader before this module.
} else if (typeof chrome !== 'undefined' && chrome.runtime) {
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

const run = async () => {
  if (isPractice) {
    const runtime = (
      window as Window & {
        __AIIINOB_CONTENT_RUNTIME_PROMISE__?: Promise<void>;
      }
    ).__AIIINOB_CONTENT_RUNTIME_PROMISE__;
    if (!runtime) throw new Error('Practice content runtime is unavailable');
    await runtime;
    const { bootstrapPractice } = await import('./practice');
    await bootstrapPractice(getPlatformServices());
  } else {
    void import('./bootstrap').then(({ bootstrapOnboardingApp }) => bootstrapOnboardingApp());
  }
};

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      void run();
    },
    { once: true }
  );
} else {
  void run();
}
