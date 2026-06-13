import type { AnalyticsConfig } from '../errors/analytics/analyticsConfig';
import { ERROR_EVENT_NAMES, type AnalyticsEventName } from './eventCatalog';

export type AnalyticsConsentScope = 'analytics' | 'errorReporting';

const ERROR_EVENT_NAME_SET = new Set<AnalyticsEventName>(ERROR_EVENT_NAMES);

export function getConsentScopeForAnalyticsEvent(
  eventName: AnalyticsEventName
): AnalyticsConsentScope {
  return ERROR_EVENT_NAME_SET.has(eventName) ? 'errorReporting' : 'analytics';
}

export function hasConsentForAnalyticsEvent(
  config: AnalyticsConfig,
  eventName: AnalyticsEventName
): boolean {
  if (!config.enabled) {
    return false;
  }

  const consent = config.userConsent;
  if (!consent) {
    return false;
  }

  return getConsentScopeForAnalyticsEvent(eventName) === 'errorReporting'
    ? consent.errorReporting === true
    : consent.analytics === true;
}
