import type * as Db from './indexedDbTypes';
import { IndexedDbLifecycleError, toIndexedDbLifecycleError } from './indexedDbTypes';

const DEFAULT_BLOCKED_TIMEOUT_MS = 5_000;

export function openIndexedDb(options: Db.OpenIndexedDbOptions): Promise<Db.IndexedDbDatabase> {
  return new Promise((resolve, reject) => {
    const timer = options.timer ?? defaultTimer;
    let request: Db.IndexedDbOpenRequest;
    let settled = false;
    let blockedTimerStarted = false;
    let cancelBlockedTimer: () => void = () => undefined;
    let upgradeDone: Promise<void> | null = null;
    const clearBlockedTimer = () => {
      if (blockedTimerStarted) {
        cancelBlockedTimer();
        blockedTimerStarted = false;
      }
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearBlockedTimer();
      reject(error);
    };
    const resolveOnce = (database: Db.IndexedDbDatabase) => {
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      clearBlockedTimer();
      resolve(database);
    };
    try {
      const factory = options.indexedDb ?? readGlobalIndexedDb();
      request = factory.open(options.name, options.version);
    } catch (error) {
      rejectOnce(createOpenError(options, error));
      return;
    }
    request.onblocked = () => {
      if (settled || blockedTimerStarted) return;
      blockedTimerStarted = true;
      cancelBlockedTimer = timer.schedule(() => {
        rejectOnce(
          new IndexedDbLifecycleError(
            'BLOCKED_TIMEOUT',
            `IndexedDB "${options.name}" remained blocked for ${DEFAULT_BLOCKED_TIMEOUT_MS}ms.`
          )
        );
      }, DEFAULT_BLOCKED_TIMEOUT_MS);
    };
    request.onupgradeneeded = (event) => {
      clearBlockedTimer();
      const transaction = request.transaction;
      if (!transaction) {
        rejectOnce(
          new IndexedDbLifecycleError('UPGRADE_FAILED', 'IndexedDB upgrade has no transaction.')
        );
        return;
      }
      upgradeDone = waitForIndexedDbTransaction(transaction, 'UPGRADE_FAILED');
      void upgradeDone.catch(rejectOnce);
      try {
        runMigrations(options, event.oldVersion, request.result, transaction);
      } catch (error) {
        tryAbort(transaction);
        rejectOnce(
          toIndexedDbLifecycleError('UPGRADE_FAILED', 'IndexedDB migration failed.', error)
        );
      }
    };
    request.onerror = () => {
      rejectOnce(createOpenError(options, request.error, request.error?.name === 'VersionError'));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      void (async () => {
        let versionChanged = false;
        try {
          if (upgradeDone) await upgradeDone;
          if (settled) {
            database.close();
            return;
          }
          if (database.version !== options.version) {
            throw new IndexedDbLifecycleError(
              'VERSION_MISMATCH',
              `IndexedDB "${options.name}" opened at version ${database.version}; expected ${options.version}.`
            );
          }
          database.onversionchange = () => {
            versionChanged = true;
            database.close();
          };
          await options.validate?.(database);
          if (versionChanged) {
            throw new IndexedDbLifecycleError(
              'VERSION_MISMATCH',
              `IndexedDB "${options.name}" changed version while opening.`
            );
          }
          resolveOnce(database);
        } catch (error) {
          if (!versionChanged) database.close();
          rejectOnce(
            error instanceof IndexedDbLifecycleError
              ? error
              : toIndexedDbLifecycleError(
                  'SCHEMA_MISMATCH',
                  'IndexedDB schema validation failed.',
                  error
                )
          );
        }
      })();
    };
  });
}

export async function runIndexedDbTransaction<T>(
  database: Db.IndexedDbDatabase,
  storeNames: Db.IndexedDbStoreNames,
  mode: IDBTransactionMode,
  operation: Db.IndexedDbTransactionOperation<T>
): Promise<T> {
  let transaction: Db.IndexedDbTransaction;
  try {
    transaction = database.transaction(
      typeof storeNames === 'string' ? storeNames : [...storeNames],
      mode
    );
  } catch (error) {
    throw toIndexedDbLifecycleError(
      'TRANSACTION_FAILED',
      `Failed to create ${mode} transaction.`,
      error
    );
  }
  const done = waitForIndexedDbTransaction(transaction);
  try {
    const operationResult = Promise.resolve(operation(transaction));
    const [result] = await Promise.all([operationResult, done]);
    return result;
  } catch (error) {
    tryAbort(transaction);
    await done.catch(() => undefined);
    throw error;
  }
}

export function requestToPromise<T>(request: Db.IndexedDbRequest<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = createSettleOnce();
    request.onsuccess = () => finish(() => resolve(request.result));
    request.onerror = () =>
      finish(() => reject(toIndexedDbLifecycleError('REQUEST_FAILED', message, request.error)));
  });
}

function runMigrations(
  options: Db.OpenIndexedDbOptions,
  oldVersion: number,
  database: Db.IndexedDbDatabase,
  transaction: Db.IndexedDbTransaction
): void {
  let current = oldVersion;
  while (current < options.version) {
    const migration = options.migrations.find(
      ({ fromVersion, toVersion }) => fromVersion === current && toVersion === current + 1
    );
    if (!migration) {
      throw new IndexedDbLifecycleError(
        'UPGRADE_FAILED',
        `Missing migration ${current}->${current + 1}.`
      );
    }
    migration.migrate({ oldVersion, targetVersion: options.version, database, transaction });
    current = migration.toVersion;
  }
}

function createOpenError(
  options: Db.OpenIndexedDbOptions,
  cause: unknown,
  versionMismatch = false
): IndexedDbLifecycleError {
  return toIndexedDbLifecycleError(
    versionMismatch ? 'VERSION_MISMATCH' : 'OPEN_FAILED',
    versionMismatch
      ? `IndexedDB "${options.name}" is newer than supported version ${options.version}.`
      : `Failed to open IndexedDB "${options.name}".`,
    cause
  );
}

function waitForIndexedDbTransaction(
  transaction: Db.IndexedDbTransaction,
  errorCode: Db.IndexedDbLifecycleErrorCode = 'TRANSACTION_FAILED'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = createSettleOnce();
    const fail = (code: Db.IndexedDbLifecycleErrorCode, message: string) =>
      finish(() => reject(toIndexedDbLifecycleError(code, message, transaction.error)));
    transaction.oncomplete = () => finish(resolve);
    transaction.onerror = () => fail(errorCode, 'IndexedDB transaction failed.');
    transaction.onabort = () =>
      fail(
        errorCode === 'UPGRADE_FAILED' ? errorCode : 'TRANSACTION_ABORTED',
        'IndexedDB transaction aborted.'
      );
  });
}

function createSettleOnce(): (action: () => void) => void {
  let settled = false;
  return (action) => {
    if (settled) return;
    settled = true;
    action();
  };
}

function readGlobalIndexedDb(): Db.IndexedDbFactory {
  if (!globalThis.indexedDB) {
    throw new IndexedDbLifecycleError('OPEN_FAILED', 'IndexedDB is unavailable.');
  }
  return globalThis.indexedDB;
}

function tryAbort(transaction: Db.IndexedDbTransaction): void {
  try {
    transaction.abort();
  } catch {
    // The transaction may already be completing or finished.
  }
}

const defaultTimer: Db.IndexedDbTimer = {
  schedule: (callback, delayMs) => {
    const handle = globalThis.setTimeout(callback, delayMs);
    return () => globalThis.clearTimeout(handle);
  }
};
