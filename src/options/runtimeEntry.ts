import { bootstrapOptionsApp, configureOptionsAppBootstrapStorage } from '@options/app/bootstrap';
import { registerRepositories } from '@shared/di/serviceRegistry';
import type { PlatformServices } from '../platform/types';
import type { UsageStatsClientLike } from './app/usage-dashboard/usageStatsClient';

export async function bootstrapOptionsRuntime(platformServices?: PlatformServices): Promise<void> {
  const { UsageStatsClient, createUnavailableUsageStatsClient } =
    await import('./app/usage-dashboard/usageStatsClient');
  const hasChromeStorage =
    typeof chrome !== 'undefined' &&
    Boolean(chrome.runtime) &&
    Boolean(chrome.storage?.sync) &&
    Boolean(chrome.storage?.local);

  let runtime = platformServices?.runtime;
  let usageStatsClient: UsageStatsClientLike = createUnavailableUsageStatsClient();
  let bootstrapStorage = platformServices?.storage;

  if (hasChromeStorage) {
    if (!platformServices || !bootstrapStorage) {
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
    usageStatsClient = new UsageStatsClient(platformServices.messaging);
  } else {
    const { configurePreviewOptionsRuntime } = await import('@platform/preview/optionsRepository');
    const previewPlatformServices = configurePreviewOptionsRuntime();
    bootstrapStorage = previewPlatformServices.storage;
    runtime = previewPlatformServices.runtime;
  }

  configureOptionsAppBootstrapStorage(bootstrapStorage);
  await bootstrapOptionsApp({
    storage: bootstrapStorage,
    usageStatsClient,
    ...(runtime ? { runtime } : {})
  });
}
