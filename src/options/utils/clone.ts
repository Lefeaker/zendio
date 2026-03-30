import { cloneValue } from '../../shared/utils/cloneValue';

export function deepClone<T>(value: T): T {
  return cloneValue(value);
}
