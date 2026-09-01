import { resolveAnalyticsDebugMode } from '../analytics/analyticsDebugModeCapability';
import type { StorageAreaService } from '../../platform/interfaces/storage';
import type { PlainStructuredObject, PlainStructuredValue } from './losslessObjectBoundaryTypes';
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

function isObject(value: PlainStructuredValue | undefined): value is PlainStructuredObject {
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

export class DeviceLocalPrivacyStore {
  constructor(private readonly storage: StorageAreaService) {}

  async read(portableRaw: PlainStructuredValue | null): Promise<DeviceLocalPrivacyResolution> {
    const [currentConsent, currentConfig, rawTransaction] = await Promise.all([
      this.storage.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_CONSENT_KEY),
      this.storage.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_CONFIG_KEY),
      this.storage.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY)
    ]);
    const transaction = readDeviceLocalPrivacyTransaction(rawTransaction);
    const usePrevious = transaction?.phase === 'prepared';
    return resolveDeviceLocalPrivacy(
      usePrevious ? transaction.previousConsent : currentConsent,
      usePrevious ? transaction.previousConfig : currentConfig,
      portableRaw
    );
  }

  async ensureBaseline(
    portableRaw: PlainStructuredValue | null
  ): Promise<PrivacyPreferencesOptions> {
    const state = await this.read(portableRaw);
    if (!state.requiresLocalWrite) return state.preferences;
    const currentConfig = await this.storage.get<PlainStructuredValue>(
      DEVICE_LOCAL_PRIVACY_CONFIG_KEY
    );
    await this.storage.setMany({
      [DEVICE_LOCAL_PRIVACY_CONSENT_KEY]: createDeviceLocalPrivacyConsent(
        state.preferences,
        Date.now()
      ),
      [DEVICE_LOCAL_PRIVACY_CONFIG_KEY]: mergeDeviceLocalPrivacyConfig(
        currentConfig,
        state.preferences
      )
    });
    return state.preferences;
  }

  async begin(): Promise<void> {
    await this.rollback();
    const [previousConsent, previousConfig] = await Promise.all([
      this.storage.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_CONSENT_KEY),
      this.storage.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_CONFIG_KEY)
    ]);
    await this.storage.set(
      DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY,
      createDeviceLocalPrivacyTransaction(previousConsent, previousConfig)
    );
  }

  async commit(preferences: PrivacyPreferencesOptions): Promise<void> {
    const raw = await this.storage.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY);
    const transaction = readDeviceLocalPrivacyTransaction(raw);
    if (!transaction) throw new Error('DEVICE_LOCAL_PRIVACY_TRANSACTION_MISSING');
    await this.storage.set(
      DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY,
      createDeviceLocalPrivacyTransaction(
        transaction.previousConsent,
        transaction.previousConfig,
        'commit-ready'
      )
    );
    const currentConfig = await this.storage.get<PlainStructuredValue>(
      DEVICE_LOCAL_PRIVACY_CONFIG_KEY
    );
    await this.storage.setMany({
      [DEVICE_LOCAL_PRIVACY_CONSENT_KEY]: createDeviceLocalPrivacyConsent(preferences, Date.now()),
      [DEVICE_LOCAL_PRIVACY_CONFIG_KEY]: mergeDeviceLocalPrivacyConfig(currentConfig, preferences)
    });
    try {
      await this.storage.remove(DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY);
    } catch (error) {
      console.warn('[DeviceLocalPrivacyStore] Failed to clear committed transaction:', error);
    }
  }

  async rollback(): Promise<void> {
    const raw = await this.storage.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY);
    if (readDeviceLocalPrivacyTransaction(raw)) {
      await this.storage.remove(DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY);
    }
  }
}
