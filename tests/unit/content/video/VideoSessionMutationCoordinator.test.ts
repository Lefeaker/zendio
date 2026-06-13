import { describe, expect, it, vi } from 'vitest';
import { VideoSessionMutationCoordinator } from '@content/video/videoSessionMutationCoordinator';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('VideoSessionMutationCoordinator', () => {
  it('keeps saving true while one mutation is in flight', async () => {
    const state = { saving: false };
    const saveGate = createDeferred<'ready'>();
    const coordinator = new VideoSessionMutationCoordinator(state);

    const task = coordinator.runCaptureMutation({
      apply: () => ({ id: 'capture-1' }),
      save: () => saveGate.promise,
      rollback: vi.fn(),
      commit: vi.fn()
    });
    await flushMicrotasks();

    expect(state.saving).toBe(true);

    saveGate.resolve('ready');
    await task;

    expect(state.saving).toBe(false);
  });

  it('keeps saving true while queued mutations remain', async () => {
    const state = { saving: false };
    const firstSave = createDeferred<'ready'>();
    const secondSave = createDeferred<'ready'>();
    const saveEvents: string[] = [];
    const coordinator = new VideoSessionMutationCoordinator(state);

    const firstTask = coordinator.runCaptureMutation({
      apply: () => ({ id: 'capture-1' }),
      save: async () => {
        saveEvents.push('save-1:start');
        const result = await firstSave.promise;
        saveEvents.push('save-1:end');
        return result;
      },
      rollback: vi.fn(),
      commit: vi.fn()
    });
    await flushMicrotasks();

    const secondTask = coordinator.runCaptureMutation({
      apply: () => ({ id: 'capture-2' }),
      save: async () => {
        saveEvents.push('save-2:start');
        const result = await secondSave.promise;
        saveEvents.push('save-2:end');
        return result;
      },
      rollback: vi.fn(),
      commit: vi.fn()
    });
    await flushMicrotasks();

    expect(saveEvents).toEqual(['save-1:start']);
    expect(state.saving).toBe(true);

    firstSave.resolve('ready');
    await firstTask;
    await flushMicrotasks();

    expect(saveEvents).toEqual(['save-1:start', 'save-1:end', 'save-2:start']);
    expect(state.saving).toBe(true);

    secondSave.resolve('ready');
    await secondTask;

    expect(saveEvents).toEqual(['save-1:start', 'save-1:end', 'save-2:start', 'save-2:end']);
    expect(state.saving).toBe(false);
  });

  it.each([
    {
      label: 'success',
      save: () => Promise.resolve('ready' as const),
      expectedResult: true
    },
    {
      label: 'failure hint',
      save: () => Promise.resolve('failure' as const),
      expectedResult: false
    },
    {
      label: 'save error',
      save: () => Promise.reject(new Error('boom')),
      expectedResult: false
    }
  ])('resets saving after $label', async ({ save, expectedResult }) => {
    const state = { saving: false };
    const coordinator = new VideoSessionMutationCoordinator(state);

    const result = await coordinator.runCaptureMutation({
      apply: () => ({ id: 'capture-1' }),
      save,
      rollback: vi.fn(),
      commit: vi.fn(),
      onSaveError: vi.fn()
    });

    expect(result).toBe(expectedResult);
    expect(state.saving).toBe(false);
  });

  it('returns false and rolls back when save resolves to a failure hint', async () => {
    const state = { saving: false };
    const rollback = vi.fn();
    const commit = vi.fn();
    const coordinator = new VideoSessionMutationCoordinator(state);

    const result = await coordinator.runCaptureMutation({
      apply: () => ({ id: 'capture-1' }),
      save: () => Promise.resolve('failure' as const),
      rollback,
      commit
    });

    expect(result).toBe(false);
    expect(rollback).toHaveBeenCalledWith({ id: 'capture-1' }, { reason: 'failure' });
    expect(commit).not.toHaveBeenCalled();
  });

  it('returns false and rolls back with the error when save throws', async () => {
    const state = { saving: false };
    const saveError = new Error('boom');
    const rollback = vi.fn();
    const commit = vi.fn();
    const onSaveError = vi.fn();
    const coordinator = new VideoSessionMutationCoordinator(state);

    const result = await coordinator.runCaptureMutation({
      apply: () => ({ id: 'capture-1' }),
      save: () => Promise.reject(saveError),
      rollback,
      commit,
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
    expect(commit).not.toHaveBeenCalled();
  });
});
