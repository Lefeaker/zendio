import type { StorageAreaService, StorageService } from '../interfaces/storage';

export function createMemoryStorageArea(): StorageAreaService {
  const values = new Map<string, unknown>();

  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return values.get(key) as T | undefined;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      values.set(key, value);
    },
    async getMany<T = unknown>(keys: string[]): Promise<Record<string, T | undefined>> {
      return Object.fromEntries(keys.map((key) => [key, values.get(key) as T | undefined]));
    },
    async setMany<T = unknown>(entries: Record<string, T>): Promise<void> {
      for (const [key, value] of Object.entries(entries)) {
        values.set(key, value);
      }
    },
    async remove(key: string | string[]): Promise<void> {
      for (const currentKey of Array.isArray(key) ? key : [key]) {
        values.delete(currentKey);
      }
    },
    async clear(): Promise<void> {
      values.clear();
    },
    watchKey(): () => void {
      return () => {};
    },
    watchAll(): () => void {
      return () => {};
    }
  };
}

export function createMemoryStorageService(): StorageService {
  const sync = createMemoryStorageArea();
  const local = createMemoryStorageArea();
  const session = createMemoryStorageArea();

  return { sync, local, session };
}
