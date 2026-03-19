import { deepClone } from '../utils/clone';
import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import type { OptionsStore, OptionsSubscriber } from './types';
import { normalizeYamlConfigOverrides } from '../../shared/services/yamlConfigService';
import { setYamlConfigOverrides } from '../../shared/state/yamlConfigOverridesStore';
import type { YamlConfigOverrides } from '../../shared/types/yamlConfig';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';
import type { IOptionsRepository } from '../../shared/repositories';
import { VaultRouterConfigSchema, YamlConfigOverridesSchema } from '../../shared/schemas';

type MigrationMessageKey = 'yamlConfigMigrated';

// Options UI 主链固定走 IOptionsRepository。
const optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);

let pendingYamlMigrationNotice: MigrationMessageKey | null = null;
let cachedSnapshot: StoredOptions | null = null;
let unsubscribeRepo: (() => void) | null = null;
const subscribers = new Set<OptionsSubscriber>();

const serializeYamlConfig = (value: YamlConfigOverrides | null | undefined): string =>
  JSON.stringify(value ?? null);

const serializeVaultRouter = (value: StoredOptions['vaultRouter']): string =>
  JSON.stringify(value ?? null);

const registerYamlMigration = (reason: string): void => {
  pendingYamlMigrationNotice = 'yamlConfigMigrated';
  console.info(`[optionsStore] YAML config overrides normalized (${reason})`);
};

export const consumeYamlMigrationNotice = (): MigrationMessageKey | null => {
  const notice = pendingYamlMigrationNotice;
  pendingYamlMigrationNotice = null;
  return notice;
};

function sanitizeVaultRouter(value: unknown): { value: StoredOptions['vaultRouter']; changed: boolean } {
  if (value === undefined) {
    return { value: undefined, changed: false };
  }
  const parsed = VaultRouterConfigSchema.safeParse(value);
  if (parsed.success) {
    return { value: parsed.data as StoredOptions['vaultRouter'], changed: serializeVaultRouter(value as StoredOptions['vaultRouter']) !== serializeVaultRouter(parsed.data as StoredOptions['vaultRouter']) };
  }
  return { value: undefined, changed: true };
}

function sanitizeYamlConfig(value: unknown): { value: YamlConfigOverrides | null; changed: boolean } {
  if (value === undefined || value === null) {
    return { value: null, changed: value !== undefined };
  }
  const schemaParsed = YamlConfigOverridesSchema.safeParse(value);
  const schemaBounded = schemaParsed.success ? schemaParsed.data : value;
  const normalized = normalizeYamlConfigOverrides(schemaBounded);
  const changed = serializeYamlConfig(value as YamlConfigOverrides | null) !== serializeYamlConfig(normalized);
  return { value: normalized, changed };
}

function applySanitizedOptions(
  options: StoredOptions | CompleteOptions
): { normalized: StoredOptions; sanitizedYaml: YamlConfigOverrides | null; changed: boolean } {
  const normalized = deepClone(options) as StoredOptions;
  const vaultResult = sanitizeVaultRouter(normalized.vaultRouter);
  if (vaultResult.value !== undefined) {
    normalized.vaultRouter = vaultResult.value;
  } else if ('vaultRouter' in normalized) {
    delete normalized.vaultRouter;
  }

  const yamlResult = sanitizeYamlConfig(normalized.yamlConfig ?? (normalized.yamlConfig === null ? null : undefined));
  if (yamlResult.value) {
    normalized.yamlConfig = yamlResult.value;
  } else if ('yamlConfig' in normalized) {
    delete normalized.yamlConfig;
  }

  return {
    normalized,
    sanitizedYaml: yamlResult.value,
    changed: vaultResult.changed || yamlResult.changed
  };
}

function emitSnapshot(snapshot: StoredOptions | null): void {
  cachedSnapshot = snapshot ? deepClone(snapshot) : null;
  const clone = cachedSnapshot ? deepClone(cachedSnapshot) : undefined;
  subscribers.forEach((listener) => {
    try {
      listener(clone);
    } catch (error) {
      console.error('[optionsStore] subscriber error', error);
    }
  });
}

function ensureRepositorySubscription(): void {
  if (unsubscribeRepo) {
    return;
  }
  unsubscribeRepo = optionsRepository.onChange((next) => {
    const { normalized, sanitizedYaml, changed } = applySanitizedOptions(next);
    cachedSnapshot = deepClone(normalized);
    setYamlConfigOverrides(sanitizedYaml);
    emitSnapshot(normalized);
    if (changed) {
      void optionsRepository.set({
        ...(normalized.vaultRouter !== undefined && { vaultRouter: normalized.vaultRouter }),
        yamlConfig: sanitizedYaml ?? null
      });
      registerYamlMigration('repository subscription');
    }
  });
}

export async function load(): Promise<StoredOptions> {
  const options = await optionsRepository.get();
  const { normalized, sanitizedYaml, changed } = applySanitizedOptions(options);
  cachedSnapshot = deepClone(normalized);
  setYamlConfigOverrides(sanitizedYaml);
  if (changed) {
    await optionsRepository.set({
      ...(normalized.vaultRouter !== undefined && { vaultRouter: normalized.vaultRouter }),
      yamlConfig: sanitizedYaml ?? null
    });
    registerYamlMigration('load');
  }
  ensureRepositorySubscription();
  emitSnapshot(normalized);
  return deepClone(normalized);
}

export async function save(options: StoredOptions | CompleteOptions): Promise<void> {
  const { normalized, sanitizedYaml, changed } = applySanitizedOptions(options);
  await optionsRepository.set(normalized as CompleteOptions);
  cachedSnapshot = deepClone(normalized);
  setYamlConfigOverrides(sanitizedYaml);
  emitSnapshot(normalized);
  if (changed) {
    registerYamlMigration('manual save');
  }
}

export function snapshot(): StoredOptions | null {
  return cachedSnapshot ? deepClone(cachedSnapshot) : null;
}

export function replace(options: StoredOptions | CompleteOptions | null): void {
  if (!options) {
    cachedSnapshot = null;
    setYamlConfigOverrides(null);
    emitSnapshot(null);
    return;
  }
  const { normalized, sanitizedYaml, changed } = applySanitizedOptions(options);
  cachedSnapshot = deepClone(normalized);
  setYamlConfigOverrides(sanitizedYaml);
  emitSnapshot(normalized);
  if (changed) {
    registerYamlMigration('state replace');
  }
}

export function reset(): void {
  cachedSnapshot = null;
  setYamlConfigOverrides(null);
  pendingYamlMigrationNotice = null;
  if (unsubscribeRepo) {
    unsubscribeRepo();
    unsubscribeRepo = null;
  }
}

export function subscribe(listener: OptionsSubscriber): () => void {
  subscribers.add(listener);
  listener(cachedSnapshot ? deepClone(cachedSnapshot) : undefined);
  ensureRepositorySubscription();
  return () => {
    subscribers.delete(listener);
  };
}

export const optionsStore: OptionsStore = {
  load,
  save,
  snapshot,
  replace,
  reset,
  subscribe
};

export default optionsStore;

export function getLegacyOptionsStore(): OptionsStore {
  return optionsStore;
}
