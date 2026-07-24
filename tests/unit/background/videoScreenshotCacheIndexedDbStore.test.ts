/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest';
import { createVideoScreenshotCacheStorageKey } from '@content/video/videoScreenshotCacheTypes';
import {
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_DB_NAME,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_DB_VERSION,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_EXPIRES_AT_INDEX_NAME,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_MAINTENANCE_ID,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_METADATA_OBJECT_STORE_NAME,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_OBJECT_STORE_NAME,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_PAGE_CAPTURE_INDEX_NAME,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_PAGE_KEY_INDEX_NAME,
  VIDEO_SCREENSHOT_CACHE_BLOB_STORE_UPDATED_AT_INDEX_NAME,
  type VideoScreenshotCacheBlobEntry,
  type VideoScreenshotCacheBlobMetadata
} from '@content/video/videoScreenshotCacheStore';
import { isObjectRecord, type RuntimePropertyValue } from '@shared/guards/object';
import type {
  IndexedDbDatabase,
  IndexedDbEventHandler,
  IndexedDbFactory,
  IndexedDbIndex,
  IndexedDbNameList,
  IndexedDbObjectStore,
  IndexedDbOpenRequest,
  IndexedDbRequest,
  IndexedDbTransaction
} from '@shared/storage/indexedDbTypes';
import { createVideoScreenshotCacheIndexedDbStore } from '../../../src/background/services/videoScreenshotCacheIndexedDbStore';

const BASE_TIME = 2_000_000_000_000;

type StoreState = {
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  indexes: Map<string, { keyPath: string | string[]; unique: boolean; multiEntry: boolean }>;
  records: Map<string, RuntimePropertyValue>;
};
type DatabaseState = { name: string; version: number; stores: Map<string, StoreState> };
type Outcome = 'complete' | 'error' | 'abort';

function cloneStore(store: StoreState): StoreState {
  return {
    keyPath: Array.isArray(store.keyPath) ? [...store.keyPath] : store.keyPath,
    autoIncrement: store.autoIncrement,
    indexes: new Map(
      [...store.indexes].map(([name, value]) => [
        name,
        {
          keyPath: Array.isArray(value.keyPath) ? [...value.keyPath] : value.keyPath,
          unique: value.unique,
          multiEntry: value.multiEntry
        }
      ])
    ),
    records: new Map(store.records)
  };
}

function cloneState(state: DatabaseState): DatabaseState {
  return {
    name: state.name,
    version: state.version,
    stores: new Map([...state.stores].map(([name, store]) => [name, cloneStore(store)]))
  };
}

class FakeRequest<T> implements IndexedDbRequest<T> {
  error: DOMException | null = null;
  onsuccess: IndexedDbEventHandler = null;
  onerror: IndexedDbEventHandler = null;
  constructor(readonly result: T) {}
}

class FakeOpenRequest implements IndexedDbOpenRequest {
  error: DOMException | null = null;
  transaction: IndexedDbTransaction | null = null;
  onblocked: IndexedDbEventHandler<IDBVersionChangeEvent> = null;
  onerror: IndexedDbEventHandler = null;
  onsuccess: IndexedDbEventHandler = null;
  onupgradeneeded: IndexedDbEventHandler<IDBVersionChangeEvent> = null;
  private database: IndexedDbDatabase | null = null;

  get result(): IndexedDbDatabase {
    if (!this.database) throw new DOMException('Open request is pending.', 'InvalidStateError');
    return this.database;
  }

  setResult(database: IndexedDbDatabase): void {
    this.database = database;
  }
}

class FakeIndexedDbFactory implements IndexedDbFactory {
  state: DatabaseState = { name: '', version: 0, stores: new Map() };
  nextOutcome: Outcome = 'complete';
  readonly events: string[] = [];
  entryUpgradeOperations = 0;
  openConnectionCount = 0;
  upgradeCount = 0;
  deleteDatabase = vi.fn();

  open = (name: string, targetVersion = 1): IndexedDbOpenRequest => {
    const request = new FakeOpenRequest();
    queueMicrotask(() => {
      if (this.state.version > targetVersion) {
        request.error = new DOMException('Future version.', 'VersionError');
        request.onerror?.(new Event('error'));
        return;
      }
      const oldVersion = this.state.version;
      const working = oldVersion < targetVersion ? cloneState(this.state) : this.state;
      if (oldVersion < targetVersion) {
        working.name = name;
        working.version = targetVersion;
      }
      const database = new FakeDatabase(this, working);
      request.setResult(database);
      if (oldVersion < targetVersion) {
        this.upgradeCount += 1;
        const upgrade = new FakeTransaction(
          this,
          working,
          'versionchange',
          'complete',
          true,
          () => {
            this.state = working;
          },
          () => {
            database.upgradeTransaction = null;
            request.onsuccess?.(new Event('success'));
          }
        );
        database.upgradeTransaction = upgrade;
        request.transaction = upgrade;
        request.onupgradeneeded?.(versionEvent(oldVersion, targetVersion));
        upgrade.touch();
      } else {
        request.onsuccess?.(new Event('success'));
      }
    });
    return request;
  };

  seedV1(entry: VideoScreenshotCacheBlobEntry): void {
    this.state = { name: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_DB_NAME, version: 1, stores: new Map() };
    const entries = createEntryStore();
    entries.records.set(entry.key, entry);
    this.state.stores.set(VIDEO_SCREENSHOT_CACHE_BLOB_STORE_OBJECT_STORE_NAME, entries);
  }

  seedFutureVersion(): void {
    this.state = { name: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_DB_NAME, version: 3, stores: new Map() };
  }

  removeMetadataStore(): void {
    this.state.stores.delete(VIDEO_SCREENSHOT_CACHE_BLOB_STORE_METADATA_OBJECT_STORE_NAME);
  }

  failNextTransaction(outcome: Exclude<Outcome, 'complete'>): void {
    this.nextOutcome = outcome;
  }

  getRaw(storeName: string, key: string): RuntimePropertyValue {
    return this.state.stores.get(storeName)?.records.get(key);
  }

  snapshotSchema() {
    return {
      name: this.state.name,
      version: this.state.version,
      stores: [...this.state.stores]
        .map(([name, store]) => ({
          name,
          keyPath: store.keyPath,
          autoIncrement: store.autoIncrement,
          indexes: [...store.indexes]
            .map(([indexName, value]) => ({ name: indexName, ...value }))
            .sort((left, right) => left.name.localeCompare(right.name))
        }))
        .sort((left, right) => left.name.localeCompare(right.name))
    };
  }
}

class FakeDatabase implements IndexedDbDatabase {
  onversionchange: IndexedDbEventHandler = null;
  upgradeTransaction: FakeTransaction | null = null;
  private closed = false;
  private validationPending = true;

  constructor(
    private readonly factory: FakeIndexedDbFactory,
    private readonly state: DatabaseState
  ) {
    factory.openConnectionCount += 1;
  }

  get name(): string {
    return this.state.name;
  }

  get version(): number {
    return this.state.version;
  }

  get objectStoreNames(): IndexedDbNameList {
    return nameList([...this.state.stores.keys()]);
  }

  createObjectStore(name: string, options?: IDBObjectStoreParameters): IndexedDbObjectStore {
    if (!this.upgradeTransaction || this.state.stores.has(name)) {
      throw new DOMException('Invalid object store creation.', 'InvalidStateError');
    }
    const store: StoreState = {
      keyPath: normalizeKeyPath(options?.keyPath ?? null),
      autoIncrement: options?.autoIncrement ?? false,
      indexes: new Map(),
      records: new Map()
    };
    this.state.stores.set(name, store);
    return new FakeObjectStore(this.factory, name, store, this.upgradeTransaction);
  }

  transaction(
    names: string | string[],
    mode: IDBTransactionMode = 'readonly'
  ): IndexedDbTransaction {
    if (this.closed) throw new DOMException('Database is closed.', 'InvalidStateError');
    const storeNames = typeof names === 'string' ? [names] : [...names];
    for (const name of storeNames) {
      if (!this.state.stores.has(name))
        throw new DOMException(`Missing store ${name}.`, 'NotFoundError');
    }
    this.factory.events.push(`transaction:start:${mode}:${storeNames.join('+')}`);
    const outcome = this.validationPending ? 'complete' : this.factory.nextOutcome;
    if (this.validationPending) this.validationPending = false;
    else this.factory.nextOutcome = 'complete';
    const transaction = new FakeTransaction(this.factory, this.state, mode, outcome);
    transaction.touch();
    return transaction;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.factory.openConnectionCount -= 1;
    this.factory.events.push('connection:close');
  }
}

class FakeTransaction implements IndexedDbTransaction {
  error: DOMException | null = null;
  oncomplete: IndexedDbEventHandler = null;
  onerror: IndexedDbEventHandler = null;
  onabort: IndexedDbEventHandler = null;
  private readonly staged: Map<string, StoreState>;
  private scheduled = false;
  private finished = false;

  constructor(
    private readonly factory: FakeIndexedDbFactory,
    private readonly state: DatabaseState,
    readonly mode: IDBTransactionMode,
    private readonly outcome: Outcome,
    private readonly upgrade = false,
    private readonly commitUpgrade?: () => void,
    private readonly afterComplete?: () => void
  ) {
    this.staged = new Map([...state.stores].map(([name, store]) => [name, cloneStore(store)]));
  }

  objectStore(name: string): IndexedDbObjectStore {
    const store = this.upgrade ? this.state.stores.get(name) : this.staged.get(name);
    if (!store) throw new DOMException(`Missing store ${name}.`, 'NotFoundError');
    return new FakeObjectStore(this.factory, name, store, this);
  }

  touch(): void {
    if (this.scheduled || this.finished) return;
    this.scheduled = true;
    setTimeout(() => this.settle(), 0);
  }

  abort(): void {
    if (this.finished) return;
    this.finished = true;
    this.error ??= new DOMException('Transaction aborted.', 'AbortError');
    this.factory.events.push('transaction:abort');
    this.onabort?.(new Event('abort'));
  }

  private settle(): void {
    if (this.finished) return;
    if (this.outcome === 'error') {
      this.error = new DOMException('Transaction failed.', 'UnknownError');
      this.factory.events.push('transaction:error');
      this.onerror?.(new Event('error'));
      queueMicrotask(() => this.abort());
      return;
    }
    if (this.outcome === 'abort') {
      this.abort();
      return;
    }
    this.finished = true;
    if (this.upgrade) this.commitUpgrade?.();
    else if (this.mode === 'readwrite') this.state.stores = this.staged;
    this.factory.events.push('transaction:complete');
    this.oncomplete?.(new Event('complete'));
    this.afterComplete?.();
  }
}

class FakeObjectStore implements IndexedDbObjectStore {
  constructor(
    private readonly factory: FakeIndexedDbFactory,
    readonly name: string,
    private readonly state: StoreState,
    private readonly transaction: FakeTransaction
  ) {}

  get indexNames(): IndexedDbNameList {
    return nameList([...this.state.indexes.keys()]);
  }

  get keyPath(): string | string[] | null {
    return this.state.keyPath;
  }

  get autoIncrement(): boolean {
    return this.state.autoIncrement;
  }

  createIndex(
    name: string,
    keyPath: string | string[],
    options?: IDBIndexParameters
  ): IndexedDbIndex {
    this.state.indexes.set(name, {
      keyPath: normalizeKeyPath(keyPath) ?? '',
      unique: options?.unique ?? false,
      multiEntry: options?.multiEntry ?? false
    });
    return new FakeIndex(this.factory, this.name, this.state, name, this.transaction);
  }

  index(name: string): IndexedDbIndex {
    if (!this.state.indexes.has(name))
      throw new DOMException(`Missing index ${name}.`, 'NotFoundError');
    return new FakeIndex(this.factory, this.name, this.state, name, this.transaction);
  }

  put(value: object): IndexedDbRequest<IDBValidKey> {
    const key = readKey(value, this.state.keyPath);
    this.state.records.set(key, value);
    this.factory.events.push(`store:${this.name}:put:${key}`);
    this.trackUpgradeEntryOperation();
    return request<IDBValidKey>(key, this.transaction);
  }

  get(key: IDBValidKey | IDBKeyRange): IndexedDbRequest<object | undefined> {
    this.trackUpgradeEntryOperation();
    const value = typeof key === 'string' ? this.state.records.get(key) : undefined;
    return request(isObjectRecord(value) ? value : undefined, this.transaction);
  }

  delete(key: IDBValidKey | IDBKeyRange): IndexedDbRequest<undefined> {
    if (typeof key === 'string') {
      this.state.records.delete(key);
      this.factory.events.push(`store:${this.name}:delete:${key}`);
    }
    this.trackUpgradeEntryOperation();
    return request(undefined, this.transaction);
  }

  getAll(): IndexedDbRequest<object[]> {
    this.trackUpgradeEntryOperation();
    return request([...this.state.records.values()].filter(isObjectRecord), this.transaction);
  }

  private trackUpgradeEntryOperation(): void {
    if (
      this.transaction.mode === 'versionchange' &&
      this.name === VIDEO_SCREENSHOT_CACHE_BLOB_STORE_OBJECT_STORE_NAME
    ) {
      this.factory.entryUpgradeOperations += 1;
    }
  }
}

class FakeIndex implements IndexedDbIndex {
  constructor(
    private readonly factory: FakeIndexedDbFactory,
    private readonly storeName: string,
    private readonly store: StoreState,
    readonly name: string,
    private readonly transaction: FakeTransaction
  ) {}

  get keyPath(): string | string[] {
    return this.store.indexes.get(this.name)?.keyPath ?? '';
  }

  get unique(): boolean {
    return this.store.indexes.get(this.name)?.unique ?? false;
  }

  get multiEntry(): boolean {
    return this.store.indexes.get(this.name)?.multiEntry ?? false;
  }

  getAll(query?: IDBValidKey | IDBKeyRange | null): IndexedDbRequest<object[]> {
    if (
      this.transaction.mode === 'versionchange' &&
      this.storeName === VIDEO_SCREENSHOT_CACHE_BLOB_STORE_OBJECT_STORE_NAME
    ) {
      this.factory.entryUpgradeOperations += 1;
    }
    const values = [...this.store.records.values()]
      .filter(isObjectRecord)
      .filter((value) => query == null || resolveKeyPath(value, this.keyPath) === query);
    return request(values, this.transaction);
  }
}

function request<T>(result: T, transaction: FakeTransaction): IndexedDbRequest<T> {
  const value = new FakeRequest(result);
  queueMicrotask(() => {
    value.onsuccess?.(new Event('success'));
    transaction.touch();
  });
  return value;
}

function nameList(names: readonly string[]): IndexedDbNameList {
  return {
    length: names.length,
    contains: (name) => names.includes(name),
    item: (index) => names[index] ?? null
  };
}

function versionEvent(oldVersion: number, newVersion: number | null): IDBVersionChangeEvent {
  return Object.assign(new Event('versionchange'), { oldVersion, newVersion });
}

function normalizeKeyPath(value: string | string[] | null): string | string[] | null {
  return Array.isArray(value) ? [...value] : value;
}

function readKey(value: object, keyPath: string | string[] | null): string {
  if (typeof keyPath !== 'string' || !isObjectRecord(value)) {
    throw new Error('Fake store requires a string key path.');
  }
  const key = value[keyPath];
  if (typeof key !== 'string') throw new Error('Fake store requires a string key.');
  return key;
}

function resolveKeyPath(
  value: RuntimePropertyValue,
  keyPath: string | string[]
): RuntimePropertyValue | RuntimePropertyValue[] {
  if (!isObjectRecord(value)) return undefined;
  return Array.isArray(keyPath) ? keyPath.map((part) => value[part]) : value[keyPath];
}

function createEntryStore(): StoreState {
  return {
    keyPath: 'key',
    autoIncrement: false,
    indexes: new Map([
      [
        VIDEO_SCREENSHOT_CACHE_BLOB_STORE_PAGE_KEY_INDEX_NAME,
        { keyPath: 'pageKey', unique: false, multiEntry: false }
      ],
      [
        VIDEO_SCREENSHOT_CACHE_BLOB_STORE_EXPIRES_AT_INDEX_NAME,
        { keyPath: 'expiresAt', unique: false, multiEntry: false }
      ],
      [
        VIDEO_SCREENSHOT_CACHE_BLOB_STORE_UPDATED_AT_INDEX_NAME,
        { keyPath: 'updatedAt', unique: false, multiEntry: false }
      ],
      [
        VIDEO_SCREENSHOT_CACHE_BLOB_STORE_PAGE_CAPTURE_INDEX_NAME,
        { keyPath: ['pageKey', 'captureId'], unique: false, multiEntry: false }
      ]
    ]),
    records: new Map()
  };
}

function createMetadata(
  overrides: Partial<VideoScreenshotCacheBlobMetadata> = {}
): VideoScreenshotCacheBlobMetadata {
  const pageKey = overrides.pageKey ?? 'page-a';
  const captureId = overrides.captureId ?? 'capture-a';
  const id = overrides.id ?? 'shot-a';
  const capturedAt = overrides.capturedAt ?? BASE_TIME;
  const createdAt = overrides.createdAt ?? capturedAt + 10;
  const updatedAt = overrides.updatedAt ?? createdAt + 10;
  const expiresAt = overrides.expiresAt ?? updatedAt + 10_000;
  return {
    schemaVersion: 1,
    key:
      overrides.key ??
      createVideoScreenshotCacheStorageKey({ pageKey, captureId, screenshotId: id }),
    pageKey,
    captureId,
    id,
    fileName: overrides.fileName ?? `${id}.jpg`,
    mimeType: overrides.mimeType ?? 'image/jpeg',
    byteLength: overrides.byteLength ?? 8,
    capturedAt,
    createdAt,
    updatedAt,
    expiresAt
  };
}

function createEntry(
  overrides: Partial<VideoScreenshotCacheBlobMetadata> = {},
  bytes = new Uint8Array([0, 255, 1, 128, 127, 13, 10, 66])
): VideoScreenshotCacheBlobEntry {
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  return { ...createMetadata({ ...overrides, byteLength: blob.size }), blob };
}

async function blobBytes(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())];
}

function requireStore(factory: FakeIndexedDbFactory, name: string): StoreState {
  const store = factory.state.stores.get(name);
  if (!store) throw new Error(`Expected store: ${name}`);
  return store;
}

function requireIndex(store: StoreState, name: string) {
  const index = store.indexes.get(name);
  if (!index) throw new Error(`Expected index: ${name}`);
  return index;
}

describe('videoScreenshotCacheIndexedDbStore', () => {
  it('creates the exact v2 schema and maintenance record', async () => {
    const indexedDb = new FakeIndexedDbFactory();
    const store = createVideoScreenshotCacheIndexedDbStore({ indexedDb });
    const entry = createEntry();

    await store.put(entry);

    expect(indexedDb.snapshotSchema()).toEqual({
      name: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_DB_NAME,
      version: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_DB_VERSION,
      stores: [
        {
          name: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_OBJECT_STORE_NAME,
          keyPath: 'key',
          autoIncrement: false,
          indexes: [
            {
              name: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_EXPIRES_AT_INDEX_NAME,
              keyPath: 'expiresAt',
              unique: false,
              multiEntry: false
            },
            {
              name: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_PAGE_CAPTURE_INDEX_NAME,
              keyPath: ['pageKey', 'captureId'],
              unique: false,
              multiEntry: false
            },
            {
              name: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_PAGE_KEY_INDEX_NAME,
              keyPath: 'pageKey',
              unique: false,
              multiEntry: false
            },
            {
              name: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_UPDATED_AT_INDEX_NAME,
              keyPath: 'updatedAt',
              unique: false,
              multiEntry: false
            }
          ]
        },
        {
          name: VIDEO_SCREENSHOT_CACHE_BLOB_STORE_METADATA_OBJECT_STORE_NAME,
          keyPath: 'id',
          autoIncrement: false,
          indexes: []
        }
      ]
    });
    expect(
      indexedDb.getRaw(
        VIDEO_SCREENSHOT_CACHE_BLOB_STORE_METADATA_OBJECT_STORE_NAME,
        VIDEO_SCREENSHOT_CACHE_BLOB_STORE_MAINTENANCE_ID
      )
    ).toEqual({ id: 'maintenance', schemaVersion: 2, lastPrunedAt: null });
    expect(indexedDb.openConnectionCount).toBe(0);
  });

  it('upgrades a populated v1 database without touching the entry or Blob bytes', async () => {
    const indexedDb = new FakeIndexedDbFactory();
    const entry = createEntry();
    indexedDb.seedV1(entry);
    const store = createVideoScreenshotCacheIndexedDbStore({ indexedDb });

    const loaded = await store.get(entry.key);

    expect(indexedDb.state.version).toBe(2);
    expect(indexedDb.entryUpgradeOperations).toBe(0);
    expect(loaded).toMatchObject(createMetadata());
    await expect(blobBytes(loaded?.blob ?? new Blob())).resolves.toEqual(
      await blobBytes(entry.blob)
    );
    expect(indexedDb.upgradeCount).toBe(1);
    await store.get(entry.key);
    expect(indexedDb.upgradeCount).toBe(1);
    expect(indexedDb.deleteDatabase).not.toHaveBeenCalled();
  });

  it('supports committed CRUD and lists page entries newest first', async () => {
    const indexedDb = new FakeIndexedDbFactory();
    const store = createVideoScreenshotCacheIndexedDbStore({ indexedDb });
    const older = createEntry({ id: 'older', updatedAt: BASE_TIME + 30 }, new Uint8Array([1, 2]));
    const newer = createEntry(
      { id: 'newer', captureId: 'capture-b', updatedAt: BASE_TIME + 60 },
      new Uint8Array([3, 4, 5])
    );
    const otherPage = createEntry(
      { pageKey: 'page-b', id: 'other', captureId: 'capture-c', updatedAt: BASE_TIME + 90 },
      new Uint8Array([6])
    );

    await store.put(older);
    await store.put(newer);
    await store.put(otherPage);

    const loaded = await store.get(newer.key);
    expect(loaded).toMatchObject(
      createMetadata({
        id: 'newer',
        captureId: 'capture-b',
        updatedAt: BASE_TIME + 60,
        byteLength: 3
      })
    );
    await expect(blobBytes(loaded?.blob ?? new Blob())).resolves.toEqual([3, 4, 5]);
    expect((await store.listByPageKey('page-a')).map(({ key }) => key)).toEqual([
      newer.key,
      older.key
    ]);

    await store.delete(older.key);
    await store.deleteMany([otherPage.key, otherPage.key]);
    expect((await store.listAllMetadata()).map(({ key }) => key)).toEqual([newer.key]);
  });

  it('prunes expired, page-overflow, and global-overflow rows', async () => {
    const indexedDb = new FakeIndexedDbFactory();
    const store = createVideoScreenshotCacheIndexedDbStore({ indexedDb });
    const keepNewest = createEntry({
      id: 'new',
      captureId: 'capture-new',
      updatedAt: BASE_TIME + 220,
      expiresAt: BASE_TIME + 20_000
    });
    const pageOverflow = createEntry({
      id: 'old',
      captureId: 'capture-old',
      updatedAt: BASE_TIME + 140,
      expiresAt: BASE_TIME + 20_000
    });
    const keepGlobal = createEntry({
      pageKey: 'page-b',
      id: 'global',
      captureId: 'capture-global',
      updatedAt: BASE_TIME + 200,
      expiresAt: BASE_TIME + 20_000
    });
    const expired = createEntry({
      pageKey: 'page-c',
      id: 'expired',
      captureId: 'capture-expired',
      updatedAt: BASE_TIME + 40,
      expiresAt: BASE_TIME + 50
    });
    for (const entry of [pageOverflow, expired, keepNewest, keepGlobal]) await store.put(entry);

    const result = await store.prune({
      now: BASE_TIME + 100,
      maxGlobalEntries: 2,
      maxPageEntries: 1,
      applyLimits: true
    });

    expect(result.entries.map(({ key }) => key)).toEqual([keepNewest.key, keepGlobal.key]);
    expect(new Set(result.removedKeys)).toEqual(new Set([expired.key, pageOverflow.key]));
    expect(indexedDb.getRaw('entries', expired.key)).toBeUndefined();
    expect(indexedDb.getRaw('entries', pageOverflow.key)).toBeUndefined();
  });

  it('treats a corrupt row as missing and commits its deletion', async () => {
    const indexedDb = new FakeIndexedDbFactory();
    const store = createVideoScreenshotCacheIndexedDbStore({ indexedDb });
    const corrupt = createEntry({ id: 'corrupt', captureId: 'capture-corrupt' });
    await store.put(corrupt);
    const entries = indexedDb.state.stores.get('entries');
    if (!entries) throw new Error('Expected entries store.');
    entries.records.set(corrupt.key, { ...corrupt, byteLength: corrupt.byteLength + 1 });

    await expect(store.get(corrupt.key)).resolves.toBeNull();
    expect(indexedDb.getRaw('entries', corrupt.key)).toBeUndefined();
  });

  it('aborts a v1 upgrade when an existing index descriptor is wrong', async () => {
    const indexedDb = new FakeIndexedDbFactory();
    const entry = createEntry();
    indexedDb.seedV1(entry);
    const pageIndex = indexedDb.state.stores
      .get(VIDEO_SCREENSHOT_CACHE_BLOB_STORE_OBJECT_STORE_NAME)
      ?.indexes.get(VIDEO_SCREENSHOT_CACHE_BLOB_STORE_PAGE_KEY_INDEX_NAME);
    if (!pageIndex) throw new Error('Expected seeded page index.');
    pageIndex.unique = true;

    await expect(
      createVideoScreenshotCacheIndexedDbStore({ indexedDb }).get(entry.key)
    ).rejects.toMatchObject({ code: 'SCHEMA_MISMATCH' });
    expect(indexedDb.state.version).toBe(1);
    expect(
      indexedDb.state.stores.has(VIDEO_SCREENSHOT_CACHE_BLOB_STORE_METADATA_OBJECT_STORE_NAME)
    ).toBe(false);
  });

  it('updates prune metadata in the same transaction and rolls both stores back on abort', async () => {
    const indexedDb = new FakeIndexedDbFactory();
    const expired = createEntry({ expiresAt: BASE_TIME + 50 });
    const keep = createEntry({ id: 'keep', captureId: 'keep', expiresAt: BASE_TIME + 50_000 });
    const store = createVideoScreenshotCacheIndexedDbStore({ indexedDb });
    await store.put(expired);
    await store.put(keep);
    const eventOffset = indexedDb.events.length;

    const result = await store.prune({
      now: BASE_TIME + 100,
      maxGlobalEntries: 10,
      maxPageEntries: 10,
      applyLimits: false
    });
    expect(result.removedKeys).toEqual([expired.key]);
    expect(indexedDb.events.slice(eventOffset)).toEqual([
      'transaction:start:readonly:entries+metadata',
      'transaction:complete',
      'transaction:start:readwrite:entries+metadata',
      `store:entries:delete:${expired.key}`,
      'store:metadata:put:maintenance',
      'transaction:complete',
      'connection:close'
    ]);
    expect(indexedDb.getRaw('metadata', 'maintenance')).toEqual({
      id: 'maintenance',
      schemaVersion: 2,
      lastPrunedAt: BASE_TIME + 100
    });

    indexedDb.failNextTransaction('abort');
    await expect(
      store.prune({
        now: BASE_TIME + 200,
        maxGlobalEntries: 0,
        maxPageEntries: 0,
        applyLimits: true
      })
    ).rejects.toMatchObject({ code: 'TRANSACTION_ABORTED' });
    expect(indexedDb.getRaw('entries', keep.key)).toBeDefined();
    expect(indexedDb.getRaw('metadata', 'maintenance')).toMatchObject({
      lastPrunedAt: BASE_TIME + 100
    });
    expect(indexedDb.openConnectionCount).toBe(0);
  });

  it('updates lastPrunedAt even when no rows are removed', async () => {
    const indexedDb = new FakeIndexedDbFactory();
    const store = createVideoScreenshotCacheIndexedDbStore({ indexedDb });
    await store.prune({
      now: BASE_TIME + 500,
      maxGlobalEntries: 10,
      maxPageEntries: 10,
      applyLimits: false
    });
    expect(indexedDb.getRaw('metadata', 'maintenance')).toMatchObject({
      lastPrunedAt: BASE_TIME + 500
    });
  });

  it('settles transaction error then abort once without committing prune changes', async () => {
    const indexedDb = new FakeIndexedDbFactory();
    const entry = createEntry({ expiresAt: BASE_TIME + 50 });
    const store = createVideoScreenshotCacheIndexedDbStore({ indexedDb });
    await store.put(entry);
    indexedDb.failNextTransaction('error');
    const settled = vi.fn();
    const prune = store.prune({
      now: BASE_TIME + 100,
      maxGlobalEntries: 10,
      maxPageEntries: 10,
      applyLimits: false
    });
    void prune.then(settled, settled);

    await expect(prune).rejects.toMatchObject({ code: 'TRANSACTION_FAILED' });
    expect(settled).toHaveBeenCalledTimes(1);
    expect(indexedDb.getRaw('entries', entry.key)).toBeDefined();
    expect(indexedDb.getRaw('metadata', 'maintenance')).toMatchObject({ lastPrunedAt: null });
  });

  const schemaMutations: Array<{
    name: string;
    mutate: (factory: FakeIndexedDbFactory) => void;
  }> = [
    {
      name: 'missing entries store',
      mutate: (factory) => {
        factory.state.stores.delete('entries');
      }
    },
    {
      name: 'wrong entries key path',
      mutate: (factory) => {
        requireStore(factory, 'entries').keyPath = 'other';
      }
    },
    {
      name: 'missing required index',
      mutate: (factory) => {
        requireStore(factory, 'entries').indexes.delete(
          VIDEO_SCREENSHOT_CACHE_BLOB_STORE_PAGE_KEY_INDEX_NAME
        );
      }
    },
    {
      name: 'wrong index key path',
      mutate: (factory) => {
        requireIndex(
          requireStore(factory, 'entries'),
          VIDEO_SCREENSHOT_CACHE_BLOB_STORE_PAGE_KEY_INDEX_NAME
        ).keyPath = 'other';
      }
    },
    {
      name: 'wrong metadata key path',
      mutate: (factory) => {
        requireStore(factory, 'metadata').keyPath = 'other';
      }
    }
  ];

  it.each(schemaMutations)(
    'rejects $name without repairing or resetting v2',
    async ({ mutate }) => {
      const indexedDb = new FakeIndexedDbFactory();
      const store = createVideoScreenshotCacheIndexedDbStore({ indexedDb });
      await store.put(createEntry());
      mutate(indexedDb);
      const malformedSchema = indexedDb.snapshotSchema();

      await expect(store.listAllMetadata()).rejects.toMatchObject({ code: 'SCHEMA_MISMATCH' });
      expect(indexedDb.snapshotSchema()).toEqual(malformedSchema);
      expect(indexedDb.state.version).toBe(2);
      expect(indexedDb.deleteDatabase).not.toHaveBeenCalled();
      expect(indexedDb.openConnectionCount).toBe(0);
    }
  );

  it.each([
    { name: 'an absent maintenance record', records: [] },
    {
      name: 'the wrong metadata schema version',
      records: [{ id: 'maintenance', schemaVersion: 1, lastPrunedAt: null }]
    },
    {
      name: 'a negative prune timestamp',
      records: [{ id: 'maintenance', schemaVersion: 2, lastPrunedAt: -1 }]
    },
    {
      name: 'a fractional prune timestamp',
      records: [{ id: 'maintenance', schemaVersion: 2, lastPrunedAt: 1.5 }]
    },
    {
      name: 'an additional metadata record',
      records: [
        { id: 'maintenance', schemaVersion: 2, lastPrunedAt: null },
        { id: 'extra', schemaVersion: 2, lastPrunedAt: null }
      ]
    }
  ])('rejects $name without repairing metadata', async ({ records }) => {
    const indexedDb = new FakeIndexedDbFactory();
    const store = createVideoScreenshotCacheIndexedDbStore({ indexedDb });
    await store.put(createEntry());
    const metadata = indexedDb.state.stores.get('metadata');
    if (!metadata) throw new Error('Expected metadata store.');
    metadata.records = new Map(records.map((record) => [record.id, record]));

    await expect(store.listAllMetadata()).rejects.toMatchObject({ code: 'SCHEMA_MISMATCH' });
    expect([...metadata.records.values()]).toEqual(records);
    expect(indexedDb.state.version).toBe(2);
    expect(indexedDb.deleteDatabase).not.toHaveBeenCalled();
    expect(indexedDb.openConnectionCount).toBe(0);
  });

  it('rejects malformed target and future versions without repair or reset', async () => {
    const malformed = new FakeIndexedDbFactory();
    const malformedStore = createVideoScreenshotCacheIndexedDbStore({ indexedDb: malformed });
    await malformedStore.put(createEntry());
    malformed.removeMetadataStore();
    await expect(malformedStore.get(createEntry().key)).rejects.toMatchObject({
      code: 'SCHEMA_MISMATCH'
    });
    expect(malformed.state.stores.has('metadata')).toBe(false);

    const future = new FakeIndexedDbFactory();
    future.seedFutureVersion();
    await expect(
      createVideoScreenshotCacheIndexedDbStore({ indexedDb: future }).listAllMetadata()
    ).rejects.toMatchObject({ code: 'VERSION_MISMATCH' });
    expect(future.state.version).toBe(3);
    expect(future.deleteDatabase).not.toHaveBeenCalled();
  });
});
