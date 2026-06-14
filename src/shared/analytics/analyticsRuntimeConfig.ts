import { hasConsentForAnalyticsEvent } from './analyticsConsent';
import {
  DEFAULT_ANALYTICS_MEASUREMENT_ID,
  normalizeAnalyticsTransportMode,
  normalizeMeasurementId,
  normalizeProxyEndpoint,
  type AnalyticsTransportMode
} from './analyticsEnvironment';
import type { AnalyticsEventName } from './eventCatalog';
import type { AnalyticsConfig, UserConsent } from '../errors/analytics/analyticsConfig';

type AnalyticsConsentInput = Partial<UserConsent> | undefined;
type AnalyticsRuntimeConfigInput = Omit<Partial<AnalyticsRuntimeConfigShape>, 'userConsent'> & {
  userConsent?: Partial<UserConsent>;
};

export interface AnalyticsRuntimeConfigShape extends AnalyticsConfig {}

const DEFAULT_ANALYTICS_RUNTIME_CONFIG: AnalyticsRuntimeConfigShape = {
  enabled: false,
  debugMode: false,
  measurementId: DEFAULT_ANALYTICS_MEASUREMENT_ID,
  transportMode: 'disabled',
  reportingInterval: 30000,
  maxErrorsPerSession: 50,
  batchSize: 10
};

export function resolveAnalyticsRuntimeEnabled(consent: AnalyticsConsentInput): boolean {
  return Boolean(consent?.analytics || consent?.errorReporting);
}

export function normalizeStoredAnalyticsConfig(
  storedConfig: AnalyticsRuntimeConfigInput | undefined,
  defaults: AnalyticsRuntimeConfigShape = DEFAULT_ANALYTICS_RUNTIME_CONFIG
): AnalyticsRuntimeConfigShape {
  const consent = normalizeAnalyticsConsent(storedConfig?.userConsent);
  const transportMode = Object.prototype.hasOwnProperty.call(storedConfig ?? {}, 'transportMode')
    ? (normalizeAnalyticsTransportMode(storedConfig?.transportMode, 'disabled') ?? 'disabled')
    : defaults.transportMode;
  const proxyEndpoint =
    transportMode === 'proxy' || transportMode === 'directDebug'
      ? Object.prototype.hasOwnProperty.call(storedConfig ?? {}, 'proxyEndpoint')
        ? normalizeProxyEndpoint(storedConfig?.proxyEndpoint)
        : defaults.proxyEndpoint
      : undefined;
  const clientId = normalizeOptionalString(storedConfig?.clientId);
  const sessionId = normalizeOptionalString(storedConfig?.sessionId);

  return {
    enabled: resolveAnalyticsRuntimeEnabled(consent),
    debugMode:
      typeof storedConfig?.debugMode === 'boolean' ? storedConfig.debugMode : defaults.debugMode,
    measurementId:
      normalizeMeasurementId(storedConfig?.measurementId, defaults.measurementId) ??
      defaults.measurementId,
    transportMode,
    ...(proxyEndpoint ? { proxyEndpoint } : {}),
    ...(clientId ? { clientId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(consent ? { userConsent: consent } : {}),
    reportingInterval: normalizePositiveInteger(
      storedConfig?.reportingInterval,
      defaults.reportingInterval
    ),
    maxErrorsPerSession: normalizePositiveInteger(
      storedConfig?.maxErrorsPerSession,
      defaults.maxErrorsPerSession
    ),
    batchSize: normalizePositiveInteger(storedConfig?.batchSize, defaults.batchSize)
  };
}

export function createAnalyticsTransportConfig(
  managerConfig: AnalyticsRuntimeConfigInput | undefined,
  overrides: AnalyticsRuntimeConfigInput = {}
): AnalyticsRuntimeConfigShape {
  const normalizedBaseConfig = normalizeStoredAnalyticsConfig(
    managerConfig,
    DEFAULT_ANALYTICS_RUNTIME_CONFIG
  );
  const consent = normalizeAnalyticsConsent(
    Object.prototype.hasOwnProperty.call(overrides, 'userConsent')
      ? overrides.userConsent
      : managerConfig?.userConsent
  );
  const transportMode = Object.prototype.hasOwnProperty.call(overrides, 'transportMode')
    ? (normalizeAnalyticsTransportMode(overrides.transportMode, 'disabled') ?? 'disabled')
    : normalizedBaseConfig.transportMode;
  const proxyEndpoint =
    transportMode === 'proxy' || transportMode === 'directDebug'
      ? Object.prototype.hasOwnProperty.call(overrides, 'proxyEndpoint')
        ? normalizeProxyEndpoint(overrides.proxyEndpoint)
        : normalizedBaseConfig.proxyEndpoint
      : undefined;
  const clientId = Object.prototype.hasOwnProperty.call(overrides, 'clientId')
    ? normalizeOptionalString(overrides.clientId)
    : normalizedBaseConfig.clientId;
  const sessionId = Object.prototype.hasOwnProperty.call(overrides, 'sessionId')
    ? normalizeOptionalString(overrides.sessionId)
    : normalizedBaseConfig.sessionId;

  return {
    enabled: resolveAnalyticsRuntimeEnabled(consent),
    debugMode:
      typeof overrides.debugMode === 'boolean'
        ? overrides.debugMode
        : normalizedBaseConfig.debugMode,
    measurementId:
      normalizeMeasurementId(
        Object.prototype.hasOwnProperty.call(overrides, 'measurementId')
          ? overrides.measurementId
          : normalizedBaseConfig.measurementId,
        normalizedBaseConfig.measurementId
      ) ?? normalizedBaseConfig.measurementId,
    transportMode,
    ...(proxyEndpoint ? { proxyEndpoint } : {}),
    ...(clientId ? { clientId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(consent ? { userConsent: consent } : {}),
    reportingInterval: normalizePositiveInteger(
      overrides.reportingInterval,
      normalizedBaseConfig.reportingInterval
    ),
    maxErrorsPerSession: normalizePositiveInteger(
      overrides.maxErrorsPerSession,
      normalizedBaseConfig.maxErrorsPerSession
    ),
    batchSize: normalizePositiveInteger(overrides.batchSize, normalizedBaseConfig.batchSize)
  };
}

export function hasAnalyticsSendConsent(
  config: AnalyticsRuntimeConfigInput | undefined,
  eventName: AnalyticsEventName
): boolean {
  return hasConsentForAnalyticsEvent(createAnalyticsTransportConfig(config), eventName);
}

function normalizeAnalyticsConsent(value: unknown): UserConsent | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const consent = value as Partial<UserConsent>;
  return {
    analytics: consent.analytics === true,
    errorReporting: consent.errorReporting === true,
    timestamp: typeof consent.timestamp === 'number' ? consent.timestamp : 0,
    version: typeof consent.version === 'string' ? consent.version : '1.0'
  };
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
