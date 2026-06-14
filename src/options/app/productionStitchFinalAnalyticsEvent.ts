import { sendAnalyticsTransportEvent } from '@shared/analytics';
import {
  createAnalyticsTransportConfig,
  hasAnalyticsSendConsent
} from '@shared/analytics/analyticsRuntimeConfig';
import { getAnalyticsConfigManager } from '@shared/errors/analytics/analyticsConfig';

type FinalAnalyticsEventSender = () => Promise<void>;

const noopFinalAnalyticsEventSender: FinalAnalyticsEventSender = () => Promise.resolve();

export async function prepareAnalyticsDataClearedEvent(): Promise<FinalAnalyticsEventSender> {
  try {
    const manager = getAnalyticsConfigManager();
    await manager.refreshFromStorage();
    const eventConfig = createAnalyticsTransportConfig(manager.getConfig());
    if (!hasAnalyticsSendConsent(eventConfig, 'analytics_data_cleared')) {
      return noopFinalAnalyticsEventSender;
    }

    return async () => {
      try {
        await sendAnalyticsTransportEvent(
          'analytics_data_cleared',
          { outcome: 'completed' },
          eventConfig
        );
      } catch {
        // Final telemetry is best-effort and must not block privacy clearing.
      }
    };
  } catch {
    return noopFinalAnalyticsEventSender;
  }
}
