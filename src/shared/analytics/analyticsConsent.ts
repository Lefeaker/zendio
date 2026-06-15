import type { AnalyticsConfig } from '../errors/analytics/analyticsConfig';
import type { AnalyticsConsentScope } from './schema/analyticsSchema';
import { getAnalyticsConsentScope } from './schema/analyticsSchemaDerived';
import type { AnalyticsEventName } from './eventCatalog';

export type { AnalyticsConsentScope } from './schema/analyticsSchema';

export function getConsentScopeForAnalyticsEvent(
  eventName: AnalyticsEventName
): AnalyticsConsentScope {
  return getAnalyticsConsentScope(eventName);
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

  const consentScope = getConsentScopeForAnalyticsEvent(eventName);
  if (consentScope === 'none') {
    return true;
  }
  return consentScope === 'errorReporting'
    ? consent.errorReporting === true
    : consent.analytics === true;
}
