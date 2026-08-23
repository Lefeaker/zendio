import type { StoredDirectoryHandle } from '../platform/chrome/localVaultCore';
import type {
  IndexedDbDatabase,
  IndexedDbEventHandler,
  IndexedDbFactory,
  IndexedDbNameList,
  IndexedDbObjectStore,
  IndexedDbRequest,
  IndexedDbTransaction
} from '../shared/storage/indexedDbTypes';

export type LocalVaultTransactionOutcome = 'complete' | 'error' | 'abort';
export type LocalVaultIndexedDbHarnessController = Pick<
  Harness,
  'setNextTransactionOutcome' | 'dispatchVersionChange' | 'snapshot' | 'dispose'
>;
const DB_NAME = 'ai2ob-local-vault-folders';
const STORE_NAME = 'folders';
const SCHEMA_ERROR = 'Local Vault schema mismatch.';
let activeHarness: Harness | null = null;
class FakeRequest<T> implements IndexedDbRequest<T> {
  error: DOMException | null = null;
  onsuccess: IndexedDbEventHandler = null;
  onerror: IndexedDbEventHandler = null;
  transaction: IndexedDbTransaction | null = null;
  onblocked: IndexedDbEventHandler<IDBVersionChangeEvent> = null;
  onupgradeneeded: IndexedDbEventHandler<IDBVersionChangeEvent> = null;
  constructor(readonly result: T) {}
}

class FakeTransaction implements IndexedDbTransaction, IndexedDbObjectStore {
  error: DOMException | null = null;
  oncomplete: IndexedDbEventHandler = null;
  onerror: IndexedDbEventHandler = null;
  onabort: IndexedDbEventHandler = null;
  readonly keyPath = 'id';
  readonly autoIncrement = false;
  readonly indexNames = createNameList();
  createIndex = unsupportedStoreOperation;
  index = unsupportedStoreOperation;
  getAll = unsupportedStoreOperation;
  readonly staged: Map<string, StoredDirectoryHandle>;
  hasStore: boolean;
  private finished = false;
  constructor(
    private readonly harness: Harness,
    readonly mode: IDBTransactionMode,
    private readonly outcome: LocalVaultTransactionOutcome,
    private readonly afterComplete?: () => void
  ) {
    this.staged = new Map(harness.records);
    this.hasStore = harness.hasStore;
    setTimeout(() => this.settle(), 0);
  }
  objectStore(name: string): IndexedDbObjectStore {
    if (name !== STORE_NAME || !this.hasStore) throw new Error(`Unknown object store: ${name}`);
    return this;
  }
  request<T>(label: string, result: T): IndexedDbRequest<T> {
    const request = new FakeRequest(result);
    queueMicrotask(() => {
      this.harness.events.push(`request:success:${label}`);
      request.onsuccess?.(new Event('success'));
    });
    return request;
  }
  put(value: object): IndexedDbRequest<IDBValidKey> {
    if (!isStoredDirectoryHandle(value)) throw new Error('Invalid Local Vault record.');
    this.staged.set(value.id, value);
    return this.request(`put:${value.id}`, value.id);
  }
  get(id: IDBValidKey): IndexedDbRequest<object | undefined> {
    const value = typeof id === 'string' ? this.staged.get(id) : undefined;
    return this.request(`get:${String(id)}`, value);
  }
  delete(id: IDBValidKey): IndexedDbRequest<undefined> {
    if (typeof id === 'string') this.staged.delete(id);
    return this.request(`delete:${String(id)}`, undefined);
  }
  abort(): void {
    if (this.finished) return;
    this.finished = true;
    this.error ??= new DOMException('Transaction aborted.', 'AbortError');
    this.harness.events.push(this.afterComplete ? 'upgrade:abort' : 'tx:abort');
    this.onabort?.(new Event('abort'));
  }
  private settle(): void {
    if (this.finished) return;
    if (this.outcome === 'error') {
      this.error = new DOMException('Transaction failed.', 'UnknownError');
      this.harness.events.push('tx:error');
      this.onerror?.(new Event('error'));
      queueMicrotask(() => this.abort());
      return;
    }
    if (this.outcome === 'abort') return this.abort();
    this.finished = true;
    this.harness.records = new Map(this.staged);
    this.harness.hasStore = this.hasStore;
    if (!this.afterComplete && this.mode === 'readwrite') this.harness.events.push('tx:commit');
    this.harness.events.push(this.afterComplete ? 'upgrade:complete' : 'tx:complete');
    this.oncomplete?.(new Event('complete'));
    this.afterComplete?.();
  }
}

class FakeDatabase implements IndexedDbDatabase {
  readonly name = DB_NAME;
  readonly version = 1;
  onversionchange: IndexedDbEventHandler = null;
  upgradeTransaction: FakeTransaction | null = null;
  private validationPending = true;
  constructor(private readonly harness: Harness) {
    harness.connections.add(this);
  }
  get objectStoreNames(): IndexedDbNameList {
    return createNameList(this.harness.hasStore || this.upgradeTransaction?.hasStore);
  }
  createObjectStore(name: string, options?: IDBObjectStoreParameters): IndexedDbObjectStore {
    if (!this.upgradeTransaction || name !== STORE_NAME) throw new Error(SCHEMA_ERROR);
    if (options?.keyPath !== 'id' || options.autoIncrement === true) throw new Error(SCHEMA_ERROR);
    this.upgradeTransaction.hasStore = true;
    this.harness.events.push('store:create:folders:keyPath=id:autoIncrement=false');
    return this.upgradeTransaction;
  }
  transaction(names: string | string[], mode: IDBTransactionMode = 'readonly') {
    if (!this.harness.connections.has(this)) {
      throw new DOMException('Database is closed.', 'InvalidStateError');
    }
    const requested = typeof names === 'string' ? [names] : names;
    if (requested.length !== 1 || requested[0] !== STORE_NAME || !this.harness.hasStore) {
      throw new Error(`Unknown object store: ${requested.join(',')}`);
    }
    const outcome = this.validationPending ? 'complete' : this.harness.takeOutcome();
    this.validationPending = false;
    this.harness.events.push(`tx:start:${mode}:folders`);
    return new FakeTransaction(this.harness, mode, outcome);
  }
  close(): void {
    if (!this.harness.connections.delete(this)) return;
    this.harness.events.push('connection:close');
  }
}

class Harness implements IndexedDbFactory {
  hasStore = false;
  records = new Map<string, StoredDirectoryHandle>();
  events = ['install'];
  connections = new Set<FakeDatabase>();
  private nextOutcome: LocalVaultTransactionOutcome = 'complete';
  constructor(private readonly priorDescriptor: PropertyDescriptor | undefined) {}
  open(name: string, version = 1) {
    this.events.push(`open:request:${name}@${version}`);
    const database = new FakeDatabase(this);
    const request = new FakeRequest(database);
    queueMicrotask(() => this.finishOpen(name, version, request));
    return request;
  }
  takeOutcome(): LocalVaultTransactionOutcome {
    const outcome = this.nextOutcome;
    this.nextOutcome = 'complete';
    return outcome;
  }
  setNextTransactionOutcome(outcome: LocalVaultTransactionOutcome): void {
    this.nextOutcome = outcome;
  }
  dispatchVersionChange(): void {
    for (const database of [...this.connections]) {
      this.events.push('versionchange');
      database.onversionchange?.(createVersionChangeEvent(1, 2));
    }
  }
  snapshot() {
    return {
      databaseName: DB_NAME,
      version: this.hasStore ? 1 : 0,
      storeName: this.hasStore ? STORE_NAME : null,
      keyPath: this.hasStore ? 'id' : null,
      records: [...this.records.values()]
        .map(({ id, name, handle }) => ({ id, name, handleName: handle.name }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      openConnectionCount: this.connections.size,
      eventLog: [...this.events]
    };
  }
  dispose(): void {
    for (const database of [...this.connections]) database.close();
    if (Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')?.value === this) {
      if (this.priorDescriptor)
        Object.defineProperty(globalThis, 'indexedDB', this.priorDescriptor);
      else Reflect.deleteProperty(globalThis, 'indexedDB');
    }
    if (activeHarness === this) activeHarness = null;
  }
  private finishOpen(name: string, version: number, request: FakeRequest<FakeDatabase>): void {
    const database = request.result;
    if (name !== DB_NAME || version !== 1) {
      request.error = new DOMException('Unexpected Local Vault database.', 'VersionError');
      database.close();
      request.onerror?.(new Event('error'));
      return;
    }
    const succeed = () => {
      database.upgradeTransaction = null;
      this.events.push('open:success');
      request.onsuccess?.(new Event('success'));
    };
    if (this.hasStore) return succeed();
    this.events.push('upgrade:start:0->1');
    const upgrade = new FakeTransaction(this, 'versionchange', 'complete', succeed);
    database.upgradeTransaction = upgrade;
    request.transaction = upgrade;
    request.onupgradeneeded?.(createVersionChangeEvent(0, 1));
  }
}

function createNameList(hasStore = false): IndexedDbNameList {
  return {
    length: hasStore ? 1 : 0,
    contains: (name) => hasStore && name === STORE_NAME,
    item: (index) => (hasStore && index === 0 ? STORE_NAME : null)
  };
}
function unsupportedStoreOperation(): never {
  throw new Error('Unsupported Local Vault object-store operation.');
}
function createVersionChangeEvent(oldVersion: number, newVersion: number): IDBVersionChangeEvent {
  return Object.assign(new Event('versionchange'), { oldVersion, newVersion });
}
function isStoredDirectoryHandle(value: object): value is StoredDirectoryHandle {
  return 'id' in value && typeof value.id === 'string' && 'name' in value && 'handle' in value;
}

export function installLocalVaultIndexedDbHarness(): LocalVaultIndexedDbHarnessController {
  activeHarness?.dispose();
  const harness = new Harness(Object.getOwnPropertyDescriptor(globalThis, 'indexedDB'));
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: harness });
  activeHarness = harness;
  return harness;
}
