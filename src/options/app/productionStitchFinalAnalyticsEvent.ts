import { sendAnalyticsTransportEvent } from '@shared/analytics';
import { getAnalyticsConfigManager } from '@shared/errors/analytics/analyticsConfig';
import type { AnalyticsConfig } from '@shared/errors/analytics/analyticsConfig';

type FinalAnalyticsEventSender = () => Promise<void>;

const noopFinalAnalyticsEventSender: FinalAnalyticsEventSender = () => Promise.resolve();

export async function prepareAnalyticsDataClearedEvent(): Promise<FinalAnalyticsEventSender> {
  try {
    const manager = getAnalyticsConfigManager();
    await manager.refreshFromStorage();
    const config = manager.getConfig();

    if (config.userConsent?.analytics !== true) {
      return noopFinalAnalyticsEventSender;
    }

    const eventConfig: AnalyticsConfig = {
      ...config,
      ...(config.userConsent ? { userConsent: { ...config.userConsent } } : {})
    };

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
