import type { CompleteOptions, StoredOptions } from '../types/options';
import type { RoutingRule, VaultConfig, VaultRouterConfig } from '../types/vault';
import type { YamlConfigOverrides } from '../types/yamlConfig';
import {
  StoredOptionsSchema,
  VaultRouterConfigSchema,
  YamlConfigOverridesSchema
} from '../schemas';
import { normalizeYamlConfigOverrides } from '../services/yamlConfigService';
import { cloneValue } from '../utils/cloneValue';
import type { ZodError } from 'zod';
import type {
  RoutingRule as SchemaRoutingRule,
  VaultConfig as SchemaVaultConfig,
  VaultRouterConfig as SchemaVaultRouterConfig
} from '../schemas/vault.schema';
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
  classifier: new Set(['enabled', 'provider', 'endpoint', 'apiKey', 'model', 'taxonomy']),
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

  const parsed = VaultRouterConfigSchema.safeParse(value);
  return parsed.success ? toVaultRouterConfig(parsed.data) : undefined;
}

function toRoutingRule(rule: SchemaRoutingRule): RoutingRule {
  return {
    id: rule.id,
    vaultId: rule.vaultId,
    type: rule.type,
    pattern: rule.pattern,
    enabled: rule.enabled,
    priority: rule.priority,
    ...(rule.description !== undefined && { description: rule.description })
  };
}

function toVaultConfig(vault: SchemaVaultConfig): VaultConfig {
  return {
    id: vault.id,
    name: vault.name,
    httpsUrl: vault.httpsUrl,
    httpUrl: vault.httpUrl,
    vault: vault.vault,
    apiKey: vault.apiKey,
    ...(vault.localFolderId !== undefined && { localFolderId: vault.localFolderId }),
    ...(vault.localFolderName !== undefined && { localFolderName: vault.localFolderName }),
    ...(vault.isDefault !== undefined && { isDefault: vault.isDefault }),
    ...(vault.enabled !== undefined && { enabled: vault.enabled }),
    ...(vault.rules !== undefined && { rules: vault.rules.map(toRoutingRule) })
  };
}

function toVaultRouterConfig(config: SchemaVaultRouterConfig): VaultRouterConfig {
  return {
    vaults: config.vaults.map(toVaultConfig),
    ...(config.rules !== undefined && { rules: config.rules.map(toRoutingRule) }),
    ...(config.defaultVaultId !== undefined && { defaultVaultId: config.defaultVaultId })
  };
}

export function sanitizeYamlConfigValue(value: unknown): YamlConfigOverrides | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const schemaParsed = YamlConfigOverridesSchema.safeParse(value);
  const schemaBounded = schemaParsed.success ? schemaParsed.data : value;
  return normalizeYamlConfigOverrides(schemaBounded);
}

export function sanitizeStoredOptionsSnapshot(options: StoredOptions | CompleteOptions): {
  normalized: StoredOptions;
  sanitizedYaml: YamlConfigOverrides | null;
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
