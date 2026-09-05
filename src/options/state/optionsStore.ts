import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import type { OptionsStore, OptionsStoreInputPatch, OptionsSubscriber } from './types';
import { omitLegacyRestRootDirFromOptions } from '../../shared/config/optionsMerger';
import {
  sanitizeStoredOptionsSnapshot,
  sanitizeVaultRouterConfig,
  sanitizeYamlConfigValue
} from '../../shared/config/optionsSanitizer';
import { setYamlConfigOverrides } from '../../shared/state/yamlConfigOverridesStore';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';
import type { IOptionsRepository } from '../../shared/repositories';
import { areStateValuesEqual, cloneStateValue } from './stateValue';
import type { OptionsPatch } from '../../shared/types/optionsMutationMessages';
import { STORED_OPTIONS_DELETE } from '../../shared/config/storedOptionsCodec';
import { isObjectRecord } from '../../shared/guards/object';

type MigrationMessageKey = 'yamlConfigMigrated';
type CanonicalYamlConfig = NonNullable<StoredOptions['yamlConfig']>;

// Options UI 主链固定走 IOptionsRepository，但延迟到实际调用时再解析，
// 避免模块加载阶段通过隐式 fallback 偷偷注册依赖。
let optionsRepository: IOptionsRepository | null = null;

function getOptionsRepository(): IOptionsRepository {
  if (!optionsRepository) {
    optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  }
  return optionsRepository;
}

let pendingYamlMigrationNotice: MigrationMessageKey | null = null;
let cachedSnapshot: StoredOptions | null = null;
let unsubscribeRepo: (() => void) | null = null;
let migrationWritebackTail: Promise<void> = Promise.resolve();
const subscribers = new Set<OptionsSubscriber>();

function isDeletePatchValue(value: OptionsStoreInputPatch['value']): boolean {
  return (
    isObjectRecord(value) &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    '$zendio' in value &&
    value['$zendio'] === 'delete'
  );
}

function isYamlInputPatch(
  patch: OptionsStoreInputPatch
): patch is Extract<OptionsStoreInputPatch, { readonly path: readonly ['yamlConfig'] }> {
  return patch.path.length === 1 && patch.path[0] === 'yamlConfig';
}

function isVaultRouterPatch(
  patch: OptionsPatch
): patch is Extract<OptionsPatch, { readonly path: readonly ['vaultRouter'] }> {
  return patch.path.length === 1 && patch.path[0] === 'vaultRouter';
}

function normalizeMutationPatches(patches: readonly OptionsStoreInputPatch[]): {
  changed: boolean;
  patches: OptionsPatch[];
} {
  let changed = false;
  const normalized = patches.map((patch): OptionsPatch => {
    if (isYamlInputPatch(patch)) {
      const value = isDeletePatchValue(patch.value)
        ? STORED_OPTIONS_DELETE
        : (sanitizeYamlConfigValue(patch.value) ?? null);
      changed ||= !areStateValuesEqual(value, patch.value);
      return { path: ['yamlConfig'], value };
    }
    if (isDeletePatchValue(patch.value)) return patch;
    if (isVaultRouterPatch(patch)) {
      const value = sanitizeVaultRouterConfig(patch.value) ?? STORED_OPTIONS_DELETE;
      changed ||= !areStateValuesEqual(value, patch.value);
      return { path: ['vaultRouter'], value };
    }
    return patch;
  });
  return { changed, patches: normalized };
}

function createSanitizationPatches(
  normalized: StoredOptions,
  sanitizedYaml: CanonicalYamlConfig | null
): OptionsPatch[] {
  const patches: OptionsPatch[] = [];
  if (normalized.vaultRouter !== undefined) {
    patches.push({ path: ['vaultRouter'], value: normalized.vaultRouter });
  }
  patches.push({ path: ['yamlConfig'], value: sanitizedYaml });
  return patches;
}

function scheduleMigrationWriteback(patches: readonly OptionsPatch[], reason: string): void {
  if (patches.length === 0) return;
  migrationWritebackTail = migrationWritebackTail
    .then(async () => {
      await getOptionsRepository().patch(patches);
      registerYamlMigration(reason);
    })
    .catch((error) => {
      console.error('[optionsStore] migration writeback failed', error);
    });
}

const registerYamlMigration = (reason: string): void => {
  pendingYamlMigrationNotice = 'yamlConfigMigrated';
  console.info(`[optionsStore] YAML config overrides normalized (${reason})`);
};

export const consumeYamlMigrationNotice = (): MigrationMessageKey | null => {
  const notice = pendingYamlMigrationNotice;
  pendingYamlMigrationNotice = null;
  return notice;
};

function sanitizeVaultRouter(value: unknown): {
  value: StoredOptions['vaultRouter'];
  changed: boolean;
} {
  const sanitized = sanitizeVaultRouterConfig(value);
  return {
    value: sanitized,
    changed: !areStateValuesEqual(value, sanitized)
  };
}

function sanitizeYamlConfig(value: unknown): {
  value: CanonicalYamlConfig | null;
  changed: boolean;
} {
  const normalized = sanitizeYamlConfigValue(value);
  const changed = !areStateValuesEqual(value, normalized);
  return { value: normalized ?? null, changed };
}

function applySanitizedOptions(options: StoredOptions | CompleteOptions): {
  normalized: StoredOptions;
  sanitizedYaml: CanonicalYamlConfig | null;
  changed: boolean;
} {
  const { normalized, sanitizedYaml } = sanitizeStoredOptionsSnapshot(options);
  const withoutLegacyRootDir = omitLegacyRestRootDirFromOptions(normalized);
  const vaultResult = sanitizeVaultRouter(options.vaultRouter);
  const yamlResult = sanitizeYamlConfig(
    options.yamlConfig ?? (options.yamlConfig === null ? null : undefined)
  );

  return {
    normalized: withoutLegacyRootDir,
    sanitizedYaml,
    changed:
      vaultResult.changed || yamlResult.changed || normalized.rest !== withoutLegacyRootDir.rest
  };
}

function emitSnapshot(snapshot: StoredOptions | null): void {
  if (areStateValuesEqual(snapshot, cachedSnapshot)) {
    return;
  }
  cachedSnapshot = snapshot ? cloneStateValue(snapshot) : null;
  const clone = cachedSnapshot ? cloneStateValue(cachedSnapshot) : undefined;
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
  unsubscribeRepo = getOptionsRepository().onChange((next) => {
    const { normalized, sanitizedYaml, changed } = applySanitizedOptions(next);
    setYamlConfigOverrides(sanitizedYaml);
    emitSnapshot(normalized);
    if (changed) {
      scheduleMigrationWriteback(
        createSanitizationPatches(normalized, sanitizedYaml),
        'repository subscription'
      );
    }
  });
}

export async function load(): Promise<StoredOptions> {
  const options = await getOptionsRepository().get();
  const { normalized, sanitizedYaml, changed } = applySanitizedOptions(options);
  setYamlConfigOverrides(sanitizedYaml);
  if (changed) {
    await getOptionsRepository().patch(createSanitizationPatches(normalized, sanitizedYaml));
    registerYamlMigration('load');
  }
  ensureRepositorySubscription();
  emitSnapshot(normalized);
  return cloneStateValue(normalized);
}

export async function save(patches: readonly OptionsStoreInputPatch[]): Promise<StoredOptions> {
  const mutation = normalizeMutationPatches(patches);
  const acknowledged = await getOptionsRepository().patch(mutation.patches);
  const { normalized, sanitizedYaml, changed } = applySanitizedOptions(acknowledged);
  setYamlConfigOverrides(sanitizedYaml);
  emitSnapshot(normalized);
  if (changed) {
    scheduleMigrationWriteback(
      createSanitizationPatches(normalized, sanitizedYaml),
      'mutation acknowledgement'
    );
  }
  if (mutation.changed) registerYamlMigration('mutation input');
  return cloneStateValue(normalized);
}

export async function replacePersisted(
  options: StoredOptions | CompleteOptions
): Promise<StoredOptions> {
  const { normalized, sanitizedYaml, changed } = applySanitizedOptions(options);
  const replaced = await getOptionsRepository().replace(normalized);
  setYamlConfigOverrides(sanitizedYaml);
  emitSnapshot(replaced);
  if (changed) registerYamlMigration('strict replace');
  return cloneStateValue(replaced);
}

export function snapshot(): StoredOptions | null {
  return cachedSnapshot ? cloneStateValue(cachedSnapshot) : null;
}

export function replace(options: StoredOptions | CompleteOptions | null): void {
  if (!options) {
    setYamlConfigOverrides(null);
    emitSnapshot(null);
    return;
  }
  const { normalized, sanitizedYaml, changed } = applySanitizedOptions(options);
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
  optionsRepository = null;
  migrationWritebackTail = Promise.resolve();
  if (unsubscribeRepo) {
    unsubscribeRepo();
    unsubscribeRepo = null;
  }
}

export function subscribe(listener: OptionsSubscriber): () => void {
  subscribers.add(listener);
  listener(cachedSnapshot ? cloneStateValue(cachedSnapshot) : undefined);
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
