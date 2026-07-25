export interface PlainStructuredObject {
  [key: string]: PlainStructuredValue;
}

export type PlainStructuredValue =
  | null
  | boolean
  | number
  | string
  | PlainStructuredValue[]
  | PlainStructuredObject;

export interface PlainStructuredDataLimits {
  maxDepth: number;
  maxNodes: number;
  maxUtf8Bytes: number;
}

export interface PlainStructuredDataMeasurement {
  nodes: number;
  depth: number;
  utf8Bytes: number;
}

export type PlainStructuredDataFailureCode =
  | 'UNSUPPORTED_TYPE'
  | 'NON_FINITE_NUMBER'
  | 'SYMBOL_KEY'
  | 'ACCESSOR_PROPERTY'
  | 'UNSUPPORTED_DESCRIPTOR'
  | 'UNSUPPORTED_PROTOTYPE'
  | 'SPARSE_ARRAY'
  | 'EXTRA_ARRAY_PROPERTY'
  | 'CYCLE'
  | 'PROTOTYPE_TRAP'
  | 'KEY_TRAP'
  | 'DESCRIPTOR_TRAP'
  | 'MAX_DEPTH'
  | 'MAX_NODES'
  | 'MAX_UTF8_BYTES'
  | 'INVALID_JSON'
  | 'INVALID_LIMITS'
  | 'INSPECTION_FAILED';

export interface PlainStructuredDataFailure {
  ok: false;
  code: PlainStructuredDataFailureCode;
}

export type Success<T extends object> = { ok: true } & T;

export type PlainStructuredDataResult =
  | Success<{
      value: PlainStructuredValue;
      measurement: PlainStructuredDataMeasurement;
    }>
  | PlainStructuredDataFailure;

export type PlainStructuredDataMeasureResult =
  | Success<{ measurement: PlainStructuredDataMeasurement }>
  | PlainStructuredDataFailure;

export type PlainStructuredDataEqualityResult =
  | Success<{ equal: boolean }>
  | PlainStructuredDataFailure;

export interface Context {
  limits: PlainStructuredDataLimits;
  active: Set<object>;
  nodes: number;
  depth: number;
  utf8Bytes: number;
}

export interface InspectedObject {
  array: boolean;
  keys: string[];
}

export interface DataDescriptor {
  enumerable: boolean | undefined;
  value: unknown;
}

export type Value = PlainStructuredValue;
export type RecordValue = PlainStructuredObject;
export type Overrides = Partial<PlainStructuredDataLimits>;
export type Result = PlainStructuredDataResult;
export type MeasureResult = PlainStructuredDataMeasureResult;
export type EqualityResult = PlainStructuredDataEqualityResult;
