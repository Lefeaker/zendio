import { describe, expect, it, vi } from 'vitest';
import { createSessionDraftRepository } from '@content/sessionDrafts/sessionDraftRepository';
import {
  SESSION_DRAFT_INDEX_KEY,
  createSessionDraftPageKey,
  createSessionDraftStorageKey
} from '@content/sessionDrafts/sessionDraftKeys';
import type {
  SessionDraftEnvelope,
  SessionDraftIndexEntry,
  SessionDraftMode
} from '@content/sessionDrafts/sessionDraftTypes';
import { createMemoryStorageArea } from '@platform/preview/memoryStorage';

const BASE_TIME = 2_000_000_000_000;

function createEnvelope(
  mode: SessionDraftMode,
  overrides: Partial<SessionDraftEnvelope> = {}
): SessionDraftEnvelope {
  const pageUrl =
    overrides.pageUrl ??
    (mode === 'reader'
      ? 'https://example.com/post#:~:text=Alpha'
      : 'https://video.example/watch?v=1');
  const updatedAt = overrides.updatedAt ?? BASE_TIME + 10;
  const pageKey = createSessionDraftPageKey(mode, pageUrl);

  return {
    schemaVersion: 1,
    draftId: overrides.draftId ?? `${mode}-${updatedAt}`,
    mode,
    pageKey,
    pageUrl,
    pageTitle: overrides.pageTitle ?? `${mode} title`,
    createdAt: overrides.createdAt ?? updatedAt - 1,
    updatedAt,
    expiresAt: overrides.expiresAt ?? updatedAt + 7 * 24 * 60 * 60 * 1000,
    status: overrides.status ?? 'active',
    payload: overrides.payload ?? {
      commentDrafts: {
        [`${mode}-comment`]: `draft-${updatedAt}`
      }
    }
  } as SessionDraftEnvelope;
}

function createIndexEntry(envelope: SessionDraftEnvelope): SessionDraftIndexEntry {
  return {
    key: createSessionDraftStorageKey({
      mode: envelope.mode,
      pageKey: envelope.pageKey,
      draftId: envelope.draftId
    }),
    draftId: envelope.draftId,
    mode: envelope.mode,
    pageKey: envelope.pageKey,
    updatedAt: envelope.updatedAt,
    expiresAt: envelope.expiresAt,
    status: envelope.status
  };
}

describe('sessionDraftRepository', () => {
  it('save stores the envelope and updates the draft index', async () => {
    const storage = createMemoryStorageArea();
    const repository = createSessionDraftRepository(storage);
    const envelope = createEnvelope('reader', {
      draftId: 'reader-1',
      updatedAt: BASE_TIME + 100
    });

    await repository.save(envelope);

    const storageKey = createSessionDraftStorageKey({
      mode: envelope.mode,
      pageKey: envelope.pageKey,
      draftId: envelope.draftId
    });
    await expect(storage.get(storageKey)).resolves.toMatchObject({ draftId: 'reader-1' });
    await expect(storage.get(SESSION_DRAFT_INDEX_KEY)).resolves.toMatchObject({
      schemaVersion: 1,
      entries: [expect.objectContaining({ draftId: 'reader-1', key: storageKey })]
    });
  });

  it('prunes expired drafts from the index and excludes them from loadLatest', async () => {
    const storage = createMemoryStorageArea();
    const repository = createSessionDraftRepository(storage);
    const expired = createEnvelope('reader', {
      draftId: 'expired',
      updatedAt: 5,
      expiresAt: 9
    });
    const live = createEnvelope('reader', {
      draftId: 'live',
      updatedAt: 7,
      expiresAt: 20
    });
    const expiredKey = createIndexEntry(expired).key;
    const liveKey = createIndexEntry(live).key;

    await storage.setMany({
      [expiredKey]: expired,
      [liveKey]: live,
      [SESSION_DRAFT_INDEX_KEY]: {
        schemaVersion: 1,
        entries: [createIndexEntry(live), createIndexEntry(expired)]
      }
    });

    await expect(repository.loadLatest('reader', live.pageUrl, 10)).resolves.toMatchObject({
      draftId: 'live'
    });
    await expect(storage.get(expiredKey)).resolves.toBeUndefined();
    await expect(storage.get(SESSION_DRAFT_INDEX_KEY)).resolves.toMatchObject({
      entries: [expect.objectContaining({ draftId: 'live' })]
    });
  });

  it('remove deletes both the envelope record and its index entry', async () => {
    const storage = createMemoryStorageArea();
    const repository = createSessionDraftRepository(storage);
    const envelope = createEnvelope('video', {
      draftId: 'video-1',
      updatedAt: BASE_TIME + 200
    });
    const key = createIndexEntry(envelope).key;

    await repository.save(envelope);
    await repository.remove(envelope.draftId);

    await expect(storage.get(key)).resolves.toBeUndefined();
    await expect(storage.get(SESSION_DRAFT_INDEX_KEY)).resolves.toMatchObject({
      schemaVersion: 1,
      entries: []
    });
  });

  it('ignores malformed stored envelopes and prunes their index entries', async () => {
    const storage = createMemoryStorageArea();
    const repository = createSessionDraftRepository(storage);
    const envelope = createEnvelope('reader', { draftId: 'broken', updatedAt: 50 });
    const key = createIndexEntry(envelope).key;

    await storage.setMany({
      [key]: {
        schemaVersion: 1,
        draftId: 'broken',
        mode: 'reader',
        pageKey: envelope.pageKey,
        pageUrl: envelope.pageUrl,
        pageTitle: envelope.pageTitle,
        createdAt: envelope.createdAt,
        updatedAt: envelope.updatedAt,
        expiresAt: envelope.expiresAt,
        status: envelope.status,
        payload: 'not-an-object'
      },
      [SESSION_DRAFT_INDEX_KEY]: {
        schemaVersion: 1,
        entries: [createIndexEntry(envelope)]
      }
    });

    await expect(repository.loadLatest('reader', envelope.pageUrl, 40)).resolves.toBeNull();
    await expect(storage.get(key)).resolves.toBeUndefined();
    await expect(storage.get(SESSION_DRAFT_INDEX_KEY)).resolves.toMatchObject({ entries: [] });
  });

  it('ignores and prunes wrong-mode or mismatched key recovery entries', async () => {
    const storage = createMemoryStorageArea();
    const repository = createSessionDraftRepository(storage);
    const readerUrl = 'https://example.com/post#:~:text=Alpha';
    const envelope = createEnvelope('video', {
      draftId: 'mismatch',
      updatedAt: BASE_TIME + 300
    });
    const mismatchedEntry = {
      ...createIndexEntry(envelope),
      key: 'aiob.sessionDraft.v1.reader.reader-page.mismatch',
      mode: 'reader' as const,
      pageKey: createSessionDraftPageKey('reader', readerUrl)
    };

    await storage.setMany({
      [mismatchedEntry.key]: envelope,
      [SESSION_DRAFT_INDEX_KEY]: {
        schemaVersion: 1,
        entries: [mismatchedEntry]
      }
    });

    await expect(repository.loadLatest('reader', readerUrl, BASE_TIME + 301)).resolves.toBeNull();
    await expect(storage.get(mismatchedEntry.key)).resolves.toBeUndefined();
    await expect(storage.get(SESSION_DRAFT_INDEX_KEY)).resolves.toMatchObject({ entries: [] });
  });

  it('pruneExpired removes expired entries and envelopes without loading a session', async () => {
    const storage = createMemoryStorageArea();
    const repository = createSessionDraftRepository(storage);
    const expired = createEnvelope('reader', {
      draftId: 'expired-prune',
      updatedAt: 5,
      expiresAt: 9
    });
    const key = createIndexEntry(expired).key;

    await storage.setMany({
      [key]: expired,
      [SESSION_DRAFT_INDEX_KEY]: {
        schemaVersion: 1,
        entries: [createIndexEntry(expired)]
      }
    });

    await repository.pruneExpired(10);

    await expect(storage.get(key)).resolves.toBeUndefined();
    await expect(storage.get(SESSION_DRAFT_INDEX_KEY)).resolves.toMatchObject({ entries: [] });
  });

  it('ignores unknown schema versions instead of throwing during recovery', async () => {
    const storage = createMemoryStorageArea();
    const repository = createSessionDraftRepository(storage);
    const envelope = createEnvelope('reader', {
      draftId: 'unknown-schema',
      updatedAt: BASE_TIME + 400
    });
    const key = createIndexEntry(envelope).key;

    await storage.setMany({
      [key]: {
        ...envelope,
        schemaVersion: 2
      },
      [SESSION_DRAFT_INDEX_KEY]: {
        schemaVersion: 1,
        entries: [createIndexEntry(envelope)]
      }
    });

    await expect(repository.loadLatest('reader', envelope.pageUrl, BASE_TIME + 401)).resolves.toBeNull();
    await expect(storage.get(key)).resolves.toBeUndefined();
    await expect(storage.get(SESSION_DRAFT_INDEX_KEY)).resolves.toMatchObject({ entries: [] });
  });

  it('rejects oversized envelopes before writing to storage', async () => {
    const storage = createMemoryStorageArea();
    const setSpy = vi.spyOn(storage, 'set');
    const setManySpy = vi.spyOn(storage, 'setMany');
    const repository = createSessionDraftRepository(storage);

    await expect(
      repository.save(
        createEnvelope('video', {
          payload: {
            binaryLike: 'x'.repeat(520 * 1024)
          }
        })
      )
    ).rejects.toThrow(/512 KiB/i);

    expect(setSpy).not.toHaveBeenCalled();
    expect(setManySpy).not.toHaveBeenCalled();
  });

  it('rejects payload fields that contain data image urls before writing', async () => {
    const storage = createMemoryStorageArea();
    const setManySpy = vi.spyOn(storage, 'setMany');
    const repository = createSessionDraftRepository(storage);

    await expect(
      repository.save(
        createEnvelope('video', {
          payload: {
            screenshotIntent: {
              dataUrl: 'data:image/png;base64,shot'
            }
          }
        })
      )
    ).rejects.toThrow(/data:image\//i);

    expect(setManySpy).not.toHaveBeenCalled();
  });

  it('keeps at most 100 index entries and drops non-active drafts first', async () => {
    const storage = createMemoryStorageArea();
    const repository = createSessionDraftRepository(storage);

    for (let index = 0; index < 100; index += 1) {
      await repository.save(
        createEnvelope('reader', {
          draftId: `active-${index}`,
          pageUrl: `https://example.com/post/${index}`,
          updatedAt: BASE_TIME + index,
          status: 'active'
        })
      );
    }

    for (let index = 0; index < 2; index += 1) {
      await repository.save(
        createEnvelope('reader', {
          draftId: `restorable-${index}`,
          pageUrl: `https://example.com/restorable/${index}`,
          updatedAt: BASE_TIME + 1000 + index,
          status: 'restorable'
        })
      );
    }

    const indexState = (await storage.get<{
      schemaVersion: number;
      entries: SessionDraftIndexEntry[];
    }>(SESSION_DRAFT_INDEX_KEY)) ?? { schemaVersion: 1, entries: [] };

    expect(indexState.schemaVersion).toBe(1);
    expect(indexState.entries).toHaveLength(100);
    expect(indexState.entries.every((entry) => entry.status === 'active')).toBe(true);
  });

  it('keeps same draft ids on different pages instead of collapsing them globally', async () => {
    const storage = createMemoryStorageArea();
    const repository = createSessionDraftRepository(storage);
    const first = createEnvelope('reader', {
      draftId: 'shared-id',
      pageUrl: 'https://example.com/post/one#:~:text=Alpha',
      updatedAt: BASE_TIME + 600
    });
    const second = createEnvelope('reader', {
      draftId: 'shared-id',
      pageUrl: 'https://example.com/post/two#:~:text=Beta',
      updatedAt: BASE_TIME + 601
    });

    await repository.save(first);
    await repository.save(second);

    const indexState = (await storage.get<{
      schemaVersion: number;
      entries: SessionDraftIndexEntry[];
    }>(SESSION_DRAFT_INDEX_KEY)) ?? { schemaVersion: 1, entries: [] };

    expect(indexState.entries.filter((entry) => entry.draftId === 'shared-id')).toHaveLength(2);
    await expect(repository.loadLatest('reader', first.pageUrl, BASE_TIME + 602)).resolves.toMatchObject({
      pageUrl: first.pageUrl
    });
    await expect(repository.loadLatest('reader', second.pageUrl, BASE_TIME + 602)).resolves.toMatchObject({
      pageUrl: second.pageUrl
    });
  });
});
