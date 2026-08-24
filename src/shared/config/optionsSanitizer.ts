import type { CompleteOptions, StoredOptions } from '../types/options';
import {
  OptionsVaultRouterConfigSchema,
  OptionsYamlConfigOverridesSchema,
  StoredOptionsSchema
} from '../schemas';
import { normalizeYamlConfigOverrides } from '../services/yamlConfigService';
import { cloneValue } from '../utils/cloneValue';
import type { ZodError } from 'zod';
import { plainStructuredDataEqual, snapshotPlainStructuredData } from './losslessObjectBoundary';
import type { PlainStructuredValue } from './losslessObjectBoundaryTypes';
import {
  STORED_OPTIONS_KNOWN_SECTIONS,
  type StoredOptionsKnownSection
} from './storedOptionsIssues';

export type StrictStoredOptionsSectionResult =
  | { readonly success: true; readonly value: PlainStructuredValue }
  | {
      readonly success: false;
      readonly reason: 'schema' | 'stripped' | 'boundary';
      readonly error?: ZodError;
    };

export function isStoredOptionsKnownSection(value: string): value is StoredOptionsKnownSection {
  return STORED_OPTIONS_KNOWN_SECTIONS.some((section) => section === value);
}

const WHOLE_PATCH_ROOTS = new Set([
  'interfaceTheme',
  'domainMappings',
  'vaultRouter',
  'yamlConfig'
]);
const FIELD_PATCH_ROOTS: Record<string, ReadonlySet<string>> = {
  rest: new Set([
    'baseUrl',
    'httpsUrl',
    'httpUrl',
    'vault',
    'apiKey',
    'localFolderId',
    'localFolderName'
  ]),
  templates: new Set(['article', 'video', 'fragment', 'reading', 'ai']),
  aiChat: new Set(['includeTimestamps', 'userName']),
  deepResearch: new Set(['pureMode']),
  fragmentClipper: new Set([
    'useFootnoteFormat',
    'captureContext',
    'contextLength',
    'contextMode',
    'selectionTriggerMode',
    'selectionModifierKeys',
    'keyboardShortcutsEnabled'
  ]),
  readingSession: new Set(['exportMode', 'highlightTheme']),
  video: new Set([
    'floatingPromptEnabled',
    'promptButtonLabel',
    'promptShortcut',
    'controlBarAutoPause',
    'controlBarScreenshot',
    'commentEditorAutoPause',
    'promptPosition',
    'screenshotAttachment'
  ]),
  classifier: new Set([
    'enabled',
    'provider',
    'endpoint',
    'apiKey',
    'model',
    'timeoutMs',
    'taxonomy'
  ]),
  experimentalAi: new Set(['provider', 'model', 'apiUrl', 'apiKey']),
  pageSummary: new Set(['enabled']),
  readingOverlaySummary: new Set(['enabled']),
  subtitleTranslation: new Set(['enabled', 'targetLanguage']),
  privacyPreferences: new Set(['analytics', 'errorReporting', 'debugMode'])
};
const SCREENSHOT_PATCH_FIELDS = new Set([
  'locationTemplate',
  'fileNameTemplate',
  'markdownUrlFormat'
]);

export function isValidStoredOptionsPatchPath(
  path: readonly string[]
): path is readonly [StoredOptionsKnownSection, ...string[]] {
  const [root, field, nested] = path;
  if (!root || !isStoredOptionsKnownSection(root)) return false;
  if (WHOLE_PATCH_ROOTS.has(root)) return path.length === 1;
  if (!field || !FIELD_PATCH_ROOTS[root]?.has(field)) return false;
  if (path.length === 2) return true;
  return (
    root === 'video' &&
    field === 'screenshotAttachment' &&
    path.length === 3 &&
    SCREENSHOT_PATCH_FIELDS.has(nested ?? '')
  );
}

export function validateStrictStoredOptionsSection(
  section: StoredOptionsKnownSection,
  value: PlainStructuredValue
): StrictStoredOptionsSectionResult {
  const schema = StoredOptionsSchema.shape[section];
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return { success: false, reason: 'schema', error: parsed.error };
  }
  const normalized = snapshotPlainStructuredData(parsed.data);
  if (!normalized.ok) {
    return { success: false, reason: 'boundary' };
  }
  const equality = plainStructuredDataEqual(value, normalized.value);
  if (!equality.ok) {
    return { success: false, reason: 'boundary' };
  }
  if (!equality.equal) {
    return { success: false, reason: 'stripped' };
  }
  return { success: true, value: normalized.value };
}

export function sanitizeVaultRouterConfig(value: unknown): StoredOptions['vaultRouter'] {
  if (value === undefined) {
    return undefined;
  }

  const parsed = OptionsVaultRouterConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function sanitizeYamlConfigValue(value: unknown): StoredOptions['yamlConfig'] {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const schemaParsed = OptionsYamlConfigOverridesSchema.safeParse(value);
  const schemaBounded = schemaParsed.success ? schemaParsed.data : value;
  const normalized = normalizeYamlConfigOverrides(schemaBounded);
  if (normalized === null) {
    return null;
  }
  const canonical = OptionsYamlConfigOverridesSchema.safeParse(normalized);
  return canonical.success ? canonical.data : null;
}

export function sanitizeStoredOptionsSnapshot(options: StoredOptions | CompleteOptions): {
  normalized: StoredOptions;
  sanitizedYaml: NonNullable<StoredOptions['yamlConfig']> | null;
} {
  const normalized: StoredOptions = cloneValue(options);
  const vaultRouter = sanitizeVaultRouterConfig(normalized.vaultRouter);
  const sanitizedYaml = sanitizeYamlConfigValue(
    normalized.yamlConfig ?? (normalized.yamlConfig === null ? null : undefined)
  );

  if (vaultRouter !== undefined) {
    normalized.vaultRouter = vaultRouter;
  } else if ('vaultRouter' in normalized) {
    delete normalized.vaultRouter;
  }

  if (sanitizedYaml) {
    normalized.yamlConfig = sanitizedYaml;
  } else if ('yamlConfig' in normalized) {
    delete normalized.yamlConfig;
  }

  return {
    normalized,
    sanitizedYaml: sanitizedYaml ?? null
  };
}
