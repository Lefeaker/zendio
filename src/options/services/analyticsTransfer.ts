import { getAnalyticsConfigManager } from '../../shared/errors/analytics/analyticsConfig';

export interface AnalyticsTransferPayload {
  consent?: {
    analytics: boolean;
    errorReporting: boolean;
  };
  debugMode?: boolean;
}

export async function exportAnalyticsTransferPayload(): Promise<
  AnalyticsTransferPayload | undefined
> {
  const manager = getAnalyticsConfigManager();
  await manager.refreshFromStorage();

  const consent = await manager.getUserConsent();
  const config = manager.getConfig();

  const payload: AnalyticsTransferPayload = {};

  if (consent) {
    payload.consent = {
      analytics: Boolean(consent.analytics),
      errorReporting: Boolean(consent.errorReporting)
    };
  }

  if (typeof config.debugMode === 'boolean') {
    payload.debugMode = config.debugMode;
  }

  if (payload.consent || typeof payload.debugMode === 'boolean') {
    return payload;
  }

  return undefined;
}

export async function applyAnalyticsTransferPayload(
  payload: AnalyticsTransferPayload | undefined
): Promise<void> {
  if (!payload) {
    return;
  }

  const manager = getAnalyticsConfigManager();
  await manager.refreshFromStorage();

  if (payload.consent) {
    await manager.setUserConsent({
      analytics: Boolean(payload.consent.analytics),
      errorReporting: Boolean(payload.consent.errorReporting)
    });
  }

  if (typeof payload.debugMode === 'boolean') {
    await manager.updateConfig({ debugMode: payload.debugMode });
  }
}
