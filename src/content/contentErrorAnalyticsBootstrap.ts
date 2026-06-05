import { configureAnalyticsConfigManager } from '../shared/errors/analytics/analyticsConfig';
import { initializeErrorAnalytics } from '../shared/errors/analytics';
import type { ErrorHandler } from '../shared/errors/errorHandler';
import type { StorageService } from '../platform/interfaces/storage';

export async function initializeContentErrorAnalytics(
  storage: StorageService,
  errorHandler: Pick<ErrorHandler, 'addReporter'>
): Promise<void> {
  configureAnalyticsConfigManager(storage);
  await initializeErrorAnalytics(errorHandler);
}
