import {
  configureAnalyticsConfigManager,
  watchAnalyticsConfigStorage
} from '../shared/errors/analytics/analyticsConfig';
import { initializeErrorAnalytics, updateErrorAnalyticsConfig } from '../shared/errors/analytics';
import type { ErrorHandler } from '../shared/errors/errorHandler';
import type { StorageService } from '../platform/interfaces/storage';

export async function initializeContentErrorAnalytics(
  storage: StorageService,
  errorHandler: Pick<ErrorHandler, 'addReporter'>
): Promise<() => void> {
  configureAnalyticsConfigManager(storage);
  await initializeErrorAnalytics(errorHandler);

  const cleanupWatch = watchAnalyticsConfigStorage((config) => {
    void updateErrorAnalyticsConfig(config.userConsent?.errorReporting === true).catch((error) => {
      console.warn('[ContentScript] Failed to update error analytics config:', error);
    });
  });

  return () => {
    cleanupWatch();
  };
}
