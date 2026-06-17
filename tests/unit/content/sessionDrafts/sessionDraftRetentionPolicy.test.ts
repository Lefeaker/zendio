import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION_DRAFT_RETENTION_POLICY,
  FREE_SESSION_DRAFT_MAX_ITEMS_PER_PAGE,
  FREE_SESSION_DRAFT_MAX_RESTORABLE_PAGES,
  FREE_SESSION_DRAFT_RETENTION_MS,
  FREE_SESSION_DRAFT_RETENTION_POLICY,
  filterSessionCommentDraftsForRetainedIds,
  pruneSessionDraftIndexEntriesForRetentionPolicy,
  selectRetainedSessionDraftItems,
  type SessionDraftIndexEntry
} from '@content/sessionDrafts';

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TIME = 2_000_000_000_000;

function createIndexEntry(
  draftId: string,
  overrides: Partial<SessionDraftIndexEntry> = {}
): SessionDraftIndexEntry {
  const mode = overrides.mode ?? 'reader';
  const pageKey = overrides.pageKey ?? `${mode}-page-${draftId}`;
  return {
    key: `aiob.sessionDraft.v1.${mode}.${pageKey}.${draftId}`,
    draftId,
    mode,
    pageKey,
    updatedAt: overrides.updatedAt ?? BASE_TIME,
    expiresAt: overrides.expiresAt ?? BASE_TIME + DAY_MS,
    status: overrides.status ?? 'restorable',
    ...(overrides.ownerContext ? { ownerContext: overrides.ownerContext } : {})
  };
}

describe('session draft retention policy', () => {
  it('defines Free restore limits and uses them as the default policy', () => {
    expect(FREE_SESSION_DRAFT_RETENTION_MS).toBe(48 * 60 * 60 * 1000);
    expect(FREE_SESSION_DRAFT_MAX_RESTORABLE_PAGES).toBe(5);
    expect(FREE_SESSION_DRAFT_MAX_ITEMS_PER_PAGE).toBe(20);
    expect(FREE_SESSION_DRAFT_RETENTION_POLICY).toEqual({
      retentionMs: FREE_SESSION_DRAFT_RETENTION_MS,
      maxRestorablePages: 5,
      maxItemsPerPage: 20
    });
    expect(DEFAULT_SESSION_DRAFT_RETENTION_POLICY).toEqual(FREE_SESSION_DRAFT_RETENTION_POLICY);
  });

  it('keeps only the five newest restorable page identities', () => {
    const entries = Array.from({ length: 6 }, (_, index) =>
      createIndexEntry(`restorable-${index}`, {
        mode: index % 2 === 0 ? 'reader' : 'video',
        pageKey: `page-${index}`,
        updatedAt: BASE_TIME + index
      })
    );

    const result = pruneSessionDraftIndexEntriesForRetentionPolicy(entries, BASE_TIME - 1, {
      policy: FREE_SESSION_DRAFT_RETENTION_POLICY,
      maxEntries: 100
    });

    expect(result.entries.map((entry) => entry.draftId)).toEqual([
      'restorable-5',
      'restorable-4',
      'restorable-3',
      'restorable-2',
      'restorable-1'
    ]);
    expect(result.removedKeys).toEqual([entries[0]?.key]);
    expect(result.dirty).toBe(true);
  });

  it('removes every restorable entry for an over-limit page identity', () => {
    const oldPageFirst = createIndexEntry('old-page-first', {
      pageKey: 'old-page',
      updatedAt: BASE_TIME
    });
    const oldPageSecond = createIndexEntry('old-page-second', {
      pageKey: 'old-page',
      updatedAt: BASE_TIME + 1
    });
    const newerPages = Array.from({ length: 5 }, (_, index) =>
      createIndexEntry(`new-page-${index}`, {
        pageKey: `new-page-${index}`,
        updatedAt: BASE_TIME + 10 + index
      })
    );

    const result = pruneSessionDraftIndexEntriesForRetentionPolicy(
      [oldPageFirst, oldPageSecond, ...newerPages],
      BASE_TIME - 1,
      {
        policy: FREE_SESSION_DRAFT_RETENTION_POLICY,
        maxEntries: 100
      }
    );

    expect(result.entries.map((entry) => entry.draftId)).not.toContain('old-page-first');
    expect(result.entries.map((entry) => entry.draftId)).not.toContain('old-page-second');
    expect(result.removedKeys.sort()).toEqual([oldPageFirst.key, oldPageSecond.key].sort());
  });

  it('does not count terminal drafts against the Free page quota', () => {
    const restorablePages = Array.from({ length: 5 }, (_, index) =>
      createIndexEntry(`restorable-${index}`, {
        pageKey: `restorable-page-${index}`,
        updatedAt: BASE_TIME + index,
        status: 'restorable'
      })
    );
    const terminalPages = [
      createIndexEntry('discarded-terminal', {
        pageKey: 'terminal-page-a',
        updatedAt: BASE_TIME + 100,
        status: 'discarded'
      }),
      createIndexEntry('exported-terminal', {
        mode: 'video',
        pageKey: 'terminal-page-b',
        updatedAt: BASE_TIME + 101,
        status: 'exported'
      })
    ];

    const result = pruneSessionDraftIndexEntriesForRetentionPolicy(
      [...restorablePages, ...terminalPages],
      BASE_TIME - 1,
      {
        policy: FREE_SESSION_DRAFT_RETENTION_POLICY,
        maxEntries: 100
      }
    );

    expect(result.entries.map((entry) => entry.draftId).sort()).toEqual(
      [...restorablePages, ...terminalPages].map((entry) => entry.draftId).sort()
    );
  });

  it('still applies the technical max entries cap after policy page pruning', () => {
    const entries = Array.from({ length: 6 }, (_, index) =>
      createIndexEntry(`restorable-${index}`, {
        pageKey: `page-${index}`,
        updatedAt: BASE_TIME + index
      })
    );

    const result = pruneSessionDraftIndexEntriesForRetentionPolicy(entries, BASE_TIME - 1, {
      policy: FREE_SESSION_DRAFT_RETENTION_POLICY,
      maxEntries: 3
    });

    expect(result.entries).toHaveLength(3);
    expect(result.entries.map((entry) => entry.draftId)).toEqual([
      'restorable-5',
      'restorable-4',
      'restorable-3'
    ]);
  });

  it('selects the newest Free item window while preserving stable retained order', () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      id: `item-${index}`,
      createdAt: BASE_TIME + index
    }));

    const retained = selectRetainedSessionDraftItems(items, FREE_SESSION_DRAFT_RETENTION_POLICY);

    expect(retained.map((item) => item.id)).toEqual(
      Array.from(
        { length: FREE_SESSION_DRAFT_MAX_ITEMS_PER_PAGE },
        (_, index) => `item-${index + 5}`
      )
    );
    expect(items).toHaveLength(25);
  });

  it('filters comment drafts to retained item ids', () => {
    expect(
      filterSessionCommentDraftsForRetainedIds(
        {
          'item-1': 'kept',
          'item-2': 'dropped',
          'item-3': 'also kept'
        },
        ['item-1', 'item-3']
      )
    ).toEqual({
      'item-1': 'kept',
      'item-3': 'also kept'
    });
  });
});
