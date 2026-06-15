import {
  ANALYTICS_EVENT_CATALOG,
  ANALYTICS_REQUIRED_PARAMS,
  getAnalyticsAllowedParams,
  type AnalyticsEventName,
  type AnalyticsEventParamMap,
  type AnalyticsPrimitive,
  type UsageEventName,
  type UsageEventParamMap
} from './eventCatalog';
import { ANALYTICS_SCHEMA } from './schema/analyticsSchema';
import type { AnalyticsParamValidator } from './schema/analyticsParamValidators';

export function isAllowedAnalyticsEventName(eventName: unknown): eventName is AnalyticsEventName {
  return typeof eventName === 'string' && eventName in ANALYTICS_EVENT_CATALOG;
}

export function isAllowedUsageEventName(eventName: unknown): eventName is UsageEventName {
  return (
    isAllowedAnalyticsEventName(eventName) && ANALYTICS_EVENT_CATALOG[eventName].runtimeAllowed
  );
}

export function sanitizeAnalyticsEventParams<EventName extends AnalyticsEventName>(
  eventName: EventName,
  params: unknown
): Record<string, AnalyticsPrimitive> {
  if (!isPlainRecord(params)) {
    return {};
  }

  const paramDefinitions = ANALYTICS_SCHEMA[eventName].params as Record<
    string,
    { validator: AnalyticsParamValidator }
  >;
  const sanitized: Record<string, AnalyticsPrimitive> = {};
  for (const key of getAnalyticsAllowedParams(eventName)) {
    const value = params[key];
    if (value === undefined) {
      continue;
    }
    const paramDefinition = paramDefinitions[key];
    if (!paramDefinition) {
      continue;
    }
    const nextValue = paramDefinition.validator(value);
    if (nextValue !== undefined) {
      sanitized[key] = nextValue;
    }
  }
  return sanitized;
}

export function sanitizeUsageEventParams<EventName extends UsageEventName>(
  eventName: EventName,
  params: unknown
): Record<string, AnalyticsPrimitive> {
  return sanitizeAnalyticsEventParams(eventName, params);
}

export function parseAnalyticsEventParams<EventName extends AnalyticsEventName>(
  eventName: EventName,
  params: unknown
): AnalyticsEventParamMap[EventName] | null {
  const sanitizedParams = sanitizeAnalyticsEventParams(eventName, params);
  if (!hasRequiredAnalyticsEventParams(eventName, sanitizedParams)) {
    return null;
  }
  return sanitizedParams as AnalyticsEventParamMap[EventName];
}

export function parseUsageEventParams<EventName extends UsageEventName>(
  eventName: EventName,
  params: unknown
): UsageEventParamMap[EventName] | null {
  return parseAnalyticsEventParams(eventName, params) as UsageEventParamMap[EventName] | null;
}

export function hasRequiredAnalyticsEventParams<EventName extends AnalyticsEventName>(
  eventName: EventName,
  params: Record<string, AnalyticsPrimitive>
): boolean {
  return ANALYTICS_REQUIRED_PARAMS[eventName].every((key) => params[key] !== undefined);
}

export function hasRequiredUsageEventParams<EventName extends UsageEventName>(
  eventName: EventName,
  params: Record<string, AnalyticsPrimitive>
): boolean {
  return hasRequiredAnalyticsEventParams(eventName, params);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
