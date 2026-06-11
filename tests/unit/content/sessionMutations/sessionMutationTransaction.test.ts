import { describe, expect, it, vi } from 'vitest';

import {
  createSessionMutationRunner,
  runSessionMutationTransaction
} from '@content/sessionMutations';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('sessionMutationTransaction', () => {
  it('commits after a successful save', async () => {
    const events: string[] = [];
    const applyResult = { id: 'capture-1' };
    const rollback = vi.fn();
    const commit = vi.fn((result: typeof applyResult, saveResult: { status: 'ok' }) => {
      events.push(`commit:${result.id}:${saveResult.status}`);
    });

    const result = await runSessionMutationTransaction({
      apply: () => {
        events.push('apply');
        return applyResult;
      },
      afterApply: (mutationResult) => {
        events.push(`afterApply:${mutationResult.id}`);
      },
      save: async () => {
        events.push('save');
        return { status: 'ok' as const };
      },
      commit,
      rollback
    });

    expect(result).toBe(true);
    expect(events).toEqual(['apply', 'afterApply:capture-1', 'save', 'commit:capture-1:ok']);
    expect(commit).toHaveBeenCalledWith(applyResult, { status: 'ok' });
    expect(rollback).not.toHaveBeenCalled();
  });

  it('rolls back when save throws and calls onSaveError', async () => {
    const saveError = new Error('boom');
    const rollback = vi.fn();
    const onSaveError = vi.fn();

    const result = await runSessionMutationTransaction({
      apply: () => ({ id: 'capture-1' }),
      save: async () => {
        throw saveError;
      },
      rollback,
      onSaveError
    });

    expect(result).toBe(false);
    expect(onSaveError).toHaveBeenCalledWith(saveError);
    expect(rollback).toHaveBeenCalledWith(
      { id: 'capture-1' },
      {
        reason: 'error',
        error: saveError
      }
    );
  });

  it('rolls back without commit when the failure predicate reports a save failure', async () => {
    const rollback = vi.fn();
    const commit = vi.fn();

    const result = await runSessionMutationTransaction({
      apply: () => ({ id: 'capture-1' }),
      save: async () => ({ status: 'failure' as const }),
      isSaveFailure: (saveResult) => saveResult.status === 'failure',
      rollback,
      commit
    });

    expect(result).toBe(false);
    expect(rollback).toHaveBeenCalledWith({ id: 'capture-1' }, { reason: 'failure' });
    expect(commit).not.toHaveBeenCalled();
  });

  it('serializes two mutations when the first save is deferred', async () => {
    const runner = createSessionMutationRunner();
    const firstSave = createDeferred<'saved'>();
    const events: string[] = [];

    const firstRun = runner.run({
      apply: () => {
        events.push('first:apply');
        return 'first-result' as const;
      },
      save: async () => {
        events.push('first:save:start');
        const saveResult = await firstSave.promise;
        events.push(`first:save:end:${saveResult}`);
        return saveResult;
      },
      commit: (result, saveResult) => {
        events.push(`first:commit:${result}:${saveResult}`);
      },
      rollback: () => {
        events.push('first:rollback');
      }
    });

    await Promise.resolve();

    const secondRun = runner.run({
      apply: () => {
        events.push('second:apply');
        return 'second-result' as const;
      },
      save: async () => {
        events.push('second:save');
        return 'saved' as const;
      },
      commit: (result, saveResult) => {
        events.push(`second:commit:${result}:${saveResult}`);
      },
      rollback: () => {
        events.push('second:rollback');
      }
    });

    await Promise.resolve();
    expect(events).toEqual(['first:apply', 'first:save:start']);

    firstSave.resolve('saved');

    await expect(firstRun).resolves.toBe(true);
    await expect(secondRun).resolves.toBe(true);

    expect(events).toEqual([
      'first:apply',
      'first:save:start',
      'first:save:end:saved',
      'first:commit:first-result:saved',
      'second:apply',
      'second:save',
      'second:commit:second-result:saved'
    ]);
  });

  it('rejects when commit throws', async () => {
    const commitError = new Error('commit boom');

    await expect(
      runSessionMutationTransaction({
        apply: () => ({ id: 'capture-1' }),
        save: async () => 'saved' as const,
        commit: () => {
          throw commitError;
        },
        rollback: vi.fn()
      })
    ).rejects.toThrow(commitError);
  });

  it('rejects when rollback throws', async () => {
    const rollbackError = new Error('rollback boom');

    await expect(
      runSessionMutationTransaction({
        apply: () => ({ id: 'capture-1' }),
        save: async () => ({ status: 'failure' as const }),
        isSaveFailure: (saveResult) => saveResult.status === 'failure',
        rollback: () => {
          throw rollbackError;
        }
      })
    ).rejects.toThrow(rollbackError);
  });
});
