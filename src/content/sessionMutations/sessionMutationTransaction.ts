export type SessionMutationFailure = { reason: 'failure' } | { reason: 'error'; error: Error };

export interface SessionMutationTransaction<Result, SaveResult = void> {
  apply(): Result;
  afterApply?(result: Result): void;
  save(): Promise<SaveResult>;
  isSaveFailure?(saveResult: SaveResult): boolean;
  commit?(result: Result, saveResult: SaveResult): void | Promise<void>;
  rollback(result: Result, failure: SessionMutationFailure): void | Promise<void>;
  onSaveError?(error: Error): void;
}

export interface SessionMutationRunner {
  run<Result, SaveResult = void>(
    transaction: SessionMutationTransaction<Result, SaveResult>
  ): Promise<boolean>;
}

export async function runSessionMutationTransaction<Result, SaveResult = void>(
  transaction: SessionMutationTransaction<Result, SaveResult>
): Promise<boolean> {
  const result = transaction.apply();
  transaction.afterApply?.(result);

  let saveResult: SaveResult;
  try {
    saveResult = await transaction.save();
  } catch (error) {
    const saveError = error instanceof Error ? error : new Error(String(error));
    try {
      transaction.onSaveError?.(saveError);
    } finally {
      await transaction.rollback(result, { reason: 'error', error: saveError });
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
    run<Result, SaveResult = void>(
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
