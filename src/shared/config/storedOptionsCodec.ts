import type { CompleteOptions } from '../types/options';
import {
  StoredOptionsSchema,
  type StoredOptions as SchemaStoredOptions
} from '../schemas/options.schema';
import {
  snapshotPlainStructuredData,
  type PlainStructuredObject,
  type PlainStructuredValue
} from './losslessObjectBoundary';
import { mergeOptions } from './optionsMerger';
import {
  isValidStoredOptionsPatchPath,
  isStoredOptionsKnownSection,
  validateStrictStoredOptionsSection
} from './optionsSanitizer';
import {
  createStoredOptionsBoundaryIssue,
  createStoredOptionsPatchIssue,
  createStoredOptionsSchemaIssue,
  createStrippedStoredOptionsIssue,
  createUnknownStoredOptionsRootIssue,
  issuesFromZod,
  type StoredOptionsIssue,
  type StoredOptionsKnownSection
} from './storedOptionsIssues';
import {
  migrateStoredOptionsRaw,
  STORED_OPTIONS_MIGRATION_VERSION,
  type StoredOptionsMigrationAction
} from './storedOptionsMigrations';

export const STORED_OPTIONS_DELETE = Object.freeze({ $zendio: 'delete' });

export interface DecodedStoredOptions {
  readonly migrationVersion: typeof STORED_OPTIONS_MIGRATION_VERSION;
  readonly canonical: SchemaStoredOptions;
  readonly runtime: CompleteOptions;
  readonly normalizedRaw: PlainStructuredObject;
  readonly preserved: {
    readonly unknownRoots: PlainStructuredObject;
    readonly invalidSections: Partial<Record<StoredOptionsKnownSection, PlainStructuredValue>>;
  };
  readonly issues: readonly StoredOptionsIssue[];
  readonly migrations: readonly StoredOptionsMigrationAction[];
  readonly automaticWritebackIsLossless: boolean;
}

export type StoredOptionsMutationResult =
  | { readonly success: true; readonly value: PlainStructuredObject }
  | { readonly success: false; readonly issues: readonly StoredOptionsIssue[] };

export type StoredOptionsReplacementResult =
  | { readonly success: true; readonly value: SchemaStoredOptions }
  | { readonly success: false; readonly issues: readonly StoredOptionsIssue[] };

function isObject(value: PlainStructuredValue | undefined): value is PlainStructuredObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defineDataProperty(
  target: PlainStructuredObject,
  key: string,
  value: PlainStructuredValue
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  });
}

function emptyDecoded(issue?: StoredOptionsIssue): DecodedStoredOptions {
  return {
    migrationVersion: STORED_OPTIONS_MIGRATION_VERSION,
    canonical: {},
    runtime: mergeOptions(),
    normalizedRaw: {},
    preserved: { unknownRoots: {}, invalidSections: {} },
    issues: issue ? [issue] : [],
    migrations: [],
    automaticWritebackIsLossless: issue === undefined
  };
}

export function decodeStoredOptions(input: unknown): DecodedStoredOptions {
  if (input === null || input === undefined) return emptyDecoded();
  const snapshot = snapshotPlainStructuredData(input);
  if (!snapshot.ok) return emptyDecoded(createStoredOptionsBoundaryIssue('root', snapshot));
  if (!isObject(snapshot.value)) return emptyDecoded(createStoredOptionsSchemaIssue('root'));
  const migration = migrateStoredOptionsRaw(snapshot.value);
  const candidate: Record<string, unknown> = {};
  const unknownRoots: PlainStructuredObject = {};
  const invalidSections: Partial<Record<StoredOptionsKnownSection, PlainStructuredValue>> = {};
  const issues: StoredOptionsIssue[] = [];
  for (const [key, value] of Object.entries(migration.raw)) {
    if (!isStoredOptionsKnownSection(key)) {
      defineDataProperty(unknownRoots, key, value);
      issues.push(createUnknownStoredOptionsRootIssue());
      continue;
    }
    const result = validateStrictStoredOptionsSection(key, value);
    if (result.success) {
      candidate[key] = result.value;
      continue;
    }
    invalidSections[key] = value;
    if (result.reason === 'schema' && result.error)
      issues.push(...issuesFromZod(key, result.error));
    else if (result.reason === 'stripped') issues.push(createStrippedStoredOptionsIssue(key));
    else issues.push(createStoredOptionsSchemaIssue(key));
  }
  const parsed = StoredOptionsSchema.safeParse(candidate);
  if (!parsed.success) issues.push(...issuesFromZod('root', parsed.error));
  const canonical = parsed.success ? parsed.data : {};
  return {
    migrationVersion: migration.version,
    canonical,
    runtime: mergeOptions(canonical),
    normalizedRaw: migration.raw,
    preserved: { unknownRoots, invalidSections },
    issues,
    migrations: migration.actions,
    automaticWritebackIsLossless: parsed.success && issues.length === 0
  };
}

function isDelete(value: PlainStructuredValue): boolean {
  return isObject(value) && Object.keys(value).length === 1 && value.$zendio === 'delete';
}

function patchFailure(
  section: StoredOptionsKnownSection | 'root',
  nested?: readonly string[]
): StoredOptionsMutationResult {
  return {
    success: false,
    issues: [createStoredOptionsPatchIssue(section, Boolean(nested?.length))]
  };
}

export function applyStoredOptionsPatch(
  input: unknown,
  patch: unknown
): StoredOptionsMutationResult {
  const patchSnapshot = snapshotPlainStructuredData(patch);
  if (!patchSnapshot.ok || !isObject(patchSnapshot.value)) return patchFailure('root');
  const keys = Object.keys(patchSnapshot.value);
  const pathValue = patchSnapshot.value.path;
  if (
    keys.length !== 2 ||
    !keys.includes('path') ||
    !keys.includes('value') ||
    !Array.isArray(pathValue) ||
    !pathValue.every((part) => typeof part === 'string')
  )
    return patchFailure('root');
  if (!isValidStoredOptionsPatchPath(pathValue)) return patchFailure('root');
  const [section, field, nested] = pathValue;
  const value = patchSnapshot.value.value;
  if (value === undefined) return patchFailure(section, pathValue.slice(1));
  const rawSnapshot = snapshotPlainStructuredData(input ?? {});
  if (!rawSnapshot.ok || !isObject(rawSnapshot.value)) return patchFailure('root');
  const migrated = migrateStoredOptionsRaw(rawSnapshot.value).raw;
  const next: PlainStructuredObject = { ...migrated };
  if (isDelete(value) && pathValue.length === 1) {
    delete next[section];
    return { success: true, value: next };
  }
  if (pathValue.length === 1) {
    const validated = validateStrictStoredOptionsSection(section, value);
    if (!validated.success) return patchFailure(section);
    next[section] = validated.value;
    return { success: true, value: next };
  }
  const decoded = decodeStoredOptions(migrated);
  const current =
    decoded.preserved.invalidSections[section] === undefined ? next[section] : undefined;
  const sectionValue: PlainStructuredObject = isObject(current) ? { ...current } : {};
  if (nested) {
    const currentNested = sectionValue[field];
    const nestedValue: PlainStructuredObject = isObject(currentNested) ? { ...currentNested } : {};
    if (isDelete(value)) delete nestedValue[nested];
    else nestedValue[nested] = value;
    if (Object.keys(nestedValue).length) sectionValue[field] = nestedValue;
    else delete sectionValue[field];
  } else if (isDelete(value)) delete sectionValue[field];
  else sectionValue[field] = value;
  if (Object.keys(sectionValue).length === 0) {
    delete next[section];
    return { success: true, value: next };
  }
  const validated = validateStrictStoredOptionsSection(section, sectionValue);
  if (!validated.success) return patchFailure(section, pathValue.slice(1));
  next[section] = validated.value;
  return { success: true, value: next };
}

export function encodeStoredOptionsReplacement(input: unknown): StoredOptionsReplacementResult {
  const snapshot = snapshotPlainStructuredData(input);
  if (!snapshot.ok)
    return { success: false, issues: [createStoredOptionsBoundaryIssue('root', snapshot)] };
  if (!isObject(snapshot.value))
    return { success: false, issues: [createStoredOptionsSchemaIssue('root')] };
  const migrated = migrateStoredOptionsRaw(snapshot.value).raw;
  const candidate: Record<string, unknown> = {};
  const issues: StoredOptionsIssue[] = [];
  for (const [key, value] of Object.entries(migrated)) {
    if (!isStoredOptionsKnownSection(key)) {
      issues.push(createUnknownStoredOptionsRootIssue());
      continue;
    }
    const result = validateStrictStoredOptionsSection(key, value);
    if (result.success) candidate[key] = result.value;
    else if (result.reason === 'schema' && result.error)
      issues.push(...issuesFromZod(key, result.error));
    else if (result.reason === 'stripped') issues.push(createStrippedStoredOptionsIssue(key));
    else issues.push(createStoredOptionsSchemaIssue(key));
  }
  if (issues.length) return { success: false, issues };
  const parsed = StoredOptionsSchema.safeParse(candidate);
  return parsed.success
    ? { success: true, value: parsed.data }
    : { success: false, issues: issuesFromZod('root', parsed.error) };
}

export function measureStoredOptionsValueBytes(
  input: unknown
):
  | { readonly success: true; readonly bytes: number }
  | { readonly success: false; readonly issues: readonly StoredOptionsIssue[] } {
  const measured = snapshotPlainStructuredData(input);
  return measured.ok
    ? { success: true, bytes: measured.measurement.utf8Bytes }
    : { success: false, issues: [createStoredOptionsBoundaryIssue('root', measured)] };
}
