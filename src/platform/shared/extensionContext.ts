import { isObjectRecord, type ObjectRecord } from '../../shared/guards/object';

/** Chrome rejects every extension API call after its isolated context is replaced. */
let invalidated = false;
const listeners = new Set<() => void>();

export function reportExtensionContextInvalidated<Failure>(error: Failure): boolean {
  if (!isExtensionContextInvalidated(error)) return false;
  if (!invalidated) {
    invalidated = true;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* Preserve the original transport error. */
      }
    }
  }
  return true;
}

export function onExtensionContextInvalidated(listener: () => void): () => void {
  listeners.add(listener);
  if (invalidated) listener();
  return () => {
    listeners.delete(listener);
  };
}

export function isExtensionContextInvalidated<Failure>(error: Failure): boolean {
  const matches = (value: object | string | undefined): boolean =>
    typeof value === 'string' && /extension context invalidated/i.test(value);
  if (typeof error === 'string') return matches(error);
  let current: ObjectRecord | undefined = isObjectRecord(error) ? error : undefined;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current) return false;
    if (typeof current.message === 'string' && matches(current.message)) return true;
    if (typeof current.cause === 'string') return matches(current.cause);
    current = isObjectRecord(current.cause) ? current.cause : undefined;
  }
  return false;
}
