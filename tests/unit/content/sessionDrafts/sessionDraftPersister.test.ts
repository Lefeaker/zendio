import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionDraftPersister } from '@content/sessionDrafts/sessionDraftPersister';
import type { SessionDraftEnvelope } from '@content/sessionDrafts/sessionDraftTypes';

function createEnvelope(draftId: string, updatedAt: number): SessionDraftEnvelope {
  return {
    schemaVersion: 1,
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

describe('sessionDraftPersister', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid saves and flushes the latest envelope', async () => {
    vi.useFakeTimers();

    let current = createEnvelope('draft-1', 1);
    const repository = {
      save: vi.fn(async () => undefined)
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
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ draftId: 'draft-2' }));
  });

  it('serializes writes so newer drafts cannot reorder ahead of older writes', async () => {
    vi.useFakeTimers();

    let current = createEnvelope('draft-1', 1);
    let releaseFirst: (() => void) | null = null;
    const repository = {
      save: vi.fn((envelope: SessionDraftEnvelope) => {
        if (envelope.draftId === 'draft-1') {
          return new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        return Promise.resolve();
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

  it('surfaces write failures through the returned promise', async () => {
    vi.useFakeTimers();

    const repository = {
      save: vi.fn(async () => {
        throw new Error('save failed');
      })
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
