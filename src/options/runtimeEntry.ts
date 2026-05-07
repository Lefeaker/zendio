import { bootstrapOptionsApp, configureOptionsAppBootstrapStorage } from '@options/app/bootstrap';
import { registerFallbackRepositories, registerRepositories } from '@shared/di/serviceRegistry';
import { createMemoryStorageService } from '@platform/preview/memoryStorage';
import { createPreviewPlatformServices } from '@platform/preview/services';
import { registerService, TOKENS } from '@shared/di';
import { getPlatformServices } from '../platform';

export async function bootstrapOptionsRuntime(): Promise<void> {
  const hasChromeStorage =
    typeof chrome !== 'undefined' &&
    Boolean(chrome.runtime) &&
    Boolean(chrome.storage?.sync) &&
    Boolean(chrome.storage?.local);

  const bootstrapStorage = hasChromeStorage
    ? getPlatformServices().storage
    : createMemoryStorageService();

  if (hasChromeStorage) {
    const platformServices = getPlatformServices();
    registerRepositories({
      storage: platformServices.storage,
      messaging: platformServices.messaging,
      tabs: platformServices.tabs,
      runtime: platformServices.runtime
    });
  } else {
    const previewPlatformServices = createPreviewPlatformServices(bootstrapStorage);
    registerService(TOKENS.platformServices, () => previewPlatformServices);
    registerFallbackRepositories();
  }

  configureOptionsAppBootstrapStorage(bootstrapStorage);
  await bootstrapOptionsApp({
    storage: bootstrapStorage
  });
}
