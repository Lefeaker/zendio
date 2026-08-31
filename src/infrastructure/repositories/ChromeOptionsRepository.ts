import type { StorageService } from '../../platform/interfaces/storage';
import {
  decodeStoredOptions,
  type DecodedStoredOptions
} from '../../shared/config/storedOptionsCodec';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '../../shared/config/losslessObjectBoundaryTypes';
import {
  composeDeviceLocalPrivacy,
  createDeviceLocalPrivacyTransaction,
  createDeviceLocalPrivacyConsent,
  DEVICE_LOCAL_PRIVACY_CONFIG_KEY,
  DEVICE_LOCAL_PRIVACY_CONSENT_KEY,
  DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY,
  mergeDeviceLocalPrivacyConfig,
  readDeviceLocalPrivacyTransaction,
  resolveDeviceLocalPrivacy
} from '../../shared/config/deviceLocalPrivacy';
import { StorageError } from '../../shared/errors/repositoryErrors';
import type { CompleteOptions, PrivacyPreferencesOptions } from '../../shared/types/options';

export const OPTIONS_STORAGE_KEY = 'options';

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface OptionsRawStorageRepository {
  readRaw(): Promise<PlainStructuredValue | null>;
  writeRaw(value: PlainStructuredObject): Promise<void>;
}

export interface DeviceLocalPrivacyRepository {
  readPrivacy(portableRaw?: PlainStructuredValue | null): Promise<PrivacyPreferencesOptions>;
  ensurePrivacyBaseline(
    portableRaw: PlainStructuredValue | null
  ): Promise<PrivacyPreferencesOptions>;
  recoverPrivacyCommit(): Promise<void>;
  beginPrivacyCommit(preferences: PrivacyPreferencesOptions): Promise<void>;
  commitPrivacy(preferences: PrivacyPreferencesOptions): Promise<void>;
  rollbackPrivacyCommit(): Promise<void>;
}

/**
 * Local Options reads and storage observation. Raw writes are intentionally
 * exposed only to the background mutation coordinator, never through DI.
 */
export class ChromeOptionsRepository implements OptionsRawStorageRepository {
  private readonly changeListeners = new Map<(options: CompleteOptions) => void, string | null>();
  private stopWatchingOptions: (() => void) | null = null;
  private stopWatchingPrivacy: Array<() => void> = [];
  private notificationTail: Promise<void> = Promise.resolve();
  private notificationGeneration = 0;

  constructor(private readonly storage: StorageService) {}

  async readRaw(): Promise<PlainStructuredValue | null> {
    try {
      const stored = await this.storage.sync.get<PlainStructuredValue | null>(OPTIONS_STORAGE_KEY);
      return stored === undefined ? null : clone(stored);
    } catch (error) {
      throw new StorageError('Failed to read raw options from chrome.storage', {
        cause: error,
        context: { storageKey: OPTIONS_STORAGE_KEY }
      });
    }
  }

  async readDecoded(): Promise<DecodedStoredOptions> {
    const raw = await this.readRaw();
    const decoded = decodeStoredOptions(raw);
    const privacy = await this.readPrivacy(raw);
    return { ...decoded, runtime: composeDeviceLocalPrivacy(decoded.runtime, privacy) };
  }

  async get(): Promise<CompleteOptions> {
    return clone((await this.readDecoded()).runtime);
  }

  async writeRaw(value: PlainStructuredObject): Promise<void> {
    try {
      await this.storage.sync.set(OPTIONS_STORAGE_KEY, clone(value));
    } catch (error) {
      throw new StorageError('Failed to write raw options to chrome.storage', {
        cause: error,
        context: { storageKey: OPTIONS_STORAGE_KEY }
      });
    }
  }

  async readPrivacy(
    portableRaw: PlainStructuredValue | null = null
  ): Promise<PrivacyPreferencesOptions> {
    try {
      return (await this.readPrivacyStorageState(portableRaw)).preferences;
    } catch (error) {
      throw new StorageError('Failed to read device-local privacy from chrome.storage', {
        cause: error,
        context: { storageKey: DEVICE_LOCAL_PRIVACY_CONSENT_KEY }
      });
    }
  }

  async ensurePrivacyBaseline(
    portableRaw: PlainStructuredValue | null
  ): Promise<PrivacyPreferencesOptions> {
    try {
      const state = await this.readPrivacyStorageState(portableRaw);
      if (!state.requiresLocalWrite) return state.preferences;
      await this.storage.local.setMany({
        [DEVICE_LOCAL_PRIVACY_CONSENT_KEY]: createDeviceLocalPrivacyConsent(
          state.preferences,
          Date.now()
        ),
        [DEVICE_LOCAL_PRIVACY_CONFIG_KEY]: mergeDeviceLocalPrivacyConfig(
          state.currentConfig,
          state.preferences
        )
      });
      return state.preferences;
    } catch (error) {
      throw new StorageError('Failed to preserve device-local privacy baseline', {
        cause: error,
        context: { storageKey: DEVICE_LOCAL_PRIVACY_CONSENT_KEY }
      });
    }
  }

  async recoverPrivacyCommit(): Promise<void> {
    await this.rollbackPrivacyCommit();
  }

  async beginPrivacyCommit(preferences: PrivacyPreferencesOptions): Promise<void> {
    void preferences;
    try {
      await this.rollbackPrivacyCommit();
      const [previousConsent, previousConfig] = await Promise.all([
        this.storage.local.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_CONSENT_KEY),
        this.storage.local.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_CONFIG_KEY)
      ]);
      await this.storage.local.set(
        DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY,
        createDeviceLocalPrivacyTransaction(previousConsent, previousConfig)
      );
    } catch (error) {
      throw new StorageError('Failed to stage device-local privacy in chrome.storage', {
        cause: error,
        context: { storageKey: DEVICE_LOCAL_PRIVACY_CONSENT_KEY }
      });
    }
  }

  async commitPrivacy(preferences: PrivacyPreferencesOptions): Promise<void> {
    try {
      const rawTransaction = await this.storage.local.get<PlainStructuredValue>(
        DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY
      );
      const transaction = readDeviceLocalPrivacyTransaction(rawTransaction);
      if (!transaction) throw new Error('DEVICE_LOCAL_PRIVACY_TRANSACTION_MISSING');
      await this.storage.local.set(
        DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY,
        createDeviceLocalPrivacyTransaction(
          transaction.previousConsent,
          transaction.previousConfig,
          'commit-ready'
        )
      );
      const currentConfig = await this.storage.local.get<PlainStructuredValue>(
        DEVICE_LOCAL_PRIVACY_CONFIG_KEY
      );
      await this.storage.local.setMany({
        [DEVICE_LOCAL_PRIVACY_CONSENT_KEY]: createDeviceLocalPrivacyConsent(
          preferences,
          Date.now()
        ),
        [DEVICE_LOCAL_PRIVACY_CONFIG_KEY]: mergeDeviceLocalPrivacyConfig(
          currentConfig,
          preferences
        )
      });
    } catch (error) {
      throw new StorageError('Failed to commit device-local privacy in chrome.storage', {
        cause: error,
        context: { storageKey: DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY }
      });
    }
    try {
      await this.storage.local.remove(DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY);
    } catch (error) {
      console.warn('[ChromeOptionsRepository] Failed to clear committed privacy transaction:', error);
    }
  }

  async rollbackPrivacyCommit(): Promise<void> {
    try {
      const rawTransaction = await this.storage.local.get<PlainStructuredValue>(
        DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY
      );
      const transaction = readDeviceLocalPrivacyTransaction(rawTransaction);
      if (!transaction) return;
      await this.storage.local.remove(DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY);
    } catch (error) {
      throw new StorageError('Failed to roll back device-local privacy in chrome.storage', {
        cause: error,
        context: { storageKey: DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY }
      });
    }
  }

  private async readPrivacyStorageState(portableRaw: PlainStructuredValue | null): Promise<{
    preferences: PrivacyPreferencesOptions;
    requiresLocalWrite: boolean;
    currentConfig: PlainStructuredValue | undefined;
  }> {
    const [currentConsent, currentConfig, rawTransaction] = await Promise.all([
      this.storage.local.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_CONSENT_KEY),
      this.storage.local.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_CONFIG_KEY),
      this.storage.local.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY)
    ]);
    const transaction = readDeviceLocalPrivacyTransaction(rawTransaction);
    const usePrevious = transaction?.phase === 'prepared';
    const localConsent = usePrevious ? transaction.previousConsent : currentConsent;
    const localConfig = usePrevious ? transaction.previousConfig : currentConfig;
    return {
      ...resolveDeviceLocalPrivacy(localConsent, localConfig, portableRaw),
      currentConfig
    };
  }

  onChange(callback: (options: CompleteOptions) => void): () => void {
    this.changeListeners.set(callback, null);
    this.ensureStorageWatcher();
    this.requestNotification(() => this.get(), 'initial state');

    return () => {
      this.changeListeners.delete(callback);
      if (this.changeListeners.size === 0) {
        this.stopWatchingOptions?.();
        this.stopWatchingOptions = null;
        for (const stopWatching of this.stopWatchingPrivacy) stopWatching();
        this.stopWatchingPrivacy = [];
      }
    };
  }

  private ensureStorageWatcher(): void {
    if (this.stopWatchingOptions) return;
    this.stopWatchingOptions = this.storage.sync.watchKey<PlainStructuredValue | null>(
      OPTIONS_STORAGE_KEY,
      (stored) => {
        this.requestNotification(
          () => this.composeStoredOptions(stored ?? null),
          'sync options change'
        );
      }
    );
    const emitLocalPrivacyChange = (): void => {
      this.requestNotification(() => this.get(), 'local privacy change');
    };
    this.stopWatchingPrivacy = [
      this.storage.local.watchKey(DEVICE_LOCAL_PRIVACY_CONSENT_KEY, emitLocalPrivacyChange),
      this.storage.local.watchKey(DEVICE_LOCAL_PRIVACY_CONFIG_KEY, emitLocalPrivacyChange),
      this.storage.local.watchKey(DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY, emitLocalPrivacyChange)
    ];
  }

  private async composeStoredOptions(stored: PlainStructuredValue | null): Promise<CompleteOptions> {
    const decoded = decodeStoredOptions(stored);
    const privacy = await this.readPrivacy(stored);
    return composeDeviceLocalPrivacy(decoded.runtime, privacy);
  }

  private requestNotification(
    read: () => Promise<CompleteOptions>,
    reason: string
  ): void {
    const generation = ++this.notificationGeneration;
    const queued = this.notificationTail.then(async () => {
      const options = await read();
      if (generation !== this.notificationGeneration) return;
      this.emitToListeners(options);
    });
    this.notificationTail = queued.catch((error) => {
      console.error(`[ChromeOptionsRepository] Failed to emit ${reason}:`, error);
    });
  }

  private emitToListeners(options: CompleteOptions): void {
    for (const listener of this.changeListeners.keys()) {
      this.emitToListener(listener, options);
    }
  }

  private emitToListener(
    listener: (options: CompleteOptions) => void,
    options: CompleteOptions
  ): void {
    const signature = JSON.stringify(options);
    if (this.changeListeners.get(listener) === signature) return;
    this.changeListeners.set(listener, signature);
    try {
      listener(clone(options));
    } catch (error) {
      console.error('[ChromeOptionsRepository] onChange callback error:', error);
    }
  }
}
