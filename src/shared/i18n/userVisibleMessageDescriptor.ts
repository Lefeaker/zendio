export type UserVisibleMessageParam = string | number | boolean | null | undefined;

export type UserVisibleMessageValues = Record<string, UserVisibleMessageParam>;

export interface UserVisibleMessageDescriptor<Key extends string = string> {
  key: Key;
  values?: UserVisibleMessageValues;
  fallback?: string;
}

function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isUserVisibleMessageParam(value: unknown): value is UserVisibleMessageParam {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

export function isUserVisibleMessageValues(value: unknown): value is UserVisibleMessageValues {
  if (!isPlainObjectRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) => isUserVisibleMessageParam(entry));
}

export function isUserVisibleMessageDescriptor(
  value: unknown
): value is UserVisibleMessageDescriptor {
  if (!isPlainObjectRecord(value)) {
    return false;
  }

  if (typeof value.key !== 'string') {
    return false;
  }

  if (value.values !== undefined && !isUserVisibleMessageValues(value.values)) {
    return false;
  }

  if (value.fallback !== undefined && typeof value.fallback !== 'string') {
    return false;
  }

  return true;
}

export function toSerializableUserVisibleMessageDescriptor(
  descriptor: unknown
): UserVisibleMessageDescriptor | undefined {
  if (!isUserVisibleMessageDescriptor(descriptor)) {
    return undefined;
  }

  const values =
    descriptor.values === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(descriptor.values).filter(([, value]) => value !== undefined)
        );

  return {
    key: descriptor.key,
    ...(values !== undefined && Object.keys(values).length > 0 ? { values } : {}),
    ...(descriptor.fallback !== undefined ? { fallback: descriptor.fallback } : {})
  };
}
