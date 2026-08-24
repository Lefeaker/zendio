import { mergeOptions, omitLegacyRestRootDir } from '../../shared/config/optionsMerger';
import { sanitizeYamlConfigValue } from '../../shared/config/optionsSanitizer';
import { decodeStoredOptions } from '../../shared/config/storedOptionsCodec';
import {
  isObjectRecord,
  type ObjectRecord,
  type RuntimePropertyValue
} from '../../shared/guards/object';
import { StoredOptionsSchema } from '../../shared/schemas/options.schema';
import type { StoredOptions } from '../../shared/types/options';
import { deepClone } from './clone';

export type ConfigTransferMode = 'portable' | 'fullBackup';

export interface ConfigTransferOptions {
  mode?: ConfigTransferMode;
}

type DroppedUnknownRoots<Input> = {
  readonly [Key in Exclude<keyof Input, keyof StoredOptions>]?: never;
};

export type NormalizedStoredOptions = StoredOptions & Partial<Record<string, never>>;
type OptionsBoundaryInput = Parameters<typeof decodeStoredOptions>[0];

function isPlainObject(value: OptionsBoundaryInput): value is ObjectRecord {
  return isObjectRecord(value) && !Array.isArray(value);
}

function redactSensitiveValues(value: RuntimePropertyValue): RuntimePropertyValue {
  if (Array.isArray(value)) {
    return value.map((entry: RuntimePropertyValue) => redactSensitiveValues(entry));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === 'apiKey' ? '' : redactSensitiveValues(entry)
    ])
  );
}

export function normalizeOptionsForTransfer<Input>(
  options: Input,
  transferOptions?: ConfigTransferOptions
): NormalizedStoredOptions & DroppedUnknownRoots<Input>;
export function normalizeOptionsForTransfer(
  options: OptionsBoundaryInput,
  transferOptions?: ConfigTransferOptions
): NormalizedStoredOptions;
export function normalizeOptionsForTransfer(
  options: OptionsBoundaryInput,
  transferOptions: ConfigTransferOptions = {}
): StoredOptions {
  const mode = transferOptions.mode ?? 'fullBackup';
  const base = deepClone(decodeStoredOptions(options).canonical);
  const merged = mergeOptions(base);

  const normalized: StoredOptions = {
    rest: omitLegacyRestRootDir(deepClone(merged.rest)),
    templates: deepClone(merged.templates),
    domainMappings: deepClone(merged.domainMappings)
  };

  if (merged.interfaceTheme) {
    normalized.interfaceTheme = merged.interfaceTheme;
  }
  if (merged.aiChat) {
    normalized.aiChat = deepClone(merged.aiChat);
  }
  if (merged.deepResearch) {
    normalized.deepResearch = deepClone(merged.deepResearch);
  }
  if (merged.fragmentClipper) {
    normalized.fragmentClipper = deepClone(merged.fragmentClipper);
  }
  if (merged.readingSession) {
    normalized.readingSession = deepClone(merged.readingSession);
  }
  if (merged.video) {
    normalized.video = deepClone(merged.video);
    const originalShortcut = base.video?.promptShortcut;
    if (originalShortcut && normalized.video?.promptShortcut) {
      normalized.video.promptShortcut = normalized.video.promptShortcut.toUpperCase();
    }
  }
  if (merged.vaultRouter) {
    normalized.vaultRouter = deepClone(merged.vaultRouter);
  }
  if (merged.classifier) {
    normalized.classifier = deepClone(merged.classifier);
  }
  if (merged.experimentalAi) {
    normalized.experimentalAi = deepClone(merged.experimentalAi);
  }
  if (merged.pageSummary) {
    normalized.pageSummary = deepClone(merged.pageSummary);
  }
  if (merged.readingOverlaySummary) {
    normalized.readingOverlaySummary = deepClone(merged.readingOverlaySummary);
  }
  if (merged.subtitleTranslation) {
    normalized.subtitleTranslation = deepClone(merged.subtitleTranslation);
  }
  if ('yamlConfig' in base) {
    const sanitized = sanitizeYamlConfigValue(base.yamlConfig ?? null);
    normalized.yamlConfig = sanitized ? deepClone(sanitized) : null;
  }

  return mode === 'portable'
    ? StoredOptionsSchema.parse(redactSensitiveValues(normalized))
    : normalized;
}
