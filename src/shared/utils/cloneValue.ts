export function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
