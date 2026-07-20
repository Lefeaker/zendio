import { isFragmentSelectionTriggerMode } from './selectionTriggerMode';

export interface SelectionTriggerMigrationResult {
  options: MigrationRecord;
  migrated: boolean;
}

type MigrationValue = object | string | number | boolean | null | undefined;
type MigrationRecord = Record<string, MigrationValue>;

function isPlainObject(value: MigrationValue): value is MigrationRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Converts the retired modifier-enabled boolean into the canonical three-state
 * selection trigger contract. The input is never mutated and current data is
 * returned unchanged apart from defensive object cloning.
 */
export function migrateSelectionTriggerOptions(
  value: MigrationValue
): SelectionTriggerMigrationResult {
  if (!isPlainObject(value)) {
    return { options: {}, migrated: false };
  }

  const options = { ...value };
  if (!isPlainObject(value.fragmentClipper)) {
    return { options, migrated: false };
  }

  const fragmentClipper = { ...value.fragmentClipper };
  const hasRetiredField = Object.prototype.hasOwnProperty.call(
    fragmentClipper,
    'selectionModifierEnabled'
  );

  if (!isFragmentSelectionTriggerMode(fragmentClipper.selectionTriggerMode)) {
    const retiredValue = fragmentClipper.selectionModifierEnabled;
    if (typeof retiredValue === 'boolean') {
      fragmentClipper.selectionTriggerMode = retiredValue ? 'modifier' : 'direct';
    }
  }

  if (!hasRetiredField) {
    return { options, migrated: false };
  }

  delete fragmentClipper.selectionModifierEnabled;
  options.fragmentClipper = fragmentClipper;
  return { options, migrated: true };
}
