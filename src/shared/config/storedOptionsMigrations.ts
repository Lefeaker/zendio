import {
  snapshotPlainStructuredData,
  type PlainStructuredObject,
  type PlainStructuredValue
} from './losslessObjectBoundary';
import { migrateSelectionTriggerOptions } from './selectionTriggerMigration';
import { migrateTaxonomyValue } from './taxonomyMigration';
import { validateStrictStoredOptionsSection } from './optionsSanitizer';
import type { StoredOptionsKnownSection } from './storedOptionsIssues';

export const STORED_OPTIONS_MIGRATION_VERSION = 1 as const;

export type StoredOptionsMigrationStage =
  | 'root-rest'
  | 'template-clipper'
  | 'video-aliases'
  | 'selection-trigger'
  | 'taxonomy'
  | 'yaml-vault';

export interface StoredOptionsMigrationAction {
  readonly version: typeof STORED_OPTIONS_MIGRATION_VERSION;
  readonly stage: StoredOptionsMigrationStage;
  readonly section: StoredOptionsKnownSection;
  readonly code: string;
}

export interface StoredOptionsMigrationResult {
  readonly version: typeof STORED_OPTIONS_MIGRATION_VERSION;
  readonly raw: PlainStructuredObject;
  readonly actions: readonly StoredOptionsMigrationAction[];
}
type DataObject = Record<string, PlainStructuredValue>;
function isDataObject(value: PlainStructuredValue | undefined): value is DataObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: DataObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function action(
  actions: StoredOptionsMigrationAction[],
  stage: StoredOptionsMigrationStage,
  section: StoredOptionsKnownSection,
  code: string
): void {
  actions.push(Object.freeze({ version: STORED_OPTIONS_MIGRATION_VERSION, stage, section, code }));
}

function replaceValidSection(
  raw: DataObject,
  section: StoredOptionsKnownSection,
  value: PlainStructuredValue
): boolean {
  const validated = validateStrictStoredOptionsSection(section, value);
  if (!validated.success) return false;
  raw[section] = validated.value;
  return true;
}

function migrateRootAndRest(raw: DataObject, actions: StoredOptionsMigrationAction[]): void {
  const rest = raw.rest;
  if (!isDataObject(rest) || !hasOwn(rest, 'rootDir')) {
    return;
  }
  const next = { ...rest };
  delete next.rootDir;
  if (!replaceValidSection(raw, 'rest', next)) return;
  action(actions, 'root-rest', 'rest', 'legacy-root-dir-removed');
}

function migrateTemplateClipper(raw: DataObject, actions: StoredOptionsMigrationAction[]): void {
  const templates = raw.templates;
  if (!isDataObject(templates) || typeof templates.clipper !== 'string') {
    return;
  }
  const next = { ...templates };
  if (!hasOwn(next, 'fragment')) {
    next.fragment = templates.clipper;
  }
  if (!hasOwn(next, 'reading')) {
    next.reading = templates.clipper;
  }
  delete next.clipper;
  if (!replaceValidSection(raw, 'templates', next)) return;
  action(actions, 'template-clipper', 'templates', 'legacy-clipper-migrated');
}

const VIDEO_ALIASES = [
  ['controlBarAutoPauseEnabled', 'controlBarAutoPause'],
  ['controlBarCaptureScreenshotEnabled', 'controlBarScreenshot']
] as const;

function migrateVideoAliases(raw: DataObject, actions: StoredOptionsMigrationAction[]): void {
  const video = raw.video;
  if (!isDataObject(video)) {
    return;
  }
  let next: DataObject | undefined;
  for (const [legacyKey, currentKey] of VIDEO_ALIASES) {
    const legacyValue = video[legacyKey];
    if (typeof legacyValue !== 'boolean') {
      continue;
    }
    next ??= { ...video };
    if (!hasOwn(next, currentKey)) {
      next[currentKey] = legacyValue;
    }
    delete next[legacyKey];
  }
  if (next) {
    if (!replaceValidSection(raw, 'video', next)) return;
    action(actions, 'video-aliases', 'video', 'legacy-video-fields-migrated');
  }
}

function migrateSelection(raw: DataObject, actions: StoredOptionsMigrationAction[]): void {
  const result = migrateSelectionTriggerOptions(raw);
  if (!result.migrated) {
    return;
  }
  const fragmentClipper = result.options.fragmentClipper;
  const snapshot = snapshotPlainStructuredData(fragmentClipper);
  if (
    snapshot.ok &&
    isDataObject(snapshot.value) &&
    replaceValidSection(raw, 'fragmentClipper', snapshot.value)
  ) {
    action(actions, 'selection-trigger', 'fragmentClipper', 'legacy-selection-migrated');
  }
}

function migrateTaxonomy(raw: DataObject, actions: StoredOptionsMigrationAction[]): void {
  const classifier = raw.classifier;
  if (!isDataObject(classifier) || !hasOwn(classifier, 'taxonomy')) {
    return;
  }
  const result = migrateTaxonomyValue(classifier.taxonomy);
  if (!result.success || !result.migrated) {
    return;
  }
  const snapshot = snapshotPlainStructuredData(result.value);
  if (!snapshot.ok) {
    return;
  }
  if (!replaceValidSection(raw, 'classifier', { ...classifier, taxonomy: snapshot.value })) return;
  action(actions, 'taxonomy', 'classifier', 'legacy-taxonomy-migrated');
}

const YAML_ENTRY_KEYS = new Set(['contentType', 'fields', 'customFields', 'domainOverrides']);

function mapLegacyYamlEntries(value: PlainStructuredValue): DataObject | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const mapped: DataObject = {};
  for (const entry of value) {
    if (!isDataObject(entry) || Object.keys(entry).some((key) => !YAML_ENTRY_KEYS.has(key))) {
      return undefined;
    }
    const contentType = entry.contentType;
    if (
      typeof contentType !== 'string' ||
      !['ai_chat', 'article', 'clipper', 'video'].includes(contentType) ||
      hasOwn(mapped, contentType)
    ) {
      return undefined;
    }
    const next = { ...entry };
    delete next.contentType;
    mapped[contentType] = next;
  }
  return mapped;
}

function migrateYaml(raw: DataObject, actions: StoredOptionsMigrationAction[]): void {
  const yaml = raw.yamlConfig;
  const direct = yaml === undefined ? undefined : mapLegacyYamlEntries(yaml);
  if (direct) {
    const candidate: DataObject = { contentTypes: direct };
    const validated = validateStrictStoredOptionsSection('yamlConfig', candidate);
    if (!validated.success) return;
    raw.yamlConfig = validated.value;
    action(actions, 'yaml-vault', 'yamlConfig', 'legacy-yaml-array-migrated');
    return;
  }
  if (!isDataObject(yaml) || !Array.isArray(yaml.contentTypes)) {
    return;
  }
  const mapped = mapLegacyYamlEntries(yaml.contentTypes);
  if (
    !mapped ||
    Object.keys(yaml).some((key) => key !== 'contentTypes' && key !== 'globalFields')
  ) {
    return;
  }
  const candidate: DataObject = { ...yaml, contentTypes: mapped };
  const validated = validateStrictStoredOptionsSection('yamlConfig', candidate);
  if (!validated.success) return;
  raw.yamlConfig = validated.value;
  action(actions, 'yaml-vault', 'yamlConfig', 'legacy-yaml-array-migrated');
}

function migrateVault(raw: DataObject, actions: StoredOptionsMigrationAction[]): void {
  const router = raw.vaultRouter;
  if (!isDataObject(router) || !Array.isArray(router.rules) || !Array.isArray(router.vaults)) {
    return;
  }
  const vaults = router.vaults.map((vault) => (isDataObject(vault) ? { ...vault } : vault));
  for (const rule of router.rules) {
    if (!isDataObject(rule) || typeof rule.vaultId !== 'string' || typeof rule.id !== 'string') {
      return;
    }
    const target = vaults.find((vault) => isDataObject(vault) && vault.id === rule.vaultId);
    if (!isDataObject(target)) {
      return;
    }
    const rules = target.rules === undefined ? [] : target.rules;
    if (
      !Array.isArray(rules) ||
      rules.some((entry) => isDataObject(entry) && entry.id === rule.id)
    ) {
      return;
    }
    target.rules = [...rules, rule];
  }
  const next: DataObject = { ...router, vaults };
  delete next.rules;
  const validated = validateStrictStoredOptionsSection('vaultRouter', next);
  if (!validated.success) return;
  raw.vaultRouter = validated.value;
  action(actions, 'yaml-vault', 'vaultRouter', 'legacy-vault-rules-migrated');
}

export function migrateStoredOptionsRaw(
  input: PlainStructuredObject
): StoredOptionsMigrationResult {
  const raw: DataObject = { ...input };
  const actions: StoredOptionsMigrationAction[] = [];
  migrateRootAndRest(raw, actions);
  migrateTemplateClipper(raw, actions);
  migrateVideoAliases(raw, actions);
  migrateSelection(raw, actions);
  migrateTaxonomy(raw, actions);
  migrateYaml(raw, actions);
  migrateVault(raw, actions);
  return { version: STORED_OPTIONS_MIGRATION_VERSION, raw, actions: Object.freeze(actions) };
}
