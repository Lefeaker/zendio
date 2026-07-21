import type { ZodError } from 'zod';
import type { PlainStructuredDataFailure } from './losslessObjectBoundary';

export const STORED_OPTIONS_KNOWN_ROOTS = Object.freeze([
  'interfaceTheme',
  'rest',
  'templates',
  'domainMappings',
  'aiChat',
  'deepResearch',
  'fragmentClipper',
  'readingSession',
  'video',
  'classifier',
  'experimentalAi',
  'pageSummary',
  'readingOverlaySummary',
  'subtitleTranslation',
  'privacyPreferences',
  'vaultRouter',
  'yamlConfig'
] as const);

export const STORED_OPTIONS_KNOWN_SECTIONS = STORED_OPTIONS_KNOWN_ROOTS;
export type StoredOptionsKnownRoot = (typeof STORED_OPTIONS_KNOWN_ROOTS)[number];
export type StoredOptionsKnownSection = StoredOptionsKnownRoot;
export type StoredOptionsIssueSection = 'root' | StoredOptionsKnownRoot;
export type StoredOptionsIssueCode =
  | `BOUNDARY_${PlainStructuredDataFailure['code']}`
  | 'SCHEMA_INVALID'
  | 'UNKNOWN_ROOT'
  | 'FIELD_STRIPPED'
  | 'PATCH_INVALID'
  | 'MIGRATION_INVALID';
export type StoredOptionsRedactedPath =
  | '$'
  | '$.<redacted>'
  | `$.${StoredOptionsKnownRoot}`
  | `$.${StoredOptionsKnownRoot}.<redacted>`;

export interface StoredOptionsIssue {
  readonly code: StoredOptionsIssueCode;
  readonly section: StoredOptionsIssueSection;
  readonly path: StoredOptionsRedactedPath;
}

export function redactStoredOptionsPath(
  section: StoredOptionsIssueSection,
  nested = false
): StoredOptionsRedactedPath {
  if (section === 'root') return nested ? '$.<redacted>' : '$';
  return nested ? `$.${section}.<redacted>` : `$.${section}`;
}

export function createStoredOptionsIssue(
  code: StoredOptionsIssueCode,
  section: StoredOptionsIssueSection,
  nested = false
): StoredOptionsIssue {
  return Object.freeze({ code, section, path: redactStoredOptionsPath(section, nested) });
}

export function createStoredOptionsBoundaryIssue(
  section: StoredOptionsIssueSection,
  failure: PlainStructuredDataFailure,
  nested = false
): StoredOptionsIssue {
  return createStoredOptionsIssue(`BOUNDARY_${failure.code}`, section, nested);
}

export function createStoredOptionsSchemaIssue(
  section: StoredOptionsIssueSection,
  nested = false
): StoredOptionsIssue {
  return createStoredOptionsIssue('SCHEMA_INVALID', section, nested);
}

export function createUnknownStoredOptionsRootIssue(): StoredOptionsIssue {
  return createStoredOptionsIssue('UNKNOWN_ROOT', 'root', true);
}

export function createStrippedStoredOptionsIssue(
  section: StoredOptionsIssueSection
): StoredOptionsIssue {
  return createStoredOptionsIssue('FIELD_STRIPPED', section, true);
}

export function createStoredOptionsPatchIssue(
  section: StoredOptionsIssueSection,
  nested: boolean | readonly unknown[] = false
): StoredOptionsIssue {
  return createStoredOptionsIssue(
    'PATCH_INVALID',
    section,
    typeof nested === 'boolean' ? nested : nested.length > 0
  );
}

export function createStoredOptionsMigrationIssue(
  section: StoredOptionsIssueSection,
  nested = false
): StoredOptionsIssue {
  return createStoredOptionsIssue('MIGRATION_INVALID', section, nested);
}

export function issuesFromZod(
  section: StoredOptionsIssueSection,
  error: ZodError
): readonly StoredOptionsIssue[] {
  if (error.issues.length === 0) return Object.freeze([]);
  const nested = error.issues.some((issue) => issue.path.length > 0);
  return Object.freeze([createStoredOptionsSchemaIssue(section, nested)]);
}
