import type { StorageAreaService } from '../../platform/interfaces/storage';

export interface RuntimeStorageAdapter {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
}

const nullStorageAdapter: RuntimeStorageAdapter = {
  get: () => Promise.resolve(undefined),
  set: () => Promise.resolve()
};

export function createStorageAdapter(
  storage: StorageAreaService | null | undefined
): RuntimeStorageAdapter {
  if (!storage) {
    return nullStorageAdapter;
  }

  return {
    get: (key) => storage.get(key),
    set: (key, value) => storage.set(key, value)
  };
}
