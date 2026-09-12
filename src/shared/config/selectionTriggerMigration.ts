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
  const retiredValue = fragmentClipper.selectionModifierEnabled;

  // Invalid legacy values are deliberately left in place. The raw-first codec
  // must preserve and report them instead of turning an unrecognised value into
  // a lossy successful migration.
  if (!hasRetiredField || typeof retiredValue !== 'boolean') {
    return { options, migrated: false };
  }

  const hasCurrentField = Object.prototype.hasOwnProperty.call(
    fragmentClipper,
    'selectionTriggerMode'
  );
  if (hasCurrentField && !isFragmentSelectionTriggerMode(fragmentClipper.selectionTriggerMode)) {
    return { options, migrated: false };
  }
  if (!hasCurrentField) {
    fragmentClipper.selectionTriggerMode = retiredValue ? 'modifier' : 'direct';
  }

  delete fragmentClipper.selectionModifierEnabled;
  options.fragmentClipper = fragmentClipper;
  return { options, migrated: true };
}
