export type RuntimePropertyValue =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | object
  | ((...args: never[]) => void);

export type ObjectRecord = Record<string, RuntimePropertyValue>;

export function isObjectRecord(value: unknown): value is ObjectRecord {
  return typeof value === 'object' && value !== null;
}

export function isOptionalString(value: RuntimePropertyValue): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

export function isNonEmptyString(value: RuntimePropertyValue): value is string {
  return typeof value === 'string' && value.length > 0;
}
