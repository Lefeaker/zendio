import {
  isObjectRecord,
  type ObjectRecord,
  type RuntimePropertyValue
} from '../../shared/guards/object';
import {
  openIndexedDb,
  requestToPromise,
  runIndexedDbTransaction
} from '../../shared/storage/indexedDbLifecycle';
import {
  assertIndexedDbIndex,
  assertIndexedDbNameList,
  assertIndexedDbObjectStore,
  ensureIndexedDbIndex,
  ensureIndexedDbObjectStore,
  IndexedDbLifecycleError,
  type IndexedDbDatabase,
  type IndexedDbFactory,
  type IndexedDbIndexSchema,
  type IndexedDbObjectStore,
  type IndexedDbTimer,
  type IndexedDbTransaction,
  type OpenIndexedDbOptions
} from '../../shared/storage/indexedDbTypes';
import {
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_DB_NAME as DB_NAME,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_DB_VERSION as DB_VERSION,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_EXPIRES_AT_INDEX_NAME as EXPIRES_AT_INDEX,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_MAINTENANCE_ID as MAINTENANCE_ID,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_METADATA_OBJECT_STORE_NAME as METADATA_STORE,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_METADATA_SCHEMA_VERSION as METADATA_SCHEMA_VERSION,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_OBJECT_STORE_NAME as ENTRY_STORE,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_PAGE_CAPTURE_INDEX_NAME as PAGE_CAPTURE_INDEX,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_PAGE_KEY_INDEX_NAME as PAGE_KEY_INDEX,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_UPDATED_AT_INDEX_NAME as UPDATED_AT_INDEX,
  normalizeVideoScreenshotCacheBlobEntry as normalizeEntry,
  pruneVideoScreenshotCacheBlobMetadataEntries as pruneMetadata,
  sortVideoScreenshotCacheBlobMetadataNewestFirst as sortNewest,
  type VideoScreenshotCacheBlobEntry as BlobEntry,
  type VideoScreenshotCacheBlobMetadata as BlobMetadata,
  type VideoScreenshotCacheBlobStore as BlobStore,
  type VideoScreenshotCacheBlobStorePruneResult as PruneResult,
  type VideoScreenshotCacheMaintenanceMetadata as MaintenanceMetadata
} from '../../content/video/videoScreenshotCacheStore';
import { isVideoScreenshotCachePageKey } from '../../content/video/videoScreenshotCacheTypes';

const ENTRY_STORE_SCHEMA = { name: ENTRY_STORE, keyPath: 'key', autoIncrement: false };
const METADATA_STORE_SCHEMA = {
  name: METADATA_STORE,
  keyPath: 'id',
  autoIncrement: false
};
const indexSchema = (name: string, keyPath: string | readonly string[]): IndexedDbIndexSchema => ({
  name,
  keyPath,
  unique: false,
  multiEntry: false
});
const ENTRY_INDEX_SCHEMAS: readonly IndexedDbIndexSchema[] = [
  indexSchema(PAGE_KEY_INDEX, 'pageKey'),
  indexSchema(EXPIRES_AT_INDEX, 'expiresAt'),
  indexSchema(UPDATED_AT_INDEX, 'updatedAt'),
  indexSchema(PAGE_CAPTURE_INDEX, ['pageKey', 'captureId'])
];
const ENTRY_INDEX_NAMES = ENTRY_INDEX_SCHEMAS.map(({ name }) => name);

export interface VideoScreenshotCacheIndexedDbStoreOptions {
  indexedDb?: IndexedDbFactory | undefined;
  timer?: IndexedDbTimer | undefined;
}

export function createVideoScreenshotCacheIndexedDbStore(
  options: VideoScreenshotCacheIndexedDbStoreOptions = {}
): BlobStore {
  const databaseOptions = createDatabaseOptions(options);
  const readAllEntries = (store: IndexedDbObjectStore) =>
    requestToRecordArray(store, 'Failed to read video screenshot cache blob rows.').then(
      collectEntries
    );
  return {
    async put(entry) {
      const normalizedEntry = normalizeEntry(entry);
      if (normalizedEntry === null) {
        throw new Error('Video screenshot cache blob store rejected an invalid blob entry.');
      }
      await withEntryStore(databaseOptions, 'readwrite', (store) =>
        requestToPromise(
          store.put(normalizedEntry),
          'Failed to write video screenshot cache blob entry.'
        )
      );
    },
    async get(key) {
      if (!isNonEmptyString(key)) return null;
      return withEntryStore(databaseOptions, 'readwrite', async (store) => {
        const rawValue = await requestToPromise(
          store.get(key),
          'Failed to read video screenshot cache blob entry.'
        );
        if (!isObjectRecord(rawValue)) return null;
        const entry = normalizeEntry(rawValue);
        if (entry !== null) return entry;
        await deleteKeys(store, [key]);
        return null;
      });
    },
    async delete(key) {
      if (isNonEmptyString(key)) {
        await withEntryStore(databaseOptions, 'readwrite', (store) => deleteKeys(store, [key]));
      }
    },
    async deleteMany(keys) {
      const uniqueKeys = sanitizeKeys(keys);
      if (uniqueKeys.length > 0) {
        await withEntryStore(databaseOptions, 'readwrite', (store) =>
          deleteKeys(store, uniqueKeys)
        );
      }
    },
    async listByPageKey(pageKey) {
      if (!isVideoScreenshotCachePageKey(pageKey)) return [];
      return withEntryStore(databaseOptions, 'readwrite', async (store) => {
        const rawValues = (
          await requestToPromise(
            store.index(PAGE_KEY_INDEX).getAll(pageKey),
            'Failed to read video screenshot cache page blob entries.'
          )
        ).filter(isObjectRecord);
        const { entries, invalidKeys } = collectEntries(rawValues);
        await deleteKeys(store, invalidKeys);
        return sortNewest(entries);
      });
    },
    async listAllMetadata() {
      return withEntryStore(databaseOptions, 'readwrite', async (store) => {
        const { entries, invalidKeys } = await readAllEntries(store);
        await deleteKeys(store, invalidKeys);
        return sortNewest(entries.map(toMetadata));
      });
    },
    async prune(pruneOptions) {
      return withStores(
        databaseOptions,
        [ENTRY_STORE, METADATA_STORE],
        'readwrite',
        async (transaction) => {
          const entriesStore = transaction.objectStore(ENTRY_STORE);
          const { entries, invalidKeys } = await readAllEntries(entriesStore);
          const result = pruneMetadata(entries.map(toMetadata), pruneOptions);
          const removedKeys = sanitizeKeys([...invalidKeys, ...result.removedKeys]);
          await deleteKeys(entriesStore, removedKeys);
          await requestToPromise(
            transaction
              .objectStore(METADATA_STORE)
              .put(createMaintenanceMetadata(pruneOptions.now)),
            'Failed to update video screenshot cache maintenance metadata.'
          );
          return {
            entries: result.entries,
            removedKeys,
            dirty: result.dirty || invalidKeys.length > 0
          } satisfies PruneResult;
        }
      );
    }
  };
}

function createDatabaseOptions(
  options: VideoScreenshotCacheIndexedDbStoreOptions
): OpenIndexedDbOptions {
  return {
    name: DB_NAME,
    version: DB_VERSION,
    indexedDb: options.indexedDb,
    timer: options.timer,
    migrations: [
      {
        fromVersion: 0,
        toVersion: 1,
        migrate: ({ database, transaction }) => {
          const store = ensureIndexedDbObjectStore(database, transaction, ENTRY_STORE_SCHEMA);
          for (const schema of ENTRY_INDEX_SCHEMAS) ensureIndexedDbIndex(store, schema);
          assertIndexedDbNameList(
            store.indexNames,
            ENTRY_INDEX_NAMES,
            'Screenshot cache entry index'
          );
        }
      },
      {
        fromVersion: 1,
        toVersion: 2,
        migrate: ({ database, transaction }) => {
          assertIndexedDbNameList(
            database.objectStoreNames,
            [ENTRY_STORE],
            'Screenshot cache v1 object store'
          );
          validateEntryStore(transaction);
          const metadata = ensureIndexedDbObjectStore(database, transaction, METADATA_STORE_SCHEMA);
          assertIndexedDbNameList(metadata.indexNames, [], 'Screenshot cache metadata index');
          metadata.put(createMaintenanceMetadata(null));
        }
      }
    ],
    validate: validateDatabase
  };
}

async function validateDatabase(database: IndexedDbDatabase): Promise<void> {
  assertIndexedDbNameList(
    database.objectStoreNames,
    [ENTRY_STORE, METADATA_STORE],
    'Screenshot cache object store'
  );
  await runIndexedDbTransaction(
    database,
    [ENTRY_STORE, METADATA_STORE],
    'readonly',
    async (transaction) => {
      validateEntryStore(transaction);
      const metadataStore = assertIndexedDbObjectStore(transaction, METADATA_STORE_SCHEMA);
      assertIndexedDbNameList(metadataStore.indexNames, [], 'Screenshot cache metadata index');
      const records = await requestToPromise(
        metadataStore.getAll(),
        'Failed to validate screenshot cache maintenance metadata.'
      );
      if (records.length !== 1 || !isMaintenanceMetadata(records[0])) {
        throw new IndexedDbLifecycleError(
          'SCHEMA_MISMATCH',
          'Screenshot cache maintenance metadata differs.'
        );
      }
    }
  );
}

function validateEntryStore(transaction: IndexedDbTransaction): IndexedDbObjectStore {
  const store = assertIndexedDbObjectStore(transaction, ENTRY_STORE_SCHEMA);
  assertIndexedDbNameList(store.indexNames, ENTRY_INDEX_NAMES, 'Screenshot cache entry index');
  for (const schema of ENTRY_INDEX_SCHEMAS) assertIndexedDbIndex(store, schema);
  return store;
}

async function withStores<T>(
  options: OpenIndexedDbOptions,
  storeNames: string | readonly string[],
  mode: IDBTransactionMode,
  operation: (transaction: IndexedDbTransaction) => Promise<T> | T
): Promise<T> {
  const database = await openIndexedDb(options);
  try {
    return await runIndexedDbTransaction(database, storeNames, mode, operation);
  } finally {
    database.close();
  }
}

function withEntryStore<T>(
  options: OpenIndexedDbOptions,
  mode: IDBTransactionMode,
  operation: (store: IndexedDbObjectStore) => Promise<T> | T
): Promise<T> {
  return withStores(options, ENTRY_STORE, mode, (transaction) =>
    operation(transaction.objectStore(ENTRY_STORE))
  );
}

async function requestToRecordArray(
  store: IndexedDbObjectStore,
  errorMessage: string
): Promise<ObjectRecord[]> {
  const rawValues = await requestToPromise(store.getAll(), errorMessage);
  return Array.isArray(rawValues) ? rawValues.filter(isObjectRecord) : [];
}
function collectEntries(rawValues: readonly ObjectRecord[]): {
  entries: BlobEntry[];
  invalidKeys: string[];
} {
  const entries: BlobEntry[] = [];
  const invalidKeys: string[] = [];
  for (const rawValue of rawValues) {
    const entry = normalizeEntry(rawValue);
    if (entry !== null) entries.push(entry);
    else {
      const rawKey = extractKey(rawValue);
      if (rawKey !== null) invalidKeys.push(rawKey);
    }
  }
  return { entries, invalidKeys: sanitizeKeys(invalidKeys) };
}
function createMaintenanceMetadata(lastPrunedAt: number | null): MaintenanceMetadata {
  return {
    id: MAINTENANCE_ID,
    schemaVersion: METADATA_SCHEMA_VERSION,
    lastPrunedAt
  };
}
function isMaintenanceMetadata(value: RuntimePropertyValue): boolean {
  return (
    isObjectRecord(value) &&
    value.id === MAINTENANCE_ID &&
    value.schemaVersion === METADATA_SCHEMA_VERSION &&
    (value.lastPrunedAt === null ||
      (typeof value.lastPrunedAt === 'number' &&
        Number.isInteger(value.lastPrunedAt) &&
        value.lastPrunedAt >= 0))
  );
}
function extractKey(value: RuntimePropertyValue): string | null {
  return isObjectRecord(value) && isNonEmptyString(value.key) ? value.key : null;
}
function toMetadata(entry: BlobEntry): BlobMetadata {
  const { blob, ...metadata } = entry;
  void blob;
  return metadata;
}
async function deleteKeys(store: IndexedDbObjectStore, keys: readonly string[]): Promise<void> {
  for (const key of sanitizeKeys(keys)) {
    await requestToPromise(store.delete(key), `Failed to delete screenshot cache entry: ${key}`);
  }
}
function sanitizeKeys(keys: readonly string[]): string[] {
  return Array.from(new Set(keys.filter(isNonEmptyString)));
}
function isNonEmptyString(value: RuntimePropertyValue): value is string {
  return typeof value === 'string' && value.length > 0;
}
