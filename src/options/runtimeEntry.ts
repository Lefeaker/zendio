import { bootstrapOptionsApp, configureOptionsAppBootstrapStorage } from '@options/app/bootstrap';
import { registerFallbackRepositories, registerRepositories } from '@shared/di/serviceRegistry';
import { createMemoryStorageService } from '@platform/preview/memoryStorage';
import { createPreviewPlatformServices } from '@platform/preview/services';
import { registerService, TOKENS } from '@shared/di';
import type { PlatformServices } from '../platform/types';

export async function bootstrapOptionsRuntime(platformServices?: PlatformServices): Promise<void> {
  const hasChromeStorage =
    typeof chrome !== 'undefined' &&
    Boolean(chrome.runtime) &&
    Boolean(chrome.storage?.sync) &&
    Boolean(chrome.storage?.local);

  const bootstrapStorage = hasChromeStorage
    ? platformServices?.storage
    : createMemoryStorageService();

  if (!bootstrapStorage) {
    throw new Error('Options runtime requires platform services when Chrome storage is available.');
  }

  if (hasChromeStorage) {
    if (!platformServices) {
      throw new Error(
        'Options runtime requires platform services when Chrome storage is available.'
      );
    }
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
