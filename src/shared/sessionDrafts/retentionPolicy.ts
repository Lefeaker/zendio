import {
  SESSION_DRAFT_MAX_ENTRIES,
  type SessionDraftIndexEntry,
  type SessionDraftRetentionPolicy
} from './types';
import { compareSessionDraftText } from './keys';

export const FREE_SESSION_DRAFT_RETENTION_MS = 48 * 60 * 60 * 1000;
export const FREE_SESSION_DRAFT_MAX_RESTORABLE_PAGES = 5;
export const FREE_SESSION_DRAFT_MAX_ITEMS_PER_PAGE = 20;

export const DEFAULT_SESSION_DRAFT_RETENTION_POLICY: SessionDraftRetentionPolicy = {
  retentionMs: FREE_SESSION_DRAFT_RETENTION_MS,
  maxRestorablePages: FREE_SESSION_DRAFT_MAX_RESTORABLE_PAGES,
  maxItemsPerPage: FREE_SESSION_DRAFT_MAX_ITEMS_PER_PAGE
};

export function measureSessionDraftValueBytes(value: object): number {
  const serialized = JSON.stringify(value);
  return serialized ? new TextEncoder().encode(serialized).length : 0;
}

export function boundSessionDraftLimit(value: number | undefined, maximum: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? Math.min(value, maximum)
    : maximum;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nullablePositiveInteger(
  value: number | null | undefined,
  fallback: number | null
): number | null {
  if (value === null) return null;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

export function normalizeSessionDraftRetentionPolicy(
  policy?: Partial<SessionDraftRetentionPolicy>
): SessionDraftRetentionPolicy {
  return {
    retentionMs: positiveNumber(
      policy?.retentionMs,
      DEFAULT_SESSION_DRAFT_RETENTION_POLICY.retentionMs
    ),
    maxRestorablePages: nullablePositiveInteger(
      policy?.maxRestorablePages,
      DEFAULT_SESSION_DRAFT_RETENTION_POLICY.maxRestorablePages
    ),
    maxItemsPerPage: nullablePositiveInteger(
      policy?.maxItemsPerPage,
      DEFAULT_SESSION_DRAFT_RETENTION_POLICY.maxItemsPerPage
    )
  };
}

export function getSessionDraftEffectiveExpiresAt(
  entry: Pick<SessionDraftIndexEntry, 'updatedAt' | 'expiresAt'>,
  policy: SessionDraftRetentionPolicy
): number {
  return Math.min(entry.expiresAt, entry.updatedAt + policy.retentionMs);
}

function isRecoverable(entry: SessionDraftIndexEntry): boolean {
  return entry.status === 'active' || entry.status === 'restorable';
}

function pageIdentity(entry: SessionDraftIndexEntry): string {
  return `${entry.mode}:${entry.pageKey}`;
}

export function selectSessionDraftRetentionRemovals(
  entries: readonly SessionDraftIndexEntry[],
  now: number,
  policy: SessionDraftRetentionPolicy,
  maxEntries = SESSION_DRAFT_MAX_ENTRIES,
  protectedKey?: string
): { retained: SessionDraftIndexEntry[]; removed: SessionDraftIndexEntry[] } {
  const sorted = [...entries].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt || compareSessionDraftText(left.key, right.key)
  );
  const unique: SessionDraftIndexEntry[] = [];
  const removed: SessionDraftIndexEntry[] = [];
  const seen = new Set<string>();
  for (const entry of sorted) {
    if (seen.has(entry.key) || getSessionDraftEffectiveExpiresAt(entry, policy) <= now) {
      removed.push(entry);
    } else {
      seen.add(entry.key);
      unique.push(entry);
    }
  }

  let retained = prunePageLimit(unique, policy.maxRestorablePages, removed, protectedKey);
  if (retained.length > maxEntries) {
    const restorable = retained
      .filter((entry) => entry.status !== 'active')
      .sort(
        (left, right) =>
          left.updatedAt - right.updatedAt || compareSessionDraftText(right.key, left.key)
      );
    const active = retained
      .filter((entry) => entry.status === 'active')
      .sort(
        (left, right) =>
          left.updatedAt - right.updatedAt || compareSessionDraftText(right.key, left.key)
      );
    const overflow = retained.length - maxEntries;
    const evicted = [...restorable, ...active]
      .filter((entry) => entry.key !== protectedKey)
      .slice(0, overflow);
    const evictedKeys = new Set(evicted.map((entry) => entry.key));
    removed.push(...evicted);
    retained = retained.filter((entry) => !evictedKeys.has(entry.key));
  }
  return { retained, removed };
}

function prunePageLimit(
  entries: readonly SessionDraftIndexEntry[],
  maxPages: number | null,
  removed: SessionDraftIndexEntry[],
  protectedKey?: string
): SessionDraftIndexEntry[] {
  if (maxPages === null) return [...entries];
  const pages = new Map<string, number>();
  for (const entry of entries) {
    if (!isRecoverable(entry)) continue;
    const identity = pageIdentity(entry);
    pages.set(identity, Math.max(pages.get(identity) ?? 0, entry.updatedAt));
  }
  const protectedEntry = entries.find((entry) => entry.key === protectedKey);
  const protectedPage = protectedEntry ? pageIdentity(protectedEntry) : undefined;
  const retainedPages = new Set(
    [...pages]
      .sort((left, right) => {
        if (left[0] === protectedPage) return -1;
        if (right[0] === protectedPage) return 1;
        return right[1] - left[1] || compareSessionDraftText(left[0], right[0]);
      })
      .slice(0, maxPages)
      .map(([identity]) => identity)
  );
  return entries.filter((entry) => {
    if (isRecoverable(entry) && !retainedPages.has(pageIdentity(entry))) {
      removed.push(entry);
      return false;
    }
    return true;
  });
}

export function selectRetainedSessionDraftItems<T extends { createdAt: number }>(
  items: readonly T[],
  policy: SessionDraftRetentionPolicy
): T[] {
  const maxItems = policy.maxItemsPerPage;
  if (maxItems === null || items.length <= maxItems) return [...items];
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => right.item.createdAt - left.item.createdAt || right.index - left.index)
    .slice(0, maxItems)
    .sort((left, right) => left.index - right.index)
    .map(({ item }) => item);
}
