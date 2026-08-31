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
  createDeviceLocalPrivacyConsent,
  DEVICE_LOCAL_PRIVACY_CONFIG_KEY,
  DEVICE_LOCAL_PRIVACY_CONSENT_KEY,
  mergeDeviceLocalPrivacyConfig,
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
  writePrivacy(preferences: PrivacyPreferencesOptions): Promise<void>;
}

/**
 * Local Options reads and storage observation. Raw writes are intentionally
 * exposed only to the background mutation coordinator, never through DI.
 */
export class ChromeOptionsRepository implements OptionsRawStorageRepository {
  private readonly changeListeners = new Map<(options: CompleteOptions) => void, string | null>();
  private stopWatchingOptions: (() => void) | null = null;
  private stopWatchingPrivacy: Array<() => void> = [];

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
      const [localConsent, localConfig] = await Promise.all([
        this.storage.local.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_CONSENT_KEY),
        this.storage.local.get<PlainStructuredValue>(DEVICE_LOCAL_PRIVACY_CONFIG_KEY)
      ]);
      return resolveDeviceLocalPrivacy(localConsent, localConfig, portableRaw).preferences;
    } catch (error) {
      throw new StorageError('Failed to read device-local privacy from chrome.storage', {
        cause: error,
        context: { storageKey: DEVICE_LOCAL_PRIVACY_CONSENT_KEY }
      });
    }
  }

  async writePrivacy(preferences: PrivacyPreferencesOptions): Promise<void> {
    try {
      const storedConfig = await this.storage.local.get<PlainStructuredValue>(
        DEVICE_LOCAL_PRIVACY_CONFIG_KEY
      );
      await Promise.all([
        this.storage.local.set(
          DEVICE_LOCAL_PRIVACY_CONSENT_KEY,
          createDeviceLocalPrivacyConsent(preferences, Date.now())
        ),
        this.storage.local.set(
          DEVICE_LOCAL_PRIVACY_CONFIG_KEY,
          mergeDeviceLocalPrivacyConfig(storedConfig, preferences)
        )
      ]);
    } catch (error) {
      throw new StorageError('Failed to write device-local privacy to chrome.storage', {
        cause: error,
        context: { storageKey: DEVICE_LOCAL_PRIVACY_CONSENT_KEY }
      });
    }
  }

  onChange(callback: (options: CompleteOptions) => void): () => void {
    this.changeListeners.set(callback, null);
    this.ensureStorageWatcher();
    let active = true;

    void this.get()
      .then((options) => {
        if (!active || !this.changeListeners.has(callback)) return;
        this.emitToListener(callback, options);
      })
      .catch((error) => {
        if (active) {
          console.error('[ChromeOptionsRepository] Failed to emit initial state:', error);
        }
      });

    return () => {
      active = false;
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
        void this.emitStoredToListeners(stored ?? null);
      }
    );
    const emitLocalPrivacyChange = (): void => {
      void this.readRaw()
        .then((stored) => this.emitStoredToListeners(stored))
        .catch((error) =>
          console.error('[ChromeOptionsRepository] Failed to emit local privacy state:', error)
        );
    };
    this.stopWatchingPrivacy = [
      this.storage.local.watchKey(DEVICE_LOCAL_PRIVACY_CONSENT_KEY, emitLocalPrivacyChange),
      this.storage.local.watchKey(DEVICE_LOCAL_PRIVACY_CONFIG_KEY, emitLocalPrivacyChange)
    ];
  }

  private async emitStoredToListeners(stored: PlainStructuredValue | null): Promise<void> {
    try {
      const decoded = decodeStoredOptions(stored);
      const privacy = await this.readPrivacy(stored);
      this.emitToListeners(composeDeviceLocalPrivacy(decoded.runtime, privacy));
    } catch (error) {
      console.error('[ChromeOptionsRepository] Failed to compose changed options:', error);
    }
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
