import {
  ANALYTICS_SCHEMA,
  type AnalyticsConsentScope,
  type AnalyticsEventClassification,
  type AnalyticsEventNamesMatching,
  type AnalyticsEventParamMapFromSchema,
  type AnalyticsOptionalParamMapFromSchema,
  type AnalyticsRequiredParamMapFromSchema,
  type FeatureArea
} from './analyticsSchema';

type AnalyticsSchemaType = typeof ANALYTICS_SCHEMA;
type AnalyticsEventName = keyof AnalyticsEventParamMapFromSchema<AnalyticsSchemaType> & string;
type SchemaEntry = [AnalyticsEventName, AnalyticsSchemaType[AnalyticsEventName]];

export type AnalyticsDerivedEventDefinition<
  EventName extends string,
  Area extends string,
  Classification extends string
> = {
  readonly name: EventName;
  readonly featureArea: Area;
  readonly classification: Classification;
  readonly runtimeAllowed: boolean;
  readonly requiredParams: readonly string[];
  readonly optionalParams: readonly string[];
};

const SCHEMA_ENTRIES = Object.entries(ANALYTICS_SCHEMA) as SchemaEntry[];

function collectParamNames(entry: SchemaEntry, required: boolean): readonly string[] {
  return Object.entries(entry[1].params as Record<string, { required: boolean }>)
    .filter(([, definition]) => definition.required === required)
    .map(([paramName]) => paramName);
}

export const ANALYTICS_REQUIRED_PARAMS = Object.freeze(
  Object.fromEntries(SCHEMA_ENTRIES.map((entry) => [entry[0], collectParamNames(entry, true)]))
) as AnalyticsRequiredParamMapFromSchema<AnalyticsSchemaType>;

export const ANALYTICS_OPTIONAL_PARAMS = Object.freeze(
  Object.fromEntries(SCHEMA_ENTRIES.map((entry) => [entry[0], collectParamNames(entry, false)]))
) as AnalyticsOptionalParamMapFromSchema<AnalyticsSchemaType>;

export const EMITTED_USAGE_EVENT_NAMES = Object.freeze(
  SCHEMA_ENTRIES.filter(
    ([, definition]) =>
      definition.classification === 'emitted' && definition.emittedKind === 'usage'
  ).map(([eventName]) => eventName)
) as readonly AnalyticsEventNamesMatching<
  AnalyticsSchemaType,
  { classification: 'emitted'; emittedKind: 'usage' }
>[];

export const EMITTED_PRODUCT_EVENT_NAMES = Object.freeze(
  SCHEMA_ENTRIES.filter(
    ([, definition]) =>
      definition.classification === 'emitted' && definition.emittedKind === 'product'
  ).map(([eventName]) => eventName)
) as readonly AnalyticsEventNamesMatching<
  AnalyticsSchemaType,
  { classification: 'emitted'; emittedKind: 'product' }
>[];

export const EMITTED_RUNTIME_EVENT_NAMES = Object.freeze([
  ...EMITTED_USAGE_EVENT_NAMES,
  ...EMITTED_PRODUCT_EVENT_NAMES
]) as readonly AnalyticsEventNamesMatching<AnalyticsSchemaType, { classification: 'emitted' }>[];

export const ERROR_EVENT_NAMES = Object.freeze(
  SCHEMA_ENTRIES.filter(([, definition]) => definition.classification === 'error').map(
    ([eventName]) => eventName
  )
) as readonly AnalyticsEventNamesMatching<AnalyticsSchemaType, { classification: 'error' }>[];

export const DEV_ONLY_EVENT_NAMES = Object.freeze(
  SCHEMA_ENTRIES.filter(([, definition]) => definition.classification === 'dev-only').map(
    ([eventName]) => eventName
  )
) as readonly AnalyticsEventNamesMatching<AnalyticsSchemaType, { classification: 'dev-only' }>[];

export const CONTRACT_ONLY_EVENT_NAMES = Object.freeze(
  SCHEMA_ENTRIES.filter(([, definition]) => definition.classification === 'contract-only').map(
    ([eventName]) => eventName
  )
) as readonly AnalyticsEventNamesMatching<
  AnalyticsSchemaType,
  { classification: 'contract-only' }
>[];

export const FUTURE_PRODUCT_EVENT_NAMES = Object.freeze(
  SCHEMA_ENTRIES.filter(([, definition]) => definition.classification === 'future').map(
    ([eventName]) => eventName
  )
) as readonly AnalyticsEventNamesMatching<AnalyticsSchemaType, { classification: 'future' }>[];

export const RUNTIME_USAGE_EVENT_NAMES = Object.freeze(
  SCHEMA_ENTRIES.filter(([, definition]) => definition.runtimeAllowed).map(
    ([eventName]) => eventName
  )
) as readonly AnalyticsEventNamesMatching<AnalyticsSchemaType, { runtimeAllowed: true }>[];

export const ANALYTICS_EVENT_CATALOG = Object.freeze(
  Object.fromEntries(
    SCHEMA_ENTRIES.map(([eventName, definition]) => [
      eventName,
      {
        name: eventName,
        featureArea: definition.featureArea,
        classification: definition.classification,
        runtimeAllowed: definition.runtimeAllowed,
        requiredParams: ANALYTICS_REQUIRED_PARAMS[eventName],
        optionalParams: ANALYTICS_OPTIONAL_PARAMS[eventName]
      }
    ])
  )
) as Readonly<
  Record<
    AnalyticsEventName,
    AnalyticsDerivedEventDefinition<AnalyticsEventName, FeatureArea, AnalyticsEventClassification>
  >
>;

export function getAnalyticsAllowedParams<EventName extends AnalyticsEventName>(
  eventName: EventName
): ReadonlyArray<string> {
  return [...ANALYTICS_REQUIRED_PARAMS[eventName], ...ANALYTICS_OPTIONAL_PARAMS[eventName]];
}

export function getAnalyticsConsentScope<EventName extends AnalyticsEventName>(
  eventName: EventName
): AnalyticsConsentScope {
  return ANALYTICS_SCHEMA[eventName].consentScope;
}
