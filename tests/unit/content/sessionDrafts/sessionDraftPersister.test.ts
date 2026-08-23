import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionDraftPersister } from '@content/sessionDrafts/sessionDraftPersister';
import type { SessionDraftClientEnvelope as SessionDraftEnvelope } from '@shared/sessionDrafts';

function createEnvelope(draftId: string, updatedAt: number): SessionDraftEnvelope {
  return {
    schemaVersion: 2,
    draftId,
    mode: 'reader',
    pageKey: `page-${draftId}`,
    pageUrl: 'https://example.com/post#:~:text=Alpha',
    pageTitle: 'Reader title',
    createdAt: updatedAt - 1,
    updatedAt,
    expiresAt: updatedAt + 1_000,
    status: 'active',
    payload: {
      commentDrafts: {
        [draftId]: `draft-${updatedAt}`
      }
    }
  };
}

const explicitFlushOperations: readonly ('flushNow' | 'dispose')[] = ['flushNow', 'dispose'];

describe('sessionDraftPersister', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid saves and flushes the latest envelope', async () => {
    vi.useFakeTimers();

    let current = createEnvelope('draft-1', 1);
    const repository = {
      save: vi.fn<
        (
          envelope: SessionDraftEnvelope,
          options?: { requestId?: string }
        ) => Promise<SessionDraftEnvelope>
      >((envelope) => Promise.resolve(envelope))
    };
    const persister = createSessionDraftPersister({
      repository,
      buildEnvelope: () => current,
      delayMs: 25
    });

    const first = persister.scheduleSave();
    current = createEnvelope('draft-2', 2);
    const second = persister.scheduleSave();

    await vi.advanceTimersByTimeAsync(25);
    await Promise.all([first, second]);

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save.mock.calls[0]?.[0].draftId).toBe('draft-2');
    expect(typeof repository.save.mock.calls[0]?.[1]?.requestId).toBe('string');
  });

  it('reuses one request id when a logical save is retried after a rejected response', async () => {
    vi.useFakeTimers();
    let envelope = createEnvelope('draft-retry', 1);
    const repository = {
      save: vi
        .fn<
          (
            draft: SessionDraftEnvelope,
            options?: { requestId?: string }
          ) => Promise<SessionDraftEnvelope>
        >((draft) => Promise.resolve(draft))
        .mockRejectedValueOnce(new Error('response lost'))
    };
    let requestSequence = 0;
    const persister = createSessionDraftPersister({
      repository,
      buildEnvelope: () => envelope,
      delayMs: 10,
      createRequestId: () => `logical-save-${(requestSequence += 1)}`
    });

    const first = persister.scheduleSave();
    await vi.advanceTimersByTimeAsync(10);
    await expect(first).rejects.toThrow('response lost');
    envelope = createEnvelope('draft-retry', 2);
    const second = persister.scheduleSave();
    await vi.advanceTimersByTimeAsync(10);
    await expect(second).resolves.toBeUndefined();
    expect(repository.save.mock.calls.map((call) => call[1])).toEqual([
      { requestId: 'logical-save-1' },
      { requestId: 'logical-save-1' },
      { requestId: 'logical-save-2' }
    ]);
    expect(repository.save.mock.calls.map((call) => call[0].updatedAt)).toEqual([1, 1, 2]);
  });

  it.each(explicitFlushOperations)(
    'replays a retained failed save on explicit %s without another schedule',
    async (operation) => {
      vi.useFakeTimers();
      const envelope = createEnvelope('draft-explicit-retry', 1);
      const repository = {
        save: vi
          .fn<
            (
              draft: SessionDraftEnvelope,
              options?: { requestId?: string }
            ) => Promise<SessionDraftEnvelope>
          >((draft) => Promise.resolve(draft))
          .mockRejectedValueOnce(new Error('response lost'))
      };
      const persister = createSessionDraftPersister({
        repository,
        buildEnvelope: () => envelope,
        delayMs: 10,
        createRequestId: () => 'retained-request'
      });

      const scheduled = persister.scheduleSave();
      await vi.advanceTimersByTimeAsync(10);
      await expect(scheduled).rejects.toThrow('response lost');
      if (operation === 'flushNow') await persister.flushNow();
      else await persister.dispose({ flush: true });

      expect(repository.save).toHaveBeenCalledTimes(2);
      expect(repository.save.mock.calls[1]).toEqual(repository.save.mock.calls[0]);
    }
  );

  it.each(explicitFlushOperations)(
    'waits for a healthy in-flight save on %s without duplicating it',
    async (operation) => {
      vi.useFakeTimers();
      const envelope = createEnvelope('draft-in-flight', 1);
      let finishSave: (() => void) | undefined;
      const repository = {
        save: vi.fn(
          () =>
            new Promise<SessionDraftEnvelope>((resolve) => {
              finishSave = () => resolve(envelope);
            })
        )
      };
      const persister = createSessionDraftPersister({
        repository,
        buildEnvelope: () => envelope,
        delayMs: 10
      });

      const scheduled = persister.scheduleSave();
      await vi.advanceTimersByTimeAsync(10);
      const explicitFlush =
        operation === 'flushNow' ? persister.flushNow() : persister.dispose({ flush: true });
      finishSave?.();
      await Promise.all([scheduled, explicitFlush]);

      expect(repository.save).toHaveBeenCalledTimes(1);
    }
  );

  it('serializes writes so newer drafts cannot reorder ahead of older writes', async () => {
    vi.useFakeTimers();

    let current = createEnvelope('draft-1', 1);
    let releaseFirst: (() => void) | null = null;
    const repository = {
      save: vi.fn((envelope: SessionDraftEnvelope) => {
        if (envelope.draftId === 'draft-1') {
          return new Promise<SessionDraftEnvelope>((resolve) => {
            releaseFirst = () => resolve(envelope);
          });
        }
        return Promise.resolve(envelope);
      })
    };
    const persister = createSessionDraftPersister({
      repository,
      buildEnvelope: () => current,
      delayMs: 10
    });

    const first = persister.scheduleSave();
    await vi.advanceTimersByTimeAsync(10);
    expect(repository.save).toHaveBeenCalledTimes(1);

    current = createEnvelope('draft-2', 2);
    const second = persister.scheduleSave();
    await vi.advanceTimersByTimeAsync(10);
    expect(repository.save).toHaveBeenCalledTimes(1);

    expect(releaseFirst).not.toBeNull();
    releaseFirst!();
    await Promise.all([first, second]);

    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(repository.save.mock.calls[0]?.[0]).toMatchObject({ draftId: 'draft-1' });
    expect(repository.save.mock.calls[1]?.[0]).toMatchObject({ draftId: 'draft-2' });
  });

  it('flushNow drains a pending save after an in-flight write without reordering envelopes', async () => {
    vi.useFakeTimers();

    let current = createEnvelope('draft-1', 1);
    let releaseFirst: (() => void) | null = null;
    const repository = {
      save: vi.fn((envelope: SessionDraftEnvelope) => {
        if (envelope.draftId === 'draft-1') {
          return new Promise<SessionDraftEnvelope>((resolve) => {
            releaseFirst = () => resolve(envelope);
          });
        }
        return Promise.resolve(envelope);
      })
    };
    const persister = createSessionDraftPersister({
      repository,
      buildEnvelope: () => current,
      delayMs: 10
    });

    const first = persister.scheduleSave();
    await vi.advanceTimersByTimeAsync(10);
    expect(repository.save).toHaveBeenCalledTimes(1);

    current = createEnvelope('draft-2', 2);
    const second = persister.scheduleSave();
    const flush = persister.flushNow();
    await Promise.resolve();

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(releaseFirst).not.toBeNull();

    releaseFirst!();
    await Promise.all([first, second, flush]);

    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(repository.save.mock.calls[0]?.[0]).toMatchObject({ draftId: 'draft-1' });
    expect(repository.save.mock.calls[1]?.[0]).toMatchObject({ draftId: 'draft-2' });
  });

  it('dispose with flush drains a pending save after an in-flight write without reordering', async () => {
    vi.useFakeTimers();

    let current = createEnvelope('draft-1', 1);
    let releaseFirst: (() => void) | null = null;
    const repository = {
      save: vi.fn((envelope: SessionDraftEnvelope) => {
        if (envelope.draftId === 'draft-1') {
          return new Promise<SessionDraftEnvelope>((resolve) => {
            releaseFirst = () => resolve(envelope);
          });
        }
        return Promise.resolve(envelope);
      })
    };
    const persister = createSessionDraftPersister({
      repository,
      buildEnvelope: () => current,
      delayMs: 10
    });

    const first = persister.scheduleSave();
    await vi.advanceTimersByTimeAsync(10);
    expect(repository.save).toHaveBeenCalledTimes(1);

    current = createEnvelope('draft-2', 2);
    const second = persister.scheduleSave();
    const dispose = persister.dispose({ flush: true });
    await Promise.resolve();

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(releaseFirst).not.toBeNull();

    releaseFirst!();
    await Promise.all([first, second, dispose]);

    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(repository.save.mock.calls[0]?.[0]).toMatchObject({ draftId: 'draft-1' });
    expect(repository.save.mock.calls[1]?.[0]).toMatchObject({ draftId: 'draft-2' });
  });

  it('dispose without flush cancels a pending timer without writing', async () => {
    vi.useFakeTimers();

    const repository = {
      save: vi.fn((envelope: SessionDraftEnvelope) => Promise.resolve(envelope))
    };
    const persister = createSessionDraftPersister({
      repository,
      buildEnvelope: () => createEnvelope('draft-1', 1),
      delayMs: 10
    });

    const scheduled = persister.scheduleSave();
    await persister.dispose();
    await vi.advanceTimersByTimeAsync(10);

    await expect(scheduled).resolves.toBeUndefined();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('surfaces write failures through the returned promise', async () => {
    vi.useFakeTimers();

    const repository = {
      save: vi.fn(() => Promise.reject(new Error('save failed')))
    };
    const persister = createSessionDraftPersister({
      repository,
      buildEnvelope: () => createEnvelope('draft-1', 1),
      delayMs: 10
    });

    const scheduled = persister.scheduleSave();
    await vi.advanceTimersByTimeAsync(10);

    await expect(scheduled).rejects.toThrow('save failed');
  });
});
