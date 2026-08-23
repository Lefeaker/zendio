/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest';
import {
  openIndexedDb,
  requestToPromise,
  runIndexedDbTransaction
} from '../../../../src/shared/storage/indexedDbLifecycle';
import {
  assertIndexedDbIndex,
  assertIndexedDbNameList,
  assertIndexedDbObjectStore,
  type IndexedDbDatabase,
  type IndexedDbEventHandler,
  type IndexedDbFactory,
  type IndexedDbIndex,
  type IndexedDbNameList,
  type IndexedDbObjectStore,
  type IndexedDbOpenRequest,
  type IndexedDbRequest,
  type IndexedDbTimer,
  type IndexedDbTransaction
} from '../../../../src/shared/storage/indexedDbTypes';

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

class FixtureRequest<T> implements IndexedDbRequest<T> {
  error: DOMException | null = null;
  onsuccess: IndexedDbEventHandler = null;
  onerror: IndexedDbEventHandler = null;
  constructor(readonly result: T) {}
}

class FixtureTransaction implements IndexedDbTransaction {
  error: DOMException | null = null;
  oncomplete: IndexedDbEventHandler = null;
  onerror: IndexedDbEventHandler = null;
  onabort: IndexedDbEventHandler = null;
  readonly abort = vi.fn(() => undefined);
  readonly objectStore = vi.fn((_name: string): IndexedDbObjectStore => {
    throw new DOMException('Missing object store.', 'NotFoundError');
  });
}

class FixtureDatabase implements IndexedDbDatabase {
  readonly name = 'fixture';
  readonly objectStoreNames = nameList([]);
  onversionchange: IndexedDbEventHandler = null;
  readonly close = vi.fn(() => undefined);
  readonly createObjectStore = vi.fn(
    (_name: string, _options?: IDBObjectStoreParameters): IndexedDbObjectStore => {
      throw new DOMException('Invalid object store creation.', 'InvalidStateError');
    }
  );
  readonly transaction;
  constructor(
    readonly version = 2,
    transaction: IndexedDbTransaction = new FixtureTransaction()
  ) {
    this.transaction = vi.fn(
      (_names: string | string[], _mode?: IDBTransactionMode): IndexedDbTransaction => transaction
    );
  }
}

class FixtureOpenRequest extends FixtureRequest<IndexedDbDatabase> implements IndexedDbOpenRequest {
  transaction: IndexedDbTransaction | null = null;
  onblocked: IndexedDbEventHandler<IDBVersionChangeEvent> = null;
  onupgradeneeded: IndexedDbEventHandler<IDBVersionChangeEvent> = null;
}

class FixtureFactory implements IndexedDbFactory {
  readonly open;
  constructor(readonly request: FixtureOpenRequest) {
    this.open = vi.fn((_name: string, _version?: number): IndexedDbOpenRequest => request);
  }
}

function createOpenFixture(version = 2) {
  const transaction = new FixtureTransaction();
  const database = new FixtureDatabase(version, transaction);
  const request = new FixtureOpenRequest(database);
  const factory = new FixtureFactory(request);
  return { database, factory, request, transaction };
}

function createTimerFixture() {
  let callback: () => void = () => undefined;
  const cancel = vi.fn(() => undefined);
  const schedule = vi.fn<IndexedDbTimer['schedule']>((scheduled) => {
    callback = scheduled;
    return cancel;
  });
  return { timer: { schedule }, schedule, cancel, fire: () => callback() };
}

function createStore(
  options: {
    keyPath?: string | string[] | null;
    autoIncrement?: boolean;
    indexKeyPath?: string | string[];
    unique?: boolean;
    multiEntry?: boolean;
    missingIndex?: boolean;
  } = {}
): { store: IndexedDbObjectStore; index: IndexedDbIndex } {
  const index: IndexedDbIndex = {
    keyPath: options.indexKeyPath ?? 'pageKey',
    unique: options.unique ?? false,
    multiEntry: options.multiEntry ?? false,
    getAll: () => new FixtureRequest<object[]>([])
  };
  const store: IndexedDbObjectStore = {
    keyPath: options.keyPath ?? 'key',
    autoIncrement: options.autoIncrement ?? false,
    indexNames: nameList(['byPageKey']),
    createIndex: () => index,
    index: () => {
      if (options.missingIndex) throw new DOMException('Missing index.', 'NotFoundError');
      return index;
    },
    put: () => new FixtureRequest<IDBValidKey>('key'),
    get: () => new FixtureRequest<object | undefined>(undefined),
    delete: () => new FixtureRequest<undefined>(undefined),
    getAll: () => new FixtureRequest<object[]>([])
  };
  return { store, index };
}

describe('indexedDbLifecycle', () => {
  it('runs every fresh migration and waits for upgrade completion before open success', async () => {
    const fixture = createOpenFixture();
    const transitions: string[] = [];
    const opened = openIndexedDb({
      name: 'fixture',
      version: 2,
      indexedDb: fixture.factory,
      migrations: [
        {
          fromVersion: 0,
          toVersion: 1,
          migrate: ({ oldVersion, targetVersion }) =>
            transitions.push(`0->1:${oldVersion}->${targetVersion}`)
        },
        {
          fromVersion: 1,
          toVersion: 2,
          migrate: ({ oldVersion, targetVersion }) =>
            transitions.push(`1->2:${oldVersion}->${targetVersion}`)
        }
      ]
    });

    fixture.request.transaction = fixture.transaction;
    fixture.request.onupgradeneeded?.(versionEvent(0, 2));
    fixture.request.onsuccess?.(new Event('success'));
    let settled = false;
    void opened.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    fixture.transaction.oncomplete?.(new Event('complete'));
    await expect(opened).resolves.toBe(fixture.database);
    expect(transitions).toEqual(['0->1:0->2', '1->2:0->2']);
    expect(fixture.database.onversionchange).toBeTypeOf('function');
    fixture.database.onversionchange?.(new Event('versionchange'));
    expect(fixture.database.close).toHaveBeenCalledTimes(1);
  });

  it('bounds blocked open at exactly five seconds and closes late success', async () => {
    const fixture = createOpenFixture();
    const timer = createTimerFixture();
    const opened = openIndexedDb({
      name: 'blocked-fixture',
      version: 2,
      indexedDb: fixture.factory,
      migrations: [],
      timer: timer.timer
    });

    fixture.request.onblocked?.(versionEvent(1, 2));
    fixture.request.onblocked?.(versionEvent(1, 2));
    expect(timer.schedule).toHaveBeenCalledOnce();
    expect(timer.schedule).toHaveBeenCalledWith(expect.any(Function), 5_000);
    timer.fire();

    await expect(opened).rejects.toMatchObject({ code: 'BLOCKED_TIMEOUT' });
    expect(timer.cancel).toHaveBeenCalledOnce();
    fixture.request.onsuccess?.(new Event('success'));
    expect(fixture.database.close).toHaveBeenCalledTimes(1);
  });

  it('cancels the blocked timer when success arrives before the deadline', async () => {
    const fixture = createOpenFixture();
    const timer = createTimerFixture();
    const opened = openIndexedDb({
      name: 'unblocked-fixture',
      version: 2,
      indexedDb: fixture.factory,
      migrations: [],
      timer: timer.timer
    });
    fixture.request.onblocked?.(versionEvent(1, 2));
    fixture.request.onsuccess?.(new Event('success'));

    await expect(opened).resolves.toBe(fixture.database);
    expect(timer.cancel).toHaveBeenCalledOnce();
  });

  it('runs only the required transition for an existing v1 database', async () => {
    const fixture = createOpenFixture();
    const migrateV1 = vi.fn();
    const opened = openIndexedDb({
      name: 'existing-v1',
      version: 2,
      indexedDb: fixture.factory,
      migrations: [
        { fromVersion: 0, toVersion: 1, migrate: vi.fn() },
        { fromVersion: 1, toVersion: 2, migrate: migrateV1 }
      ]
    });
    fixture.request.transaction = fixture.transaction;
    fixture.request.onupgradeneeded?.(versionEvent(1, 2));
    fixture.transaction.oncomplete?.(new Event('complete'));
    fixture.request.onsuccess?.(new Event('success'));

    await expect(opened).resolves.toBe(fixture.database);
    expect(migrateV1).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: 'missing transition',
      migrations: [{ fromVersion: 1, toVersion: 2, migrate: vi.fn() }]
    },
    {
      name: 'throwing migration',
      migrations: [
        {
          fromVersion: 0,
          toVersion: 1,
          migrate: () => {
            throw new Error('migration failed');
          }
        }
      ]
    }
  ])('aborts and rejects a $name exactly once', async ({ migrations }) => {
    const fixture = createOpenFixture(1);
    const opened = openIndexedDb({
      name: 'upgrade-failure',
      version: 1,
      indexedDb: fixture.factory,
      migrations
    });
    const settled = vi.fn();
    void opened.then(settled, settled);
    fixture.request.transaction = fixture.transaction;
    fixture.request.onupgradeneeded?.(versionEvent(0, 1));

    await expect(opened).rejects.toMatchObject({ code: 'UPGRADE_FAILED' });
    expect(fixture.transaction.abort).toHaveBeenCalledTimes(1);
    fixture.request.onsuccess?.(new Event('success'));
    expect(fixture.database.close).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  const upgradeFailures: Array<'error' | 'abort'> = ['error', 'abort'];
  it.each(upgradeFailures)(
    'rejects upgrade transaction %s once and closes a late success',
    async (outcome) => {
      const fixture = createOpenFixture(1);
      const opened = openIndexedDb({
        name: 'upgrade-transaction-failure',
        version: 1,
        indexedDb: fixture.factory,
        migrations: [{ fromVersion: 0, toVersion: 1, migrate: vi.fn() }]
      });
      const settled = vi.fn();
      void opened.then(settled, settled);
      fixture.request.transaction = fixture.transaction;
      fixture.request.onupgradeneeded?.(versionEvent(0, 1));
      fixture.transaction.error = new DOMException('upgrade failed', 'AbortError');
      if (outcome === 'error') fixture.transaction.onerror?.(new Event('error'));
      else fixture.transaction.onabort?.(new Event('abort'));

      await expect(opened).rejects.toMatchObject({ code: 'UPGRADE_FAILED' });
      fixture.request.onsuccess?.(new Event('success'));
      expect(fixture.database.close).toHaveBeenCalledTimes(1);
      expect(settled).toHaveBeenCalledTimes(1);
    }
  );

  it('maps future/open errors and closes a later success', async () => {
    const future = createOpenFixture(3);
    const futureOpen = openIndexedDb({
      name: 'future',
      version: 2,
      indexedDb: future.factory,
      migrations: []
    });
    future.request.error = new DOMException('future', 'VersionError');
    future.request.onerror?.(new Event('error'));
    await expect(futureOpen).rejects.toMatchObject({ code: 'VERSION_MISMATCH' });
    future.request.onsuccess?.(new Event('success'));
    expect(future.database.close).toHaveBeenCalledTimes(1);

    const failed = createOpenFixture();
    const failedOpen = openIndexedDb({
      name: 'failed',
      version: 2,
      indexedDb: failed.factory,
      migrations: []
    });
    failed.request.error = new DOMException('failed', 'UnknownError');
    failed.request.onerror?.(new Event('error'));
    await expect(failedOpen).rejects.toMatchObject({ code: 'OPEN_FAILED' });
  });

  it('closes target-schema failures and never exposes a versionchanged validation connection', async () => {
    const invalid = createOpenFixture();
    const invalidOpen = openIndexedDb({
      name: 'invalid-target',
      version: 2,
      indexedDb: invalid.factory,
      migrations: [],
      validate: () => {
        throw new Error('invalid schema');
      }
    });
    invalid.request.onsuccess?.(new Event('success'));
    await expect(invalidOpen).rejects.toMatchObject({ code: 'SCHEMA_MISMATCH' });
    expect(invalid.database.close).toHaveBeenCalledTimes(1);

    const changed = createOpenFixture();
    let finishValidation: () => void = () => undefined;
    const validation = new Promise<void>((resolve) => {
      finishValidation = resolve;
    });
    const changedOpen = openIndexedDb({
      name: 'changed-target',
      version: 2,
      indexedDb: changed.factory,
      migrations: [],
      validate: () => validation
    });
    changed.request.onsuccess?.(new Event('success'));
    await Promise.resolve();
    changed.database.onversionchange?.(new Event('versionchange'));
    finishValidation();
    await expect(changedOpen).rejects.toMatchObject({ code: 'VERSION_MISMATCH' });
    expect(changed.database.close).toHaveBeenCalledTimes(1);
  });

  it('rejects wrong store/index descriptors and exact name drift', () => {
    const missingStoreTransaction = new FixtureTransaction();
    const wrongStore = createStore({ keyPath: 'other' }).store;
    const autoIncrementStore = createStore({ autoIncrement: true }).store;
    const missingIndexStore = createStore({ missingIndex: true }).store;
    const wrongIndexKeyPathStore = createStore({ indexKeyPath: 'other' }).store;
    const wrongIndexStore = createStore({ unique: true }).store;
    const multiEntryStore = createStore({ multiEntry: true }).store;
    const transaction = new FixtureTransaction();
    transaction.objectStore.mockImplementation(() => wrongStore);

    expect(() =>
      assertIndexedDbObjectStore(missingStoreTransaction, {
        name: 'entries',
        keyPath: 'key',
        autoIncrement: false
      })
    ).toThrow(expect.objectContaining({ code: 'SCHEMA_MISMATCH' }));
    expect(() =>
      assertIndexedDbObjectStore(transaction, {
        name: 'entries',
        keyPath: 'key',
        autoIncrement: false
      })
    ).toThrow(expect.objectContaining({ code: 'SCHEMA_MISMATCH' }));
    transaction.objectStore.mockImplementation(() => autoIncrementStore);
    expect(() =>
      assertIndexedDbObjectStore(transaction, {
        name: 'entries',
        keyPath: 'key',
        autoIncrement: false
      })
    ).toThrow(expect.objectContaining({ code: 'SCHEMA_MISMATCH' }));
    expect(() =>
      assertIndexedDbIndex(missingIndexStore, {
        name: 'byPageKey',
        keyPath: 'pageKey',
        unique: false,
        multiEntry: false
      })
    ).toThrow(expect.objectContaining({ code: 'SCHEMA_MISMATCH' }));
    expect(() =>
      assertIndexedDbIndex(wrongIndexKeyPathStore, {
        name: 'byPageKey',
        keyPath: 'pageKey',
        unique: false,
        multiEntry: false
      })
    ).toThrow(expect.objectContaining({ code: 'SCHEMA_MISMATCH' }));
    expect(() =>
      assertIndexedDbIndex(wrongIndexStore, {
        name: 'byPageKey',
        keyPath: 'pageKey',
        unique: false,
        multiEntry: false
      })
    ).toThrow(expect.objectContaining({ code: 'SCHEMA_MISMATCH' }));
    expect(() =>
      assertIndexedDbIndex(multiEntryStore, {
        name: 'byPageKey',
        keyPath: 'pageKey',
        unique: false,
        multiEntry: false
      })
    ).toThrow(expect.objectContaining({ code: 'SCHEMA_MISMATCH' }));
    expect(() =>
      assertIndexedDbNameList(nameList(['entries', 'unexpected']), ['entries'], 'store')
    ).toThrow(expect.objectContaining({ code: 'SCHEMA_MISMATCH' }));
  });

  it('treats request success as provisional until readonly completion', async () => {
    const request = new FixtureRequest('row');
    const transaction = new FixtureTransaction();
    const database = new FixtureDatabase(2, transaction);
    const operation = runIndexedDbTransaction(database, 'rows', 'readonly', () =>
      requestToPromise(request, 'read failed')
    );
    request.onsuccess?.(new Event('success'));
    let value: string | undefined;
    void operation.then((result) => {
      value = result;
    });
    await Promise.resolve();
    expect(value).toBeUndefined();

    transaction.oncomplete?.(new Event('complete'));
    await expect(operation).resolves.toBe('row');
  });

  it('maps request failure and aborts the owning transaction', async () => {
    const request = new FixtureRequest('row');
    const transaction = new FixtureTransaction();
    const database = new FixtureDatabase(2, transaction);
    const operation = runIndexedDbTransaction(database, 'rows', 'readwrite', () =>
      requestToPromise(request, 'write failed')
    );
    request.error = new DOMException('request failed', 'DataError');
    request.onerror?.(new Event('error'));
    transaction.onabort?.(new Event('abort'));

    await expect(operation).rejects.toMatchObject({ code: 'REQUEST_FAILED' });
    expect(transaction.abort).toHaveBeenCalledTimes(1);
  });

  it('maps transaction construction failures', async () => {
    const database = new FixtureDatabase();
    database.transaction.mockImplementation(() => {
      throw new DOMException('closed', 'InvalidStateError');
    });
    await expect(
      runIndexedDbTransaction(database, 'rows', 'readonly', () => 'unreachable')
    ).rejects.toMatchObject({ code: 'TRANSACTION_FAILED' });
  });

  it('settles transaction error followed by abort only once', async () => {
    const transaction = new FixtureTransaction();
    const database = new FixtureDatabase(2, transaction);
    const operation = runIndexedDbTransaction(database, 'rows', 'readwrite', () => 'pending');
    const settled = vi.fn();
    void operation.then(settled, settled);
    transaction.error = new DOMException('failed', 'UnknownError');
    transaction.onerror?.(new Event('error'));
    transaction.onabort?.(new Event('abort'));

    await expect(operation).rejects.toMatchObject({ code: 'TRANSACTION_FAILED' });
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('settles an explicit abort once while the operation is pending', async () => {
    const transaction = new FixtureTransaction();
    const database = new FixtureDatabase(2, transaction);
    const operation = runIndexedDbTransaction(
      database,
      'rows',
      'readonly',
      () => new Promise<string>(() => undefined)
    );
    const settled = vi.fn();
    void operation.then(settled, settled);
    transaction.error = new DOMException('aborted', 'AbortError');
    transaction.onabort?.(new Event('abort'));

    await expect(operation).rejects.toMatchObject({ code: 'TRANSACTION_ABORTED' });
    expect(settled).toHaveBeenCalledTimes(1);
  });
});
