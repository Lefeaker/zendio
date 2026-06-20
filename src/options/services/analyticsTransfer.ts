import { updateErrorAnalyticsConfig } from '../../shared/errors/analytics';
import { getAnalyticsConfigManager } from '../../shared/errors/analytics/analyticsConfig';
import {
  isAnalyticsDebugModeControlAvailable,
  resolveAnalyticsDebugMode
} from '../../shared/analytics';

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

  if (isAnalyticsDebugModeControlAvailable() && typeof config.debugMode === 'boolean') {
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
  const currentConsent = await manager.getUserConsent();
  const nextConsent = payload.consent
    ? {
        analytics: Boolean(payload.consent.analytics),
        errorReporting: Boolean(payload.consent.errorReporting)
      }
    : {
        analytics: Boolean(currentConsent?.analytics),
        errorReporting: Boolean(currentConsent?.errorReporting)
      };

  if (payload.consent) {
    await manager.setUserConsent(nextConsent);
  }

  const currentDebugMode = manager.getConfig().debugMode;
  const debugModeControlAvailable = isAnalyticsDebugModeControlAvailable();
  const nextDebugMode = resolveAnalyticsDebugMode(
    {
      ...nextConsent,
      debugMode: typeof payload.debugMode === 'boolean' ? payload.debugMode : currentDebugMode
    },
    debugModeControlAvailable
  );
  const shouldUpdateDebugMode = debugModeControlAvailable
    ? typeof payload.debugMode === 'boolean' || nextDebugMode !== currentDebugMode
    : currentDebugMode === true;
  if (shouldUpdateDebugMode) {
    await manager.updateConfig({ debugMode: nextDebugMode });
  }

  if (payload.consent) {
    await updateErrorAnalyticsConfig(nextConsent.errorReporting);
  }
}
