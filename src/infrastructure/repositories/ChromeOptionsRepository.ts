import type { StorageService } from '../../platform/interfaces/storage';
import {
  decodeStoredOptions,
  type DecodedStoredOptions
} from '../../shared/config/storedOptionsCodec';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '../../shared/config/losslessObjectBoundaryTypes';
import { StorageError } from '../../shared/errors/repositoryErrors';
import type { CompleteOptions } from '../../shared/types/options';

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

/**
 * Local Options reads and storage observation. Raw writes are intentionally
 * exposed only to the background mutation coordinator, never through DI.
 */
export class ChromeOptionsRepository implements OptionsRawStorageRepository {
  private readonly changeListeners = new Map<(options: CompleteOptions) => void, string | null>();
  private stopWatchingOptions: (() => void) | null = null;

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
    return decodeStoredOptions(await this.readRaw());
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
      }
    };
  }

  private ensureStorageWatcher(): void {
    if (this.stopWatchingOptions) return;
    this.stopWatchingOptions = this.storage.sync.watchKey<PlainStructuredValue | null>(
      OPTIONS_STORAGE_KEY,
      (stored) => {
        this.emitToListeners(decodeStoredOptions(stored).runtime);
      }
    );
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
