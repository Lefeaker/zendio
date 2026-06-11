export type SessionMutationFailure = { reason: 'failure' } | { reason: 'error'; error: unknown };

export interface SessionMutationTransaction<Result, SaveResult = unknown> {
  apply(): Result;
  afterApply?(result: Result): void;
  save(): Promise<SaveResult>;
  isSaveFailure?(saveResult: SaveResult): boolean;
  commit?(result: Result, saveResult: SaveResult): void | Promise<void>;
  rollback(result: Result, failure: SessionMutationFailure): void | Promise<void>;
  onSaveError?(error: unknown): void;
}

export interface SessionMutationRunner {
  run<Result, SaveResult = unknown>(
    transaction: SessionMutationTransaction<Result, SaveResult>
  ): Promise<boolean>;
}

export async function runSessionMutationTransaction<Result, SaveResult = unknown>(
  transaction: SessionMutationTransaction<Result, SaveResult>
): Promise<boolean> {
  const result = transaction.apply();
  transaction.afterApply?.(result);

  let saveResult: SaveResult;
  try {
    saveResult = await transaction.save();
  } catch (error) {
    try {
      transaction.onSaveError?.(error);
    } finally {
      await transaction.rollback(result, { reason: 'error', error });
    }
    return false;
  }

  if (transaction.isSaveFailure?.(saveResult) === true) {
    await transaction.rollback(result, { reason: 'failure' });
    return false;
  }

  await transaction.commit?.(result, saveResult);
  return true;
}

export function createSessionMutationRunner(): SessionMutationRunner {
  let tail = Promise.resolve<void>(undefined);

  return {
    run<Result, SaveResult = unknown>(
      transaction: SessionMutationTransaction<Result, SaveResult>
    ): Promise<boolean> {
      const runTask = tail.then(() => runSessionMutationTransaction(transaction));
      tail = runTask.then(
        () => undefined,
        () => undefined
      );
      return runTask;
    }
  };
}
