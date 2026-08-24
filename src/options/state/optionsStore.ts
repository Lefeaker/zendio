import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import type { OptionsStore, OptionsSubscriber } from './types';
import { omitLegacyRestRootDirFromOptions } from '../../shared/config/optionsMerger';
import {
  sanitizeStoredOptionsSnapshot,
  sanitizeVaultRouterConfig,
  sanitizeYamlConfigValue
} from '../../shared/config/optionsSanitizer';
import { setYamlConfigOverrides } from '../../shared/state/yamlConfigOverridesStore';
import type { YamlConfigOverrides } from '../../shared/types/yamlConfig';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';
import type { IOptionsRepository } from '../../shared/repositories';
import { areStateValuesEqual, cloneStateValue } from './stateValue';
import { STORED_OPTIONS_DELETE } from '../../shared/config/storedOptionsCodec';
import type { OptionsPatch } from '../../shared/types/optionsMutationMessages';
import { isObjectRecord } from '../../shared/guards/object';

type MigrationMessageKey = 'yamlConfigMigrated';
type StateValue = Parameters<typeof areStateValuesEqual>[0];

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

const PATCH_PATHS = [
  ['interfaceTheme'],
  ['rest', 'baseUrl'],
  ['rest', 'httpsUrl'],
  ['rest', 'httpUrl'],
  ['rest', 'vault'],
  ['rest', 'apiKey'],
  ['rest', 'localFolderId'],
  ['rest', 'localFolderName'],
  ['templates', 'article'],
  ['templates', 'video'],
  ['templates', 'fragment'],
  ['templates', 'reading'],
  ['templates', 'ai'],
  ['domainMappings'],
  ['aiChat', 'includeTimestamps'],
  ['aiChat', 'userName'],
  ['deepResearch', 'pureMode'],
  ['fragmentClipper', 'useFootnoteFormat'],
  ['fragmentClipper', 'captureContext'],
  ['fragmentClipper', 'contextLength'],
  ['fragmentClipper', 'contextMode'],
  ['fragmentClipper', 'selectionTriggerMode'],
  ['fragmentClipper', 'selectionModifierKeys'],
  ['fragmentClipper', 'keyboardShortcutsEnabled'],
  ['readingSession', 'exportMode'],
  ['readingSession', 'highlightTheme'],
  ['video', 'floatingPromptEnabled'],
  ['video', 'promptButtonLabel'],
  ['video', 'promptShortcut'],
  ['video', 'controlBarAutoPause'],
  ['video', 'controlBarScreenshot'],
  ['video', 'commentEditorAutoPause'],
  ['video', 'promptPosition'],
  ['video', 'screenshotAttachment'],
  ['classifier', 'enabled'],
  ['classifier', 'provider'],
  ['classifier', 'endpoint'],
  ['classifier', 'apiKey'],
  ['classifier', 'model'],
  ['classifier', 'taxonomy'],
  ['experimentalAi', 'provider'],
  ['experimentalAi', 'model'],
  ['experimentalAi', 'apiUrl'],
  ['experimentalAi', 'apiKey'],
  ['pageSummary', 'enabled'],
  ['readingOverlaySummary', 'enabled'],
  ['subtitleTranslation', 'enabled'],
  ['subtitleTranslation', 'targetLanguage'],
  ['privacyPreferences', 'analytics'],
  ['privacyPreferences', 'errorReporting'],
  ['privacyPreferences', 'debugMode'],
  ['vaultRouter'],
  ['yamlConfig']
] as const;

function readPath(
  value: StoredOptions | CompleteOptions | null,
  path: readonly string[]
): StateValue {
  let current: StateValue = value;
  for (const part of path) {
    if (!isObjectRecord(current) || Array.isArray(current)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

function createPatch(path: readonly string[], value: StateValue): OptionsPatch {
  return {
    path,
    value: value === undefined ? STORED_OPTIONS_DELETE : cloneStateValue(value)
  } as OptionsPatch;
}

function createSnapshotPatches(
  before: StoredOptions | CompleteOptions | null,
  after: StoredOptions | CompleteOptions
): OptionsPatch[] {
  const patches: OptionsPatch[] = [];
  for (const path of PATCH_PATHS) {
    const previous = readPath(before, path);
    const next = readPath(after, path);
    if (!areStateValuesEqual(previous, next)) patches.push(createPatch(path, next));
  }
  return patches;
}

function createSanitizationPatches(
  normalized: StoredOptions,
  sanitizedYaml: YamlConfigOverrides | null
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
  value: YamlConfigOverrides | null;
  changed: boolean;
} {
  const normalized = sanitizeYamlConfigValue(value);
  const changed = !areStateValuesEqual(value, normalized);
  return { value: normalized ?? null, changed };
}

function applySanitizedOptions(options: StoredOptions | CompleteOptions): {
  normalized: StoredOptions;
  sanitizedYaml: YamlConfigOverrides | null;
  changed: boolean;
} {
  const { normalized, sanitizedYaml } = sanitizeStoredOptionsSnapshot(options);
  const withoutLegacyRootDir = omitLegacyRestRootDirFromOptions(normalized);
  const vaultResult = sanitizeVaultRouter((options as StoredOptions).vaultRouter);
  const yamlResult = sanitizeYamlConfig(
    (options as StoredOptions).yamlConfig ??
      ((options as StoredOptions).yamlConfig === null ? null : undefined)
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

export async function save(options: StoredOptions | CompleteOptions): Promise<void> {
  const { normalized, sanitizedYaml, changed } = applySanitizedOptions(options);
  const patches = createSnapshotPatches(cachedSnapshot, normalized);
  if (patches.length > 0) await getOptionsRepository().patch(patches);
  setYamlConfigOverrides(sanitizedYaml);
  emitSnapshot(normalized);
  if (changed) {
    registerYamlMigration('manual save');
  }
}

export async function replacePersisted(options: StoredOptions | CompleteOptions): Promise<void> {
  const { normalized, sanitizedYaml, changed } = applySanitizedOptions(options);
  const replaced = await getOptionsRepository().replace(normalized);
  setYamlConfigOverrides(sanitizedYaml);
  emitSnapshot(replaced);
  if (changed) registerYamlMigration('strict replace');
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
