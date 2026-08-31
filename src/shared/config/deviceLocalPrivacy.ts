import { resolveAnalyticsDebugMode } from '../analytics/analyticsDebugModeCapability';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from './losslessObjectBoundaryTypes';
import type { CompleteOptions, PrivacyPreferencesOptions } from '../types/options';

export const DEVICE_LOCAL_PRIVACY_CONSENT_KEY = 'analytics_user_consent';
export const DEVICE_LOCAL_PRIVACY_CONFIG_KEY = 'analytics_config';
export const DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY = 'zendio_device_local_privacy_transaction';

export interface DeviceLocalPrivacyResolution {
  readonly preferences: PrivacyPreferencesOptions;
  readonly requiresLocalWrite: boolean;
}

export interface DeviceLocalPrivacyTransactionSnapshot {
  readonly phase: 'prepared' | 'commit-ready';
  readonly previousConsent: PlainStructuredValue | undefined;
  readonly previousConfig: PlainStructuredValue | undefined;
}

function isObject(
  value: PlainStructuredValue | undefined
): value is PlainStructuredObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function privacyFromPortableRaw(
  raw: PlainStructuredValue | null
): PrivacyPreferencesOptions | null {
  if (!isObject(raw) || !Object.prototype.hasOwnProperty.call(raw, 'privacyPreferences')) {
    return null;
  }
  const privacy = raw.privacyPreferences;
  if (!isObject(privacy)) return null;
  return {
    analytics: privacy.analytics === true,
    errorReporting: privacy.errorReporting === true,
    debugMode: resolveAnalyticsDebugMode({
      analytics: privacy.analytics === true,
      errorReporting: privacy.errorReporting === true,
      debugMode: privacy.debugMode === true
    })
  };
}

export function resolveDeviceLocalPrivacy(
  localConsent: PlainStructuredValue | undefined,
  localConfig: PlainStructuredValue | undefined,
  portableRaw: PlainStructuredValue | null
): DeviceLocalPrivacyResolution {
  if (
    isObject(localConsent) &&
    typeof localConsent.analytics === 'boolean' &&
    typeof localConsent.errorReporting === 'boolean'
  ) {
    const debugMode = isObject(localConfig) && localConfig.debugMode === true;
    return {
      preferences: {
        analytics: localConsent.analytics,
        errorReporting: localConsent.errorReporting,
        debugMode: resolveAnalyticsDebugMode({
          analytics: localConsent.analytics,
          errorReporting: localConsent.errorReporting,
          debugMode
        })
      },
      requiresLocalWrite: false
    };
  }

  const legacyPortablePrivacy = privacyFromPortableRaw(portableRaw);
  if (legacyPortablePrivacy) {
    return { preferences: legacyPortablePrivacy, requiresLocalWrite: true };
  }

  return {
    preferences: { analytics: false, errorReporting: false, debugMode: false },
    requiresLocalWrite: false
  };
}

export function composeDeviceLocalPrivacy(
  options: CompleteOptions,
  preferences: PrivacyPreferencesOptions
): CompleteOptions {
  return {
    ...options,
    privacyPreferences: { ...preferences }
  };
}

export function omitDeviceLocalPrivacy(raw: PlainStructuredObject): PlainStructuredObject {
  if (!Object.prototype.hasOwnProperty.call(raw, 'privacyPreferences')) return raw;
  const scrubbed = { ...raw };
  delete scrubbed.privacyPreferences;
  return scrubbed;
}

export function containsDeviceLocalPrivacy(raw: PlainStructuredObject): boolean {
  return Object.prototype.hasOwnProperty.call(raw, 'privacyPreferences');
}

export function createDeviceLocalPrivacyConsent(
  preferences: PrivacyPreferencesOptions,
  timestamp: number
): PlainStructuredObject {
  return {
    analytics: preferences.analytics,
    errorReporting: preferences.errorReporting,
    timestamp,
    version: '1.0'
  };
}

export function mergeDeviceLocalPrivacyConfig(
  storedConfig: PlainStructuredValue | undefined,
  preferences: PrivacyPreferencesOptions
): PlainStructuredObject {
  return {
    ...(isObject(storedConfig) ? storedConfig : {}),
    debugMode: resolveAnalyticsDebugMode(preferences)
  };
}

export function createDeviceLocalPrivacyTransaction(
  previousConsent: PlainStructuredValue | undefined,
  previousConfig: PlainStructuredValue | undefined,
  phase: DeviceLocalPrivacyTransactionSnapshot['phase'] = 'prepared'
): PlainStructuredObject {
  return {
    version: 1,
    phase,
    previousConsentPresent: previousConsent !== undefined,
    previousConsent: previousConsent ?? null,
    previousConfigPresent: previousConfig !== undefined,
    previousConfig: previousConfig ?? null
  };
}

export function readDeviceLocalPrivacyTransaction(
  value: PlainStructuredValue | undefined
): DeviceLocalPrivacyTransactionSnapshot | null {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    (value.phase !== 'prepared' && value.phase !== 'commit-ready') ||
    typeof value.previousConsentPresent !== 'boolean' ||
    typeof value.previousConfigPresent !== 'boolean'
  ) {
    return null;
  }
  return {
    phase: value.phase,
    previousConsent: value.previousConsentPresent ? value.previousConsent : undefined,
    previousConfig: value.previousConfigPresent ? value.previousConfig : undefined
  };
}
