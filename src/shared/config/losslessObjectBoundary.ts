/* prettier-ignore */ export interface PlainStructuredObject { [key: string]: PlainStructuredValue; }
/* prettier-ignore */ export type PlainStructuredValue = null | boolean | number | string | PlainStructuredValue[] | PlainStructuredObject;
/* prettier-ignore */ export interface PlainStructuredDataLimits { maxDepth: number; maxNodes: number; maxUtf8Bytes: number; }
/* prettier-ignore */ export interface PlainStructuredDataMeasurement { nodes: number; depth: number; utf8Bytes: number; }
/* prettier-ignore */ export type PlainStructuredDataFailureCode = 'UNSUPPORTED_TYPE' | 'NON_FINITE_NUMBER' | 'SYMBOL_KEY' | 'ACCESSOR_PROPERTY' | 'UNSUPPORTED_DESCRIPTOR' | 'UNSUPPORTED_PROTOTYPE' | 'SPARSE_ARRAY' | 'EXTRA_ARRAY_PROPERTY' | 'CYCLE' | 'PROTOTYPE_TRAP' | 'KEY_TRAP' | 'DESCRIPTOR_TRAP' | 'MAX_DEPTH' | 'MAX_NODES' | 'MAX_UTF8_BYTES' | 'INVALID_JSON' | 'INVALID_LIMITS' | 'INSPECTION_FAILED';
/* prettier-ignore */ export interface PlainStructuredDataFailure { ok: false; code: PlainStructuredDataFailureCode; }
type Success<T extends object> = { ok: true } & T;
/* prettier-ignore */ export type PlainStructuredDataResult = Success<{ value: PlainStructuredValue; measurement: PlainStructuredDataMeasurement }> | PlainStructuredDataFailure;
/* prettier-ignore */ export type PlainStructuredDataMeasureResult = Success<{ measurement: PlainStructuredDataMeasurement }> | PlainStructuredDataFailure;
/* prettier-ignore */ export type PlainStructuredDataEqualityResult = Success<{ equal: boolean }> | PlainStructuredDataFailure;
/* prettier-ignore */ export const DEFAULT_PLAIN_STRUCTURED_DATA_LIMITS: Readonly<PlainStructuredDataLimits> = Object.freeze({ maxDepth: 32, maxNodes: 10_000, maxUtf8Bytes: 512 * 1024 });
/* prettier-ignore */ class BoundaryAbort { constructor(readonly code: PlainStructuredDataFailureCode) {} }
/* prettier-ignore */ interface Context { limits: PlainStructuredDataLimits; active: Set<object>; nodes: number; depth: number; utf8Bytes: number; }
/* prettier-ignore */ interface InspectedObject { array: boolean; keys: string[]; }
/* prettier-ignore */ interface DataDescriptor { enumerable: boolean | undefined; value: unknown; }
type Value = PlainStructuredValue;
type RecordValue = PlainStructuredObject;
type Overrides = Partial<PlainStructuredDataLimits>;
type Result = PlainStructuredDataResult;
type MeasureResult = PlainStructuredDataMeasureResult;
type EqualityResult = PlainStructuredDataEqualityResult;
function abort(code: PlainStructuredDataFailureCode): never {
  throw new BoundaryAbort(code);
}
function failure(code: PlainStructuredDataFailureCode): PlainStructuredDataFailure {
  return Object.freeze({ ok: false, code });
}
function resolveLimits(overrides?: Partial<PlainStructuredDataLimits>): PlainStructuredDataLimits {
  const limits = { ...DEFAULT_PLAIN_STRUCTURED_DATA_LIMITS, ...overrides };
  const valid = (value: number, maximum: number): boolean =>
    Number.isSafeInteger(value) && value >= 0 && value <= maximum;
  if (
    !valid(limits.maxDepth, 128) ||
    !valid(limits.maxNodes, 100_000) ||
    !valid(limits.maxUtf8Bytes, 16 * 1024 * 1024)
  )
    abort('INVALID_LIMITS');
  return limits;
}
function addBytes(context: Context, count: number): void {
  context.utf8Bytes += count;
  if (context.utf8Bytes > context.limits.maxUtf8Bytes) abort('MAX_UTF8_BYTES');
}
function stringBytes(value: string, maximum: number, jsonEncoded: boolean): number {
  let bytes = jsonEncoded ? 2 : 0;
  if (bytes > maximum) abort('MAX_UTF8_BYTES');
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      jsonEncoded &&
      (code === 0x22 ||
        code === 0x5c ||
        code === 0x08 ||
        code === 0x09 ||
        code === 0x0a ||
        code === 0x0c ||
        code === 0x0d)
    )
      bytes += 2;
    else if (jsonEncoded && code < 0x20) bytes += 6;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += jsonEncoded ? 6 : 3;
    } else if (code >= 0xd800 && code <= 0xdfff) bytes += jsonEncoded ? 6 : 3;
    else bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3;
    if (bytes > maximum) abort('MAX_UTF8_BYTES');
  }
  return bytes;
}
function inspectObject(value: object): InspectedObject {
  let array: boolean;
  let prototype: object | null;
  try {
    array = Array.isArray(value);
    prototype = Reflect.getPrototypeOf(value);
  } catch {
    abort('PROTOTYPE_TRAP');
  }
  if (array ? prototype !== Array.prototype : prototype !== null && prototype !== Object.prototype)
    abort('UNSUPPORTED_PROTOTYPE');
  let ownKeys: PropertyKey[];
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    abort('KEY_TRAP');
  }
  if (ownKeys.some((key) => typeof key === 'symbol')) abort('SYMBOL_KEY');
  return { array, keys: ownKeys as string[] };
}
function dataDescriptor(value: object, key: string): DataDescriptor {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  } catch {
    abort('DESCRIPTOR_TRAP');
  }
  if (!descriptor) abort('DESCRIPTOR_TRAP');
  if (!('value' in descriptor)) abort('ACCESSOR_PROPERTY');
  return { enumerable: descriptor.enumerable, value: descriptor.value };
}
function visit(value: unknown, depth: number, context: Context): Value {
  if (depth > context.limits.maxDepth) abort('MAX_DEPTH');
  context.nodes += 1;
  if (context.nodes > context.limits.maxNodes) abort('MAX_NODES');
  context.depth = Math.max(context.depth, depth);
  if (value === null) {
    addBytes(context, 4);
    return null;
  }
  if (typeof value === 'boolean') {
    addBytes(context, value ? 4 : 5);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) abort('NON_FINITE_NUMBER');
    addBytes(context, Object.is(value, -0) ? 1 : String(value).length);
    return value;
  }
  if (typeof value === 'string') {
    addBytes(context, stringBytes(value, context.limits.maxUtf8Bytes - context.utf8Bytes, true));
    return value;
  }
  if (typeof value !== 'object') abort('UNSUPPORTED_TYPE');
  if (context.active.has(value)) abort('CYCLE');
  const inspected = inspectObject(value);
  context.active.add(value);
  try {
    return inspected.array
      ? visitArray(value, inspected.keys, depth, context)
      : visitRecord(value, inspected.keys, depth, context);
  } finally {
    context.active.delete(value);
  }
}
function visitArray(value: object, keys: string[], depth: number, context: Context): Value[] {
  const length = dataDescriptor(value, 'length').value;
  if (typeof length !== 'number') abort('UNSUPPORTED_DESCRIPTOR');
  if (!Number.isSafeInteger(length) || length < 0 || length > 0xffff_ffff)
    abort('UNSUPPORTED_DESCRIPTOR');
  if (length > context.limits.maxNodes - context.nodes) abort('MAX_NODES');
  addBytes(context, 2 + Math.max(0, length - 1));
  const output = new Array<Value>(length);
  let count = 0;
  for (const key of keys) {
    if (key === 'length') continue;
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= length || String(index) !== key)
      abort('EXTRA_ARRAY_PROPERTY');
    const descriptor = dataDescriptor(value, key);
    if (!descriptor.enumerable) abort('UNSUPPORTED_DESCRIPTOR');
    output[index] = visit(descriptor.value, depth + 1, context);
    count += 1;
  }
  if (count !== length) abort('SPARSE_ARRAY');
  return output;
}
function visitRecord(value: object, keys: string[], depth: number, context: Context): RecordValue {
  if (keys.length > context.limits.maxNodes - context.nodes) abort('MAX_NODES');
  addBytes(context, 2 + Math.max(0, keys.length - 1) + keys.length);
  const output = Object.create(null) as RecordValue;
  for (const key of keys) {
    const descriptor = dataDescriptor(value, key);
    if (!descriptor.enumerable) abort('UNSUPPORTED_DESCRIPTOR');
    addBytes(context, stringBytes(key, context.limits.maxUtf8Bytes - context.utf8Bytes, true));
    const cloned = visit(descriptor.value, depth + 1, context);
    output[key] = cloned;
  }
  return output;
}
export function snapshotPlainStructuredData(value: unknown, limits?: Overrides): Result {
  try {
    const resolved = resolveLimits(limits);
    const context: Context = {
      limits: resolved,
      active: new Set(),
      nodes: 0,
      depth: 0,
      utf8Bytes: 0
    };
    const cloned = visit(value, 0, context);
    const measurement = Object.freeze({
      nodes: context.nodes,
      depth: context.depth,
      utf8Bytes: context.utf8Bytes
    });
    return { ok: true, value: cloned, measurement };
  } catch (error) {
    return failure(error instanceof BoundaryAbort ? error.code : 'INSPECTION_FAILED');
  }
}
export function parseBoundedJson(text: string, limits?: Overrides): Result {
  let resolved: PlainStructuredDataLimits;
  try {
    resolved = resolveLimits(limits);
    if (typeof text !== 'string') return failure('UNSUPPORTED_TYPE');
    stringBytes(text, resolved.maxUtf8Bytes, false);
  } catch (error) {
    return failure(error instanceof BoundaryAbort ? error.code : 'INSPECTION_FAILED');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return failure('INVALID_JSON');
  }
  return snapshotPlainStructuredData(parsed, resolved);
}
export function measurePlainStructuredData(value: unknown, limits?: Overrides): MeasureResult {
  const result = snapshotPlainStructuredData(value, limits);
  return result.ok ? { ok: true, measurement: result.measurement } : result;
}
function equalValues(left: Value, right: Value): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null)
    return false;
  const leftArray = Array.isArray(left) ? (left as Value[]) : null;
  const rightArray = Array.isArray(right) ? (right as Value[]) : null;
  if (leftArray || rightArray) {
    if (!leftArray || !rightArray || leftArray.length !== rightArray.length) return false;
    return leftArray.every((value, index) => equalValues(value, rightArray[index] as Value));
  }
  const leftRecord = left as RecordValue;
  const rightRecord = right as RecordValue;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightRecord, key) &&
        equalValues(leftRecord[key] as Value, rightRecord[key] as Value)
    )
  );
}
export function plainStructuredDataEqual(
  left: unknown,
  right: unknown,
  limits?: Overrides
): EqualityResult {
  const leftResult = snapshotPlainStructuredData(left, limits);
  if (!leftResult.ok) return leftResult;
  const rightResult = snapshotPlainStructuredData(right, limits);
  return rightResult.ok
    ? { ok: true, equal: equalValues(leftResult.value, rightResult.value) }
    : rightResult;
}
