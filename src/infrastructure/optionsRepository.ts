import { deepClone } from '../options/utils/clone';
import type { CompleteOptions, StoredOptions } from '../shared/types/options';
import type { OptionsRepository } from '../shared/interfaces/optionsRepository';
import type { IOptionsRepository } from '../shared/repositories/IOptionsRepository';
import type { StorageService } from '../platform/interfaces/storage';
import { ReactiveStore } from '../shared/state/ReactiveStore';

/**
 * Transitional legacy OptionsRepository compatibility implementation.
 *
 * Options UI 主链已统一迁移到 `IOptionsRepository`；这里只保留给
 * content/background 中仍依赖 load/save/snapshot/subscribe 语义的旧链路。
 * 该实现不再定义 normalize / merge 主链职责，相关行为统一留在
 * `ChromeOptionsRepository` + `optionsStore`。
 *
 * 退役路径：
 * 1. content/background 不再依赖 legacy OptionsRepository。
 * 2. PlatformServices 停止暴露 optionsRepository bridge。
 * 3. 删除该兼容实现与旧工厂别名。
 */
export class ChromeSyncOptionsRepository implements OptionsRepository {
  private readonly store = new ReactiveStore<StoredOptions>();
  private syncPromise: Promise<boolean> | null = null;
  private isSynced = false;
  private storageWatcher: (() => void) | null = null;

  constructor(private readonly storage: StorageService) {}

  private ensureClone(
    value: StoredOptions | CompleteOptions | undefined | null
  ): StoredOptions | undefined {
    if (!value) {
      return undefined;
    }
    return deepClone(value) as StoredOptions;
  }

  private async ensureSynced(): Promise<void> {
    if (this.isSynced) {
      return;
    }
    if (this.syncPromise === null) {
      this.syncPromise = this.initializeSync();
    }
    await this.syncPromise;
  }

  private async initializeSync(): Promise<boolean> {
    try {
      const storedValue = await this.storage.sync.get<StoredOptions>('options');
      const initialValue = storedValue ? deepClone(storedValue) : undefined;

      if (initialValue) {
        this.store.set(initialValue);
      }

      this.storageWatcher = this.storage.sync.watchKey<StoredOptions>('options', (value) => {
        const mapped = value ? deepClone(value) : undefined;
        this.store.set(mapped);
      });

      this.isSynced = true;
      return true;
    } catch (error) {
      console.warn('[ChromeSyncOptionsRepository] Failed to sync with storage', error);
      this.isSynced = false;
      return false;
    } finally {
      this.syncPromise = null;
    }
  }

  async load(): Promise<StoredOptions> {
    await this.ensureSynced();
    const freshValue = await this.storage.sync.get<StoredOptions>('options');
    const hasValue = Boolean(freshValue);
    const latest = hasValue ? deepClone(freshValue) : ({} as StoredOptions);
    this.store.setSilent(hasValue ? latest : undefined);
    return deepClone(latest) as StoredOptions;
  }

  async save(options: StoredOptions | CompleteOptions): Promise<void> {
    await this.ensureSynced();
    const normalized = this.ensureClone(options) ?? ({} as StoredOptions);
    await this.storage.sync.set('options', normalized);
    this.store.set(normalized);
  }

  snapshot(): StoredOptions | null {
    const current = this.store.get();
    return current ? deepClone(current) : null;
  }

  subscribe(listener: (options: StoredOptions | undefined) => void): () => void {
    return this.store.subscribe((value) => {
      listener(value ? deepClone(value) : undefined);
    });
  }

  reset(): void {
    if (this.storageWatcher) {
      this.storageWatcher();
      this.storageWatcher = null;
    }
    this.store.set(undefined);
    this.isSynced = false;
    this.syncPromise = null;
  }
}

export class LegacyOptionsRepositoryAdapter implements OptionsRepository {
  private readonly store = new ReactiveStore<StoredOptions>();
  private unsubscribe: (() => void) | null = null;
  private pendingLoad: Promise<StoredOptions> | null = null;

  constructor(private readonly repository: IOptionsRepository) {}

  private ensureClone(
    value: StoredOptions | CompleteOptions | null | undefined
  ): StoredOptions | undefined {
    if (!value) {
      return undefined;
    }

    return deepClone(value) as StoredOptions;
  }

  private ensureSubscription(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.repository.onChange((options) => {
      this.store.set(this.ensureClone(options));
    });
  }

  async load(): Promise<StoredOptions> {
    this.ensureSubscription();

    if (this.pendingLoad === null) {
      this.pendingLoad = this.repository
        .get()
        .then((options) => {
          const cloned = this.ensureClone(options) ?? ({} as StoredOptions);
          this.store.setSilent(cloned);
          return deepClone(cloned);
        })
        .finally(() => {
          this.pendingLoad = null;
        });
    }

    return this.pendingLoad;
  }

  async save(options: StoredOptions | CompleteOptions): Promise<void> {
    this.ensureSubscription();
    const cloned = this.ensureClone(options) ?? ({} as StoredOptions);
    await this.repository.set(cloned as Partial<CompleteOptions>);
    this.store.set(cloned);
  }

  snapshot(): StoredOptions | null {
    const current = this.store.get();
    return current ? deepClone(current) : null;
  }

  subscribe(listener: (options: StoredOptions | undefined) => void): () => void {
    this.ensureSubscription();

    return this.store.subscribe((value) => {
      listener(value ? deepClone(value) : undefined);
    });
  }

  reset(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pendingLoad = null;
    this.store.set(undefined);
  }
}

export function adaptOptionsRepository(repository: IOptionsRepository): OptionsRepository {
  return new LegacyOptionsRepositoryAdapter(repository);
}

export function createCompatibilityOptionsRepository(storage: StorageService): OptionsRepository {
  return new ChromeSyncOptionsRepository(storage);
}
