import type { Page } from '@playwright/test';

const DB_NAME = 'aiob-video-screenshot-cache';
const ENTRY_STORE = 'entries';
const METADATA_STORE = 'metadata';
const ENTRY_INDEXES = [
  ['byPageKey', 'pageKey'],
  ['byExpiresAt', 'expiresAt'],
  ['byUpdatedAt', 'updatedAt'],
  ['byPageCapture', ['pageKey', 'captureId']]
] as const;

export const VIDEO_SCREENSHOT_CACHE_LEGACY_STORAGE_KEY_PREFIX = 'aiob.videoScreenshotCache';
export const VIDEO_SCREENSHOT_CACHE_LEGACY_STORAGE_INDEX_KEY = `${VIDEO_SCREENSHOT_CACHE_LEGACY_STORAGE_KEY_PREFIX}.index.v1`;

export type VideoScreenshotCacheIndexedDbSummary = {
  cacheEntryCount: number;
  cacheIndexEntryCount: number;
  cacheKeys: string[];
};

export interface VideoScreenshotCacheV1Seed {
  schemaVersion: 1;
  key: string;
  pageKey: string;
  captureId: string;
  id: string;
  fileName: string;
  mimeType: 'image/jpeg';
  capturedAt: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  blobBytes: number[];
}

export interface VideoScreenshotCacheIndexedDbSnapshot {
  version: number;
  stores: Array<{
    name: string;
    keyPath: string | string[] | null;
    autoIncrement: boolean;
    indexes: Array<{
      name: string;
      keyPath: string | string[] | null;
      unique: boolean;
      multiEntry: boolean;
    }>;
  }>;
  entry: {
    schemaVersion: number;
    key: string;
    pageKey: string;
    captureId: string;
    id: string;
    fileName: string;
    mimeType: string;
    byteLength: number;
    capturedAt: number;
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
    blob: { type: string; size: number; bytes: number[] };
  } | null;
  metadataRecords: Array<{ id: string; schemaVersion: number; lastPrunedAt: number | null }>;
}

export async function readVideoScreenshotCacheIndexedDbSummary(
  extensionPage: Page
): Promise<VideoScreenshotCacheIndexedDbSummary> {
  return extensionPage.evaluate(
    async ({ dbName, entryStore }) => {
      const empty = { cacheEntryCount: 0, cacheIndexEntryCount: 0, cacheKeys: [] };
      const getResult = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
        });
      const done = (transaction: IDBTransaction) =>
        new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed.'));
          transaction.onabort = () =>
            reject(transaction.error ?? new Error('Transaction aborted.'));
        });
      const record = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null;
      const databases = Reflect.get(indexedDB, 'databases');
      if (typeof databases !== 'function') return empty;
      const known = await databases.call(indexedDB).catch(() => []);
      if (!known.some((database: { name?: string }) => database.name === dbName)) return empty;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => reject(request.error ?? new Error(`Failed to open "${dbName}".`));
        request.onsuccess = () => resolve(request.result);
      });
      try {
        if (!database.objectStoreNames.contains(entryStore)) return empty;
        const transaction = database.transaction(entryStore, 'readonly');
        const transactionDone = done(transaction);
        const rows = await getResult(transaction.objectStore(entryStore).getAll());
        await transactionDone;
        const records = Array.isArray(rows) ? rows : [];
        const keys = records
          .map((row) => (record(row) && typeof row.key === 'string' ? row.key : ''))
          .filter(Boolean);
        const valid = records.filter(
          (row) =>
            record(row) &&
            typeof row.key === 'string' &&
            row.schemaVersion === 1 &&
            typeof row.pageKey === 'string' &&
            typeof row.captureId === 'string' &&
            typeof row.id === 'string' &&
            typeof row.byteLength === 'number' &&
            row.blob instanceof Blob
        ).length;
        return { cacheEntryCount: keys.length, cacheIndexEntryCount: valid, cacheKeys: keys };
      } finally {
        database.close();
      }
    },
    { dbName: DB_NAME, entryStore: ENTRY_STORE }
  );
}

export async function clearVideoScreenshotCacheIndexedDb(extensionPage: Page): Promise<void> {
  await extensionPage.evaluate(
    async ({ dbName, entryStore }) => {
      const done = (transaction: IDBTransaction) =>
        new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed.'));
          transaction.onabort = () =>
            reject(transaction.error ?? new Error('Transaction aborted.'));
        });
      const databases = Reflect.get(indexedDB, 'databases');
      if (typeof databases !== 'function') return;
      const known = await databases.call(indexedDB).catch(() => []);
      if (!known.some((database: { name?: string }) => database.name === dbName)) return;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => reject(request.error ?? new Error(`Failed to open "${dbName}".`));
        request.onsuccess = () => resolve(request.result);
      });
      try {
        if (!database.objectStoreNames.contains(entryStore)) return;
        const transaction = database.transaction(entryStore, 'readwrite');
        const transactionDone = done(transaction);
        transaction.objectStore(entryStore).clear();
        await transactionDone;
      } finally {
        database.close();
      }
    },
    { dbName: DB_NAME, entryStore: ENTRY_STORE }
  );
}

export async function seedVideoScreenshotCacheV1(
  extensionPage: Page,
  fixture: VideoScreenshotCacheV1Seed
): Promise<void> {
  await extensionPage.evaluate(
    async ({ dbName, entryStore, indexes, fixture }) => {
      const databases = Reflect.get(indexedDB, 'databases');
      if (typeof databases === 'function') {
        const known = await databases.call(indexedDB).catch(() => []);
        if (known.some((database: { name?: string }) => database.name === dbName)) {
          throw new Error(`Refusing to overwrite existing IndexedDB "${dbName}".`);
        }
      }
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore(entryStore, { keyPath: 'key' });
          for (const [name, keyPath] of indexes) store.createIndex(name, keyPath);
          const blob = new Blob([new Uint8Array(fixture.blobBytes)], { type: fixture.mimeType });
          const { blobBytes: _blobBytes, ...metadata } = fixture;
          void _blobBytes;
          store.put({ ...metadata, byteLength: blob.size, blob });
        };
        request.onerror = () => reject(request.error ?? new Error(`Failed to seed "${dbName}".`));
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
      });
    },
    { dbName: DB_NAME, entryStore: ENTRY_STORE, indexes: ENTRY_INDEXES, fixture }
  );
}

export async function readVideoScreenshotCacheIndexedDbSnapshot(
  extensionPage: Page,
  key: string
): Promise<VideoScreenshotCacheIndexedDbSnapshot> {
  return extensionPage.evaluate(
    async ({ dbName, entryStore, metadataStore, key }) => {
      const getResult = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
        });
      const done = (transaction: IDBTransaction) =>
        new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed.'));
          transaction.onabort = () =>
            reject(transaction.error ?? new Error('Transaction aborted.'));
        });
      const record = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null;
      const keyPath = (value: string | string[] | null): string | string[] | null =>
        Array.isArray(value) ? [...value] : value;
      const databases = Reflect.get(indexedDB, 'databases');
      if (typeof databases !== 'function') throw new Error('indexedDB.databases() is unavailable.');
      const known = await databases.call(indexedDB).catch(() => []);
      if (!known.some((database: { name?: string }) => database.name === dbName)) {
        throw new Error(`IndexedDB "${dbName}" does not exist.`);
      }
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => reject(request.error ?? new Error(`Failed to open "${dbName}".`));
        request.onsuccess = () => resolve(request.result);
      });
      try {
        const stores = [...database.objectStoreNames].map((name) => {
          const transaction = database.transaction(name, 'readonly');
          const store = transaction.objectStore(name);
          const indexes = [...store.indexNames].map((indexName) => {
            const index = store.index(indexName);
            return {
              name: indexName,
              keyPath: keyPath(index.keyPath),
              unique: index.unique,
              multiEntry: index.multiEntry
            };
          });
          indexes.sort((left, right) => left.name.localeCompare(right.name));
          return {
            name,
            keyPath: keyPath(store.keyPath),
            autoIncrement: store.autoIncrement,
            indexes
          };
        });
        stores.sort((left, right) => left.name.localeCompare(right.name));
        const names = [
          entryStore,
          ...(database.objectStoreNames.contains(metadataStore) ? [metadataStore] : [])
        ];
        const transaction = database.transaction(names, 'readonly');
        const transactionDone = done(transaction);
        const rawEntry: unknown = await getResult<unknown>(
          transaction.objectStore(entryStore).get(key)
        );
        const rawMetadataRecords = database.objectStoreNames.contains(metadataStore)
          ? await getResult<unknown[]>(transaction.objectStore(metadataStore).getAll())
          : [];
        await transactionDone;
        const metadataRecords = rawMetadataRecords.map((value) => {
          if (
            !record(value) ||
            typeof value.id !== 'string' ||
            typeof value.schemaVersion !== 'number' ||
            (value.lastPrunedAt !== null && typeof value.lastPrunedAt !== 'number')
          ) {
            throw new Error('Unexpected screenshot cache maintenance metadata.');
          }
          return {
            id: value.id,
            schemaVersion: value.schemaVersion,
            lastPrunedAt: value.lastPrunedAt
          };
        });
        let entry: VideoScreenshotCacheIndexedDbSnapshot['entry'] = null;
        if (record(rawEntry) && rawEntry.blob instanceof Blob) {
          entry = {
            schemaVersion: Number(rawEntry.schemaVersion),
            key: String(rawEntry.key),
            pageKey: String(rawEntry.pageKey),
            captureId: String(rawEntry.captureId),
            id: String(rawEntry.id),
            fileName: String(rawEntry.fileName),
            mimeType: String(rawEntry.mimeType),
            byteLength: Number(rawEntry.byteLength),
            capturedAt: Number(rawEntry.capturedAt),
            createdAt: Number(rawEntry.createdAt),
            updatedAt: Number(rawEntry.updatedAt),
            expiresAt: Number(rawEntry.expiresAt),
            blob: {
              type: rawEntry.blob.type,
              size: rawEntry.blob.size,
              bytes: [...new Uint8Array(await rawEntry.blob.arrayBuffer())]
            }
          };
        }
        return { version: database.version, stores, entry, metadataRecords };
      } finally {
        database.close();
      }
    },
    { dbName: DB_NAME, entryStore: ENTRY_STORE, metadataStore: METADATA_STORE, key }
  );
}
