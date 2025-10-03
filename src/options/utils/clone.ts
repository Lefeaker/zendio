export function deepClone<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  const structured = (globalThis as typeof globalThis & { structuredClone?: <U>(v: U) => U }).structuredClone;
  if (typeof structured === 'function') {
    return structured(value);
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}
