import type { Page } from '@playwright/test';

// Keep these test-only constants aligned with src/content/video/videoScreenshotCacheStore.ts.
const VIDEO_SCREENSHOT_CACHE_BLOB_STORE_DB_NAME = 'aiob-video-screenshot-cache';
const VIDEO_SCREENSHOT_CACHE_BLOB_STORE_OBJECT_STORE_NAME = 'entries';

export const VIDEO_SCREENSHOT_CACHE_LEGACY_STORAGE_KEY_PREFIX = 'aiob.videoScreenshotCache';
export const VIDEO_SCREENSHOT_CACHE_LEGACY_STORAGE_INDEX_KEY = `${VIDEO_SCREENSHOT_CACHE_LEGACY_STORAGE_KEY_PREFIX}.index.v1`;

export type VideoScreenshotCacheIndexedDbSummary = {
  cacheEntryCount: number;
  cacheIndexEntryCount: number;
  cacheKeys: string[];
};

export async function readVideoScreenshotCacheIndexedDbSummary(
  extensionPage: Page
): Promise<VideoScreenshotCacheIndexedDbSummary> {
  return extensionPage.evaluate(
    async ({ dbName, objectStoreName }) => {
      const emptySummary: VideoScreenshotCacheIndexedDbSummary = {
        cacheEntryCount: 0,
        cacheIndexEntryCount: 0,
        cacheKeys: []
      };

      const hasDatabase = async (): Promise<boolean> => {
        const databaseApi = indexedDB as IDBFactory & {
          databases?: () => Promise<Array<{ name?: string }>>;
        };
        if (typeof databaseApi.databases !== 'function') {
          return true;
        }
        const knownDatabases = await databaseApi.databases().catch(() => []);
        return knownDatabases.some((database) => database?.name === dbName);
      };

      const isValidMetadataEntry = (key: string, value: unknown): boolean => {
        if (typeof value !== 'object' || value === null) {
          return false;
        }
        const record = value as Record<string, unknown>;
        return (
          record.key === key &&
          typeof record.schemaVersion === 'number' &&
          typeof record.pageKey === 'string' &&
          record.pageKey.length > 0 &&
          typeof record.captureId === 'string' &&
          record.captureId.length > 0 &&
          typeof record.id === 'string' &&
          record.id.length > 0 &&
          typeof record.fileName === 'string' &&
          record.fileName.length > 0 &&
          typeof record.mimeType === 'string' &&
          record.mimeType.length > 0 &&
          typeof record.byteLength === 'number' &&
          Number.isFinite(record.byteLength) &&
          typeof record.capturedAt === 'number' &&
          Number.isFinite(record.capturedAt) &&
          typeof record.createdAt === 'number' &&
          Number.isFinite(record.createdAt) &&
          typeof record.updatedAt === 'number' &&
          Number.isFinite(record.updatedAt) &&
          typeof record.expiresAt === 'number' &&
          Number.isFinite(record.expiresAt) &&
          record.expiresAt > record.capturedAt &&
          record.updatedAt >= record.createdAt
        );
      };

      const openDatabase = async (): Promise<IDBDatabase | null> => {
        if (!(await hasDatabase())) {
          return null;
        }
        return new Promise<IDBDatabase | null>((resolve, reject) => {
          let createdFreshDatabase = false;
          const request = indexedDB.open(dbName);
          request.onupgradeneeded = () => {
            createdFreshDatabase = true;
          };
          request.onerror = () => {
            reject(request.error ?? new Error(`Failed to open IndexedDB database "${dbName}".`));
          };
          request.onsuccess = () => {
            const database = request.result;
            if (createdFreshDatabase) {
              database.close();
              indexedDB.deleteDatabase(dbName);
              resolve(null);
              return;
            }
            resolve(database);
          };
        });
      };

      const database = await openDatabase();
      if (database === null) {
        return emptySummary;
      }

      try {
        if (!database.objectStoreNames.contains(objectStoreName)) {
          return emptySummary;
        }

        const transaction = database.transaction(objectStoreName, 'readonly');
        const store = transaction.objectStore(objectStoreName);
        const cacheKeys: string[] = [];
        let cacheIndexEntryCount = 0;
        const transactionDone = new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => {
            reject(
              transaction.error ??
                new Error(`IndexedDB transaction failed for "${objectStoreName}".`)
            );
          };
          transaction.onabort = () => {
            reject(
              transaction.error ??
                new Error(`IndexedDB transaction aborted for "${objectStoreName}".`)
            );
          };
        });

        await new Promise<void>((resolve, reject) => {
          const request = store.openCursor();
          request.onerror = () => {
            reject(
              request.error ?? new Error(`Failed to iterate IndexedDB store "${objectStoreName}".`)
            );
          };
          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor === null) {
              resolve();
              return;
            }
            const key =
              typeof cursor.primaryKey === 'string'
                ? cursor.primaryKey
                : String(cursor.primaryKey ?? '');
            cacheKeys.push(key);
            if (isValidMetadataEntry(key, cursor.value)) {
              cacheIndexEntryCount += 1;
            }
            cursor.continue();
          };
        });

        await transactionDone;

        return {
          cacheEntryCount: cacheKeys.length,
          cacheIndexEntryCount,
          cacheKeys
        };
      } finally {
        database.close();
      }
    },
    {
      dbName: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_DB_NAME,
      objectStoreName: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_OBJECT_STORE_NAME
    }
  );
}

export async function clearVideoScreenshotCacheIndexedDb(extensionPage: Page): Promise<void> {
  await extensionPage.evaluate(
    async ({ dbName, objectStoreName }) => {
      const databaseApi = indexedDB as IDBFactory & {
        databases?: () => Promise<Array<{ name?: string }>>;
      };
      if (typeof databaseApi.databases === 'function') {
        const knownDatabases = await databaseApi.databases().catch(() => []);
        if (!knownDatabases.some((database) => database?.name === dbName)) {
          return;
        }
      }

      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => {
          reject(request.error ?? new Error(`Failed to open IndexedDB database "${dbName}".`));
        };
        request.onsuccess = () => resolve(request.result);
      });

      try {
        if (!database.objectStoreNames.contains(objectStoreName)) {
          return;
        }

        const transaction = database.transaction(objectStoreName, 'readwrite');
        const transactionDone = new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => {
            reject(
              transaction.error ??
                new Error(`Failed to clear IndexedDB store "${objectStoreName}".`)
            );
          };
          transaction.onabort = () => {
            reject(
              transaction.error ??
                new Error(`Clearing IndexedDB store "${objectStoreName}" was aborted.`)
            );
          };
        });
        transaction.objectStore(objectStoreName).clear();
        await transactionDone;
      } finally {
        database.close();
      }
    },
    {
      dbName: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_DB_NAME,
      objectStoreName: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_OBJECT_STORE_NAME
    }
  );
}
