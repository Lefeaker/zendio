function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function cloneStateValue<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  const structured: (<U>(input: U) => U) | undefined = globalThis.structuredClone;
  if (typeof structured === 'function') {
    return structured(value);
  }

  if (Array.isArray(value)) {
    const items = value as unknown[];
    return items.map((item) => cloneStateValue(item)) as T;
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = cloneStateValue(entry);
    }
    return result as T;
  }

  return value;
}

export function areStateValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (a === null || b === null || a === undefined || b === undefined) {
    return false;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index += 1) {
      if (!areStateValuesEqual(a[index], b[index])) {
        return false;
      }
    }
    return true;
  }

  if (isPlainObject(a) || isPlainObject(b)) {
    if (!isPlainObject(a) || !isPlainObject(b)) {
      return false;
    }

    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
      return false;
    }

    for (const key of aKeys) {
      if (!(key in b) || !areStateValuesEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
}
