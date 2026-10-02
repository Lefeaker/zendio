import { isObjectRecord, type RuntimePropertyValue } from '../guards/object';
import { plainStructuredDataEqual } from './losslessObjectBoundary';
import type { CompleteOptions } from '../types/options';
import type { OptionsPatch } from '../types/optionsMutationMessages';

/** Compare reviewed values against the writer's current, default-composed snapshot. */
export function optionsPatchPreconditionsMatch(
  current: CompleteOptions,
  expected: readonly OptionsPatch[]
): boolean {
  return expected.every(({ path, value }) => {
    let found: RuntimePropertyValue = current;
    for (const part of path) {
      found =
        isObjectRecord(found) &&
        !Array.isArray(found) &&
        Object.prototype.hasOwnProperty.call(found, part)
          ? found[part]
          : undefined;
    }
    const absent = isObjectRecord(value) && '$zendio' in value && value.$zendio === 'delete';
    if (found === undefined || absent) return found === undefined && absent;
    const equality = plainStructuredDataEqual(found, value);
    return equality.ok && equality.equal;
  });
}
