import { describe, expect, it, vi } from 'vitest';
import { createProductionStitchActionTaskOwner } from '../../../src/options/app/productionStitchActionTaskOwner';

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('productionStitchActionTaskOwner', () => {
  it('rolls back and reports the current failed task', async () => {
    const owner = createProductionStitchActionTaskOwner();
    const rollback = vi.fn();
    const onFailure = vi.fn();

    owner.run({
      key: 'theme',
      capture: () => ({ theme: 'dark' }),
      task: () => Promise.reject(new Error('persist failed')),
      rollback,
      onFailure
    });
    await owner.waitForIdle();

    expect(rollback).toHaveBeenCalledWith({ theme: 'dark' }, expect.any(Error));
    expect(onFailure).toHaveBeenCalledWith(expect.any(Error));
  });

  it('does not let a superseded failure roll back newer optimistic state', async () => {
    const owner = createProductionStitchActionTaskOwner();
    const first = deferred<void>();
    const second = deferred<void>();
    const firstRollback = vi.fn();
    const secondSuccess = vi.fn();

    owner.run({
      key: 'theme',
      capture: () => 'first',
      task: () => first.promise,
      rollback: firstRollback
    });
    owner.run({
      key: 'theme',
      capture: () => 'second',
      task: () => second.promise,
      rollback: vi.fn(),
      onSuccess: secondSuccess
    });
    first.reject(new Error('old failure'));
    second.resolve();
    await owner.waitForIdle();

    expect(firstRollback).not.toHaveBeenCalled();
    expect(secondSuccess).toHaveBeenCalledTimes(1);
  });

  it('suppresses late task completion after disposal', async () => {
    const owner = createProductionStitchActionTaskOwner();
    const task = deferred<void>();
    const onSuccess = vi.fn();
    owner.run({
      key: 'import',
      capture: () => null,
      task: () => task.promise,
      rollback: vi.fn(),
      onSuccess
    });
    owner.dispose();
    task.resolve();
    await owner.waitForIdle();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
