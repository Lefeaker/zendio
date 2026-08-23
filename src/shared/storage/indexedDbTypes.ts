export type IndexedDbLifecycleErrorCode =
  | 'BLOCKED_TIMEOUT'
  | 'OPEN_FAILED'
  | 'REQUEST_FAILED'
  | 'SCHEMA_MISMATCH'
  | 'TRANSACTION_ABORTED'
  | 'TRANSACTION_FAILED'
  | 'UPGRADE_FAILED'
  | 'VERSION_MISMATCH';
export type IndexedDbKeyPath = string | readonly string[] | null;
type NativeIndexedDbKeyPath = string | string[];

export class IndexedDbLifecycleError extends Error {
  readonly cause: unknown;

  constructor(
    readonly code: IndexedDbLifecycleErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = 'IndexedDbLifecycleError';
    this.cause = options?.cause;
  }
}

export type IndexedDbEventHandler<E extends Event = Event> =
  | { bivarianceHack(event: E): void }['bivarianceHack']
  | null;

export interface IndexedDbNameList {
  readonly length: number;
  contains(name: string): boolean;
  item(index: number): string | null;
}
export interface IndexedDbRequest<T> {
  readonly result: T;
  readonly error: DOMException | null;
  onsuccess: IndexedDbEventHandler;
  onerror: IndexedDbEventHandler;
}
export interface IndexedDbIndex {
  readonly keyPath: NativeIndexedDbKeyPath;
  readonly unique: boolean;
  readonly multiEntry: boolean;
  getAll(query?: IDBValidKey | IDBKeyRange | null): IndexedDbRequest<object[]>;
}
export interface IndexedDbObjectStore {
  readonly keyPath: string | string[] | null;
  readonly autoIncrement: boolean;
  readonly indexNames: IndexedDbNameList;
  createIndex(
    name: string,
    keyPath: NativeIndexedDbKeyPath,
    options?: IDBIndexParameters
  ): IndexedDbIndex;
  index(name: string): IndexedDbIndex;
  put(value: object): IndexedDbRequest<IDBValidKey>;
  get(query: IDBValidKey | IDBKeyRange): IndexedDbRequest<object | undefined>;
  delete(query: IDBValidKey | IDBKeyRange): IndexedDbRequest<undefined>;
  getAll(): IndexedDbRequest<object[]>;
}

export interface IndexedDbTransaction {
  readonly error: DOMException | null;
  oncomplete: IndexedDbEventHandler;
  onerror: IndexedDbEventHandler;
  onabort: IndexedDbEventHandler;
  objectStore(name: string): IndexedDbObjectStore;
  abort(): void;
}

export interface IndexedDbDatabase {
  readonly name: string;
  readonly version: number;
  readonly objectStoreNames: IndexedDbNameList;
  onversionchange: IndexedDbEventHandler;
  createObjectStore(name: string, options?: IDBObjectStoreParameters): IndexedDbObjectStore;
  transaction(storeNames: string | string[], mode?: IDBTransactionMode): IndexedDbTransaction;
  close(): void;
}
export interface IndexedDbOpenRequest extends IndexedDbRequest<IndexedDbDatabase> {
  readonly transaction: IndexedDbTransaction | null;
  onblocked: IndexedDbEventHandler<IDBVersionChangeEvent>;
  onupgradeneeded: IndexedDbEventHandler<IDBVersionChangeEvent>;
}
export interface IndexedDbFactory {
  open(name: string, version?: number): IndexedDbOpenRequest;
}

export interface IndexedDbMigrationContext {
  oldVersion: number;
  targetVersion: number;
  database: IndexedDbDatabase;
  transaction: IndexedDbTransaction;
}

export interface IndexedDbMigration {
  fromVersion: number;
  toVersion: number;
  migrate(context: IndexedDbMigrationContext): void;
}

export interface IndexedDbTimer {
  schedule(callback: () => void, delayMs: number): () => void;
}

export interface OpenIndexedDbOptions {
  name: string;
  version: number;
  migrations: readonly IndexedDbMigration[];
  validate?: ((database: IndexedDbDatabase) => Promise<void> | void) | undefined;
  indexedDb?: IndexedDbFactory | undefined;
  timer?: IndexedDbTimer | undefined;
}

export interface IndexedDbObjectStoreSchema {
  name: string;
  keyPath: IndexedDbKeyPath;
  autoIncrement: boolean;
}

export interface IndexedDbIndexSchema {
  name: string;
  keyPath: string | readonly string[];
  unique: boolean;
  multiEntry: boolean;
}

export type IndexedDbStoreNames = string | readonly string[];
export type IndexedDbTransactionOperation<T> = (
  transaction: IndexedDbTransaction
) => Promise<T> | T;

export function ensureIndexedDbObjectStore(
  database: IndexedDbDatabase,
  transaction: IndexedDbTransaction,
  schema: IndexedDbObjectStoreSchema
): IndexedDbObjectStore {
  const store = database.objectStoreNames.contains(schema.name)
    ? transaction.objectStore(schema.name)
    : database.createObjectStore(schema.name, {
        keyPath: toNativeKeyPath(schema.keyPath),
        autoIncrement: schema.autoIncrement
      });
  assertStoreDescriptor(store, schema);
  return store;
}

export function assertIndexedDbObjectStore(
  transaction: IndexedDbTransaction,
  schema: IndexedDbObjectStoreSchema
): IndexedDbObjectStore {
  const store = readSchemaMember(
    () => transaction.objectStore(schema.name),
    `object store "${schema.name}"`
  );
  assertStoreDescriptor(store, schema);
  return store;
}

export function ensureIndexedDbIndex(
  store: IndexedDbObjectStore,
  schema: IndexedDbIndexSchema
): IndexedDbIndex {
  const index = store.indexNames.contains(schema.name)
    ? store.index(schema.name)
    : store.createIndex(schema.name, toNativeIndexKeyPath(schema.keyPath), {
        unique: schema.unique,
        multiEntry: schema.multiEntry
      });
  assertIndexDescriptor(index, schema);
  return index;
}

export function assertIndexedDbIndex(
  store: IndexedDbObjectStore,
  schema: IndexedDbIndexSchema
): IndexedDbIndex {
  const index = readSchemaMember(() => store.index(schema.name), `index "${schema.name}"`);
  assertIndexDescriptor(index, schema);
  return index;
}

export function assertIndexedDbNameList(
  names: IndexedDbNameList,
  expected: readonly string[],
  label: string
): void {
  const actual = Array.from({ length: names.length }, (_, index) => names.item(index) ?? '').sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((name, index) => name !== wanted[index])) {
    throw new IndexedDbLifecycleError('SCHEMA_MISMATCH', `${label} names differ.`);
  }
}

export function toIndexedDbLifecycleError(
  code: IndexedDbLifecycleErrorCode,
  message: string,
  cause: unknown
): IndexedDbLifecycleError {
  return cause instanceof IndexedDbLifecycleError
    ? cause
    : new IndexedDbLifecycleError(code, message, { cause });
}

function assertStoreDescriptor(
  store: IndexedDbObjectStore,
  schema: IndexedDbObjectStoreSchema
): void {
  assertKeyPath(store.keyPath, schema.keyPath, `object store "${schema.name}"`);
  if (store.autoIncrement !== schema.autoIncrement) {
    throw new IndexedDbLifecycleError(
      'SCHEMA_MISMATCH',
      `Object store "${schema.name}" autoIncrement differs.`
    );
  }
}

function assertIndexDescriptor(index: IndexedDbIndex, schema: IndexedDbIndexSchema): void {
  assertKeyPath(index.keyPath, schema.keyPath, `index "${schema.name}"`);
  if (index.unique !== schema.unique || index.multiEntry !== schema.multiEntry) {
    throw new IndexedDbLifecycleError('SCHEMA_MISMATCH', `Index "${schema.name}" options differ.`);
  }
}

function assertKeyPath(actual: IndexedDbKeyPath, expected: IndexedDbKeyPath, label: string): void {
  const same =
    Array.isArray(actual) && Array.isArray(expected)
      ? actual.length === expected.length && actual.every((part, index) => part === expected[index])
      : actual === expected;
  if (!same) throw new IndexedDbLifecycleError('SCHEMA_MISMATCH', `${label} keyPath differs.`);
}

function readSchemaMember<T>(read: () => T, label: string): T {
  try {
    return read();
  } catch (error) {
    throw toIndexedDbLifecycleError('SCHEMA_MISMATCH', `Missing ${label}.`, error);
  }
}

function toNativeKeyPath(value: string | readonly string[] | null): string | string[] | null {
  return typeof value === 'string' || value === null ? value : [...value];
}

function toNativeIndexKeyPath(value: string | readonly string[]): NativeIndexedDbKeyPath {
  return typeof value === 'string' ? value : [...value];
}
