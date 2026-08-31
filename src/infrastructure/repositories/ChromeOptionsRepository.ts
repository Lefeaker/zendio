import type { StorageService } from '../../platform/interfaces/storage';
import { plainStructuredDataEqual } from '../../shared/config/losslessObjectBoundary';
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
  DeviceLocalPrivacyStore,
  DEVICE_LOCAL_PRIVACY_CONFIG_KEY,
  DEVICE_LOCAL_PRIVACY_CONSENT_KEY,
  DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY
} from '../../shared/config/deviceLocalPrivacy';
import { StorageError } from '../../shared/errors/repositoryErrors';
import type { CompleteOptions, PrivacyPreferencesOptions } from '../../shared/types/options';
import type { OptionsMutationCommand } from '../../shared/types/optionsMutationMessages';

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

export type OptionsMutationVerification =
  | { readonly kind: 'full'; readonly expected: PlainStructuredObject }
  | {
      readonly kind: 'paths';
      readonly expected: ReadonlyArray<{
        readonly path: readonly string[];
        readonly value: PlainStructuredValue | undefined;
      }>;
    };

export interface DeviceLocalPrivacyCommitter {
  execute(
    command: OptionsMutationCommand,
    applyCommand: (
      raw: PlainStructuredObject,
      command: OptionsMutationCommand
    ) => { next: PlainStructuredObject; verification: OptionsMutationVerification },
    quotaBytesPerItem: number
  ): Promise<{
    raw: PlainStructuredObject;
    privacy?: PrivacyPreferencesOptions;
    didWrite: boolean;
  }>;
}

export function optionsEnvelopeBytes(raw: PlainStructuredObject): number {
  return new TextEncoder().encode(JSON.stringify({ options: raw })).byteLength;
}

export function optionsRawSignature(raw: PlainStructuredObject): string {
  const bytes = new TextEncoder().encode(JSON.stringify(raw));
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}:${bytes.byteLength}`;
}

export function optionsValuesEqual(
  left: PlainStructuredValue | undefined,
  right: PlainStructuredValue | undefined
): boolean {
  if (left === undefined || right === undefined) return left === right;
  const result = plainStructuredDataEqual(left, right);
  return result.ok && result.equal;
}

function readOptionsPath(
  raw: PlainStructuredObject,
  path: readonly string[]
): PlainStructuredValue | undefined {
  let current: PlainStructuredValue | undefined = raw;
  for (const part of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined;
    current = current[part];
  }
  return current;
}

export function optionsVerificationMatches(
  raw: PlainStructuredObject,
  verification: OptionsMutationVerification
): boolean {
  return verification.kind === 'full'
    ? optionsValuesEqual(raw, verification.expected)
    : verification.expected.every(({ path, value }) =>
        optionsValuesEqual(readOptionsPath(raw, path), value)
      );
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
  private readonly privacyStore: DeviceLocalPrivacyStore;

  constructor(private readonly storage: StorageService) {
    this.privacyStore = new DeviceLocalPrivacyStore(storage.local);
  }

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
      return (await this.privacyStore.read(portableRaw)).preferences;
    } catch (error) {
      throw new StorageError('Failed to read device-local privacy from chrome.storage', {
        cause: error,
        context: { storageKey: DEVICE_LOCAL_PRIVACY_CONSENT_KEY }
      });
    }
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

  private async composeStoredOptions(
    stored: PlainStructuredValue | null
  ): Promise<CompleteOptions> {
    const decoded = decodeStoredOptions(stored);
    const privacy = await this.readPrivacy(stored);
    return composeDeviceLocalPrivacy(decoded.runtime, privacy);
  }

  private requestNotification(read: () => Promise<CompleteOptions>, reason: string): void {
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
