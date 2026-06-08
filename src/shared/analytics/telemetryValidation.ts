import {
  hasRequiredUsageEventParams,
  isAllowedUsageEventName,
  sanitizeUsageEventParams,
  type AnalyticsPrimitive,
  type TelemetryConsentKind,
  type TelemetryEventDefinition,
  type TelemetryEventName,
  type TelemetryEventParamMap,
  type UsageEventName,
  type UsageEventParamMap
} from '../types/analytics';
import { TELEMETRY_EVENT_CATALOG } from './eventCatalog';

const SERVICE_PROVIDED_PARAM_KEYS = new Set([
  'debug_mode',
  'engagement_time_msec',
  'extension_version',
  'session_id'
]);

export type TelemetryValidationReason =
  | 'disallowed-event'
  | 'invalid-params'
  | 'missing-required-params';

export interface ValidatedTelemetryEvent<
  EventName extends TelemetryEventName = TelemetryEventName
> {
  eventName: EventName;
  consent: TelemetryConsentKind;
  definition: TelemetryEventDefinition<EventName>;
  params: Record<string, AnalyticsPrimitive>;
}

type TelemetryValidationResult<EventName extends TelemetryEventName = TelemetryEventName> =
  | {
      ok: true;
      value: ValidatedTelemetryEvent<EventName>;
    }
  | {
      ok: false;
      reason: TelemetryValidationReason;
    };

export function validateTelemetryEvent<EventName extends TelemetryEventName>(
  eventName: EventName,
  params: TelemetryEventParamMap[EventName] | undefined
): TelemetryValidationResult<EventName> {
  if (!isTelemetryEventName(eventName)) {
    return { ok: false, reason: 'disallowed-event' };
  }

  const definition = TELEMETRY_EVENT_CATALOG[
    eventName
  ] as unknown as TelemetryEventDefinition<EventName>;

  if (definition.scope === 'retired-contract') {
    return { ok: false, reason: 'disallowed-event' };
  }

  if (isAllowedUsageEventName(eventName)) {
    const usageParams = validateUsageTelemetryParams(
      eventName,
      params as UsageEventParamMap[typeof eventName] | undefined
    );
    if (!usageParams.ok) {
      return usageParams;
    }

    return {
      ok: true,
      value: {
        eventName,
        consent: definition.consent,
        definition,
        params: usageParams.params
      }
    };
  }

  const genericParams = validateGenericTelemetryParams(definition, params);
  if (!genericParams.ok) {
    return genericParams;
  }

  return {
    ok: true,
    value: {
      eventName,
      consent: definition.consent,
      definition,
      params: genericParams.params
    }
  };
}

export function parseTelemetryValidationResponse(responseText: string | null): {
  validationMessageCount: number | null;
} {
  if (!responseText || responseText.trim().length === 0) {
    return { validationMessageCount: null };
  }

  try {
    const parsed = JSON.parse(responseText) as { validationMessages?: unknown };
    if (Array.isArray(parsed.validationMessages)) {
      return {
        validationMessageCount: parsed.validationMessages.length
      };
    }
  } catch {
    return { validationMessageCount: null };
  }

  return { validationMessageCount: null };
}

function validateUsageTelemetryParams<EventName extends UsageEventName>(
  eventName: EventName,
  params: UsageEventParamMap[EventName] | undefined
):
  | { ok: true; params: Record<string, AnalyticsPrimitive> }
  | { ok: false; reason: TelemetryValidationReason } {
  if (!isPlainRecord(params) && params !== undefined) {
    return { ok: false, reason: 'invalid-params' };
  }

  const sanitizedParams = sanitizeUsageEventParams(eventName, params);
  const originalEntries =
    params === undefined ? [] : Object.entries(params).filter(([, value]) => value !== undefined);

  if (originalEntries.length !== Object.keys(sanitizedParams).length) {
    return { ok: false, reason: 'invalid-params' };
  }

  if (!hasRequiredUsageEventParams(eventName, sanitizedParams)) {
    return { ok: false, reason: 'missing-required-params' };
  }

  return {
    ok: true,
    params: sanitizedParams
  };
}

function validateGenericTelemetryParams<EventName extends TelemetryEventName>(
  definition: TelemetryEventDefinition<EventName>,
  params: TelemetryEventParamMap[EventName] | undefined
):
  | { ok: true; params: Record<string, AnalyticsPrimitive> }
  | { ok: false; reason: TelemetryValidationReason } {
  if (!isPlainRecord(params)) {
    return { ok: false, reason: 'invalid-params' };
  }

  const allowedParamKeys = new Set(Array.from(definition.allowedParams, (key) => String(key)));
  const sanitizedParams: Record<string, AnalyticsPrimitive> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    if (!allowedParamKeys.has(key) || !isAnalyticsPrimitive(value)) {
      return { ok: false, reason: 'invalid-params' };
    }

    sanitizedParams[key] = value;
  }

  const missingRequiredParam = Array.from(definition.requiredParams, (key) => String(key)).some(
    (key) => {
      if (SERVICE_PROVIDED_PARAM_KEYS.has(key)) {
        return false;
      }

      return sanitizedParams[key] === undefined;
    }
  );

  if (missingRequiredParam) {
    return { ok: false, reason: 'missing-required-params' };
  }

  return {
    ok: true,
    params: sanitizedParams
  };
}

function isTelemetryEventName(eventName: unknown): eventName is TelemetryEventName {
  return typeof eventName === 'string' && eventName in TELEMETRY_EVENT_CATALOG;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAnalyticsPrimitive(value: unknown): value is AnalyticsPrimitive {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}
