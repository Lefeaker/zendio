import { describe, expect, it, vi } from 'vitest';

import { runVideoCaptureMutationTransaction } from '@content/video/videoCaptureMutationTransaction';

describe('videoCaptureMutationTransaction', () => {
  it('rolls back when save returns a failure hint', async () => {
    const apply = vi.fn(() => ({ id: 'capture-1' }));
    const afterApply = vi.fn();
    const save = vi.fn(async () => 'failure' as const);
    const rollback = vi.fn();
    const commit = vi.fn();

    const result = await runVideoCaptureMutationTransaction({
      apply,
      afterApply,
      save,
      rollback,
      commit
    });

    expect(result).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(afterApply).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledWith({ id: 'capture-1' }, { reason: 'failure' });
    expect(commit).not.toHaveBeenCalled();
  });

  it('rolls back when save throws', async () => {
    const apply = vi.fn(() => ({ id: 'capture-1' }));
    const afterApply = vi.fn();
    const saveError = new Error('boom');
    const save = vi.fn(async () => {
      throw saveError;
    });
    const rollback = vi.fn();
    const commit = vi.fn();
    const onSaveError = vi.fn();

    const result = await runVideoCaptureMutationTransaction({
      apply,
      afterApply,
      save,
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

  it('commits after a successful save', async () => {
    const apply = vi.fn(() => ({ id: 'capture-1' }));
    const afterApply = vi.fn();
    const save = vi.fn(async () => 'ready' as const);
    const rollback = vi.fn();
    const commit = vi.fn();

    const result = await runVideoCaptureMutationTransaction({
      apply,
      afterApply,
      save,
      rollback,
      commit
    });

    expect(result).toBe(true);
    expect(commit).toHaveBeenCalledWith({ id: 'capture-1' }, 'ready');
    expect(rollback).not.toHaveBeenCalled();
  });
});
