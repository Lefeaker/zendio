import type { CompleteOptions, StoredOptions } from '../types/options';
import type { YamlConfigOverrides } from '../types/yamlConfig';
import { VaultRouterConfigSchema, YamlConfigOverridesSchema } from '../schemas';
import { normalizeYamlConfigOverrides } from '../services/yamlConfigService';
import { cloneValue } from '../utils/cloneValue';

export function sanitizeVaultRouterConfig(value: unknown): StoredOptions['vaultRouter'] {
  if (value === undefined) {
    return undefined;
  }

  const parsed = VaultRouterConfigSchema.safeParse(value);
  return parsed.success ? (parsed.data as StoredOptions['vaultRouter']) : undefined;
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
  const normalized = cloneValue(options) as StoredOptions;
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
