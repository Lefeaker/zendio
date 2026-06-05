import type { StorageAreaService } from '../../platform/interfaces/storage';
import {
  createSessionDraftPageKey,
  createSessionDraftStorageKey,
  isSessionDraftStorageKey,
  SESSION_DRAFT_INDEX_KEY
} from './sessionDraftKeys';
import {
  SessionDraftEnvelopeSchema,
  SessionDraftIndexSchema,
  containsDisallowedSessionDraftPayloadValue,
  createSessionDraftIndex,
  createSessionDraftIndexEntry,
  measureSessionDraftValueBytes,
  normalizeSessionDraftEnvelopeForSave,
  pruneSessionDraftIndexEntries
} from './sessionDraftSchemas';
import {
  DEFAULT_SESSION_DRAFT_TTL_MS,
  SESSION_DRAFT_MAX_ENTRIES,
  SESSION_DRAFT_MAX_ENVELOPE_BYTES,
  type SessionDraftEnvelope,
  type SessionDraftIndexEntry,
  type SessionDraftMode,
  type SessionDraftRepository,
  type SessionDraftRepositoryOptions,
  type SessionDraftRemovalTarget
} from './sessionDraftTypes';

export function createSessionDraftRepository(
  area: StorageAreaService,
  options: SessionDraftRepositoryOptions = {}
): SessionDraftRepository {
  const ttlMs = options.ttlMs ?? DEFAULT_SESSION_DRAFT_TTL_MS;
  const maxEntries = options.maxEntries ?? SESSION_DRAFT_MAX_ENTRIES;
  const maxEnvelopeBytes = options.maxEnvelopeBytes ?? SESSION_DRAFT_MAX_ENVELOPE_BYTES;

  async function readIndex(now: number): Promise<{
    entries: SessionDraftIndexEntry[];
    removedKeys: string[];
    dirty: boolean;
  }> {
    const stored = await area.get<unknown>(SESSION_DRAFT_INDEX_KEY);
    if (stored === undefined) {
      return { entries: [], removedKeys: [], dirty: false };
    }
    const parsed = SessionDraftIndexSchema.safeParse(stored);
    if (!parsed.success) {
      return { entries: [], removedKeys: [], dirty: true };
    }
    return pruneSessionDraftIndexEntries(parsed.data.entries, now, maxEntries);
  }

  async function persistIndex(
    entries: SessionDraftIndexEntry[],
    removedKeys: string[],
    dirty: boolean
  ): Promise<void> {
    const uniqueKeys = Array.from(new Set(removedKeys));
    if (uniqueKeys.length > 0) {
      await area.remove(uniqueKeys);
    }
    if (dirty || uniqueKeys.length > 0) {
      await area.set(SESSION_DRAFT_INDEX_KEY, createSessionDraftIndex(entries));
    }
  }

  function ensureEnvelopeAllowed(envelope: SessionDraftEnvelope): void {
    if (containsDisallowedSessionDraftPayloadValue(envelope.payload)) {
      throw new Error('Session draft payload must not contain data:image/ strings or binary data.');
    }
    if (measureSessionDraftValueBytes(envelope) > maxEnvelopeBytes) {
      throw new Error('Session draft envelope exceeds the 512 KiB storage limit.');
    }
  }

  async function listCandidates(
    mode: SessionDraftMode,
    pageUrl: string,
    now = Date.now()
  ): Promise<SessionDraftEnvelope[]> {
    const pageKey = createSessionDraftPageKey(mode, pageUrl);
    const indexState = await readIndex(now);
    const candidates = indexState.entries.filter(
      (entry) => entry.mode === mode && entry.pageKey === pageKey
    );

    if (candidates.length === 0) {
      if (indexState.dirty || indexState.removedKeys.length > 0) {
        await persistIndex(indexState.entries, indexState.removedKeys, true);
      }
      return [];
    }

    const stored = await area.getMany<unknown>(candidates.map((entry) => entry.key));
    const valid: SessionDraftEnvelope[] = [];
    const invalidKeys = [...indexState.removedKeys];

    for (const entry of candidates) {
      const raw = stored[entry.key];
      if (raw === undefined || measureSessionDraftValueBytes(raw) > maxEnvelopeBytes) {
        invalidKeys.push(entry.key);
        continue;
      }
      const parsed = SessionDraftEnvelopeSchema.safeParse(raw);
      if (!parsed.success || containsDisallowedSessionDraftPayloadValue(parsed.data.payload)) {
        invalidKeys.push(entry.key);
        continue;
      }
      const envelope = parsed.data as SessionDraftEnvelope;
      const expectedPageKey = createSessionDraftPageKey(envelope.mode, envelope.pageUrl);
      const expectedKey = createSessionDraftStorageKey({
        mode: envelope.mode,
        pageKey: expectedPageKey,
        draftId: envelope.draftId
      });
      if (
        envelope.mode !== mode ||
        envelope.expiresAt <= now ||
        expectedPageKey !== pageKey ||
        envelope.pageKey !== expectedPageKey ||
        expectedKey !== entry.key
      ) {
        invalidKeys.push(entry.key);
        continue;
      }
      valid.push(envelope);
    }

    if (invalidKeys.length > 0 || indexState.dirty) {
      const invalidSet = new Set(invalidKeys);
      const nextEntries = indexState.entries.filter((entry) => !invalidSet.has(entry.key));
      await persistIndex(nextEntries, invalidKeys, true);
    }

    return valid.sort((left, right) => right.updatedAt - left.updatedAt);
  }

  return {
    async loadLatest(mode, pageUrl, now = Date.now()): Promise<SessionDraftEnvelope | null> {
      const candidates = await listCandidates(mode, pageUrl, now);
      return candidates[0] ?? null;
    },

    async save(envelope): Promise<void> {
      const now = Date.now();
      const normalized = normalizeSessionDraftEnvelopeForSave(envelope, ttlMs);
      ensureEnvelopeAllowed(normalized);
      const nextEntry = createSessionDraftIndexEntry(normalized);

      const indexState = await readIndex(now);
      const nextState = pruneSessionDraftIndexEntries(
        [
          nextEntry,
          ...indexState.entries.filter(
            (entry) =>
              entry.key !== nextEntry.key &&
              !(
                entry.mode === normalized.mode &&
                entry.pageKey === normalized.pageKey &&
                entry.draftId === normalized.draftId
              )
          )
        ],
        now,
        maxEntries
      );
      const storageKey = createSessionDraftStorageKey({
        mode: normalized.mode,
        pageKey: normalized.pageKey,
        draftId: normalized.draftId
      });

      await area.setMany({
        [storageKey]: normalized,
        [SESSION_DRAFT_INDEX_KEY]: createSessionDraftIndex(nextState.entries)
      });

      const removedKeys = nextState.removedKeys.filter((key) => key !== storageKey);
      if (removedKeys.length > 0 || indexState.removedKeys.length > 0) {
        await area.remove(Array.from(new Set([...indexState.removedKeys, ...removedKeys])));
      }
    },

    async remove(target: SessionDraftRemovalTarget): Promise<void> {
      const now = Date.now();
      const indexState = await readIndex(now);
      const keys = new Set<string>();
      if (typeof target === 'string' && isSessionDraftStorageKey(target)) {
        keys.add(target);
      } else if (typeof target === 'string') {
        indexState.entries
          .filter((entry) => entry.draftId === target)
          .forEach((entry) => keys.add(entry.key));
      } else {
        keys.add(target.key);
      }

      const nextEntries = indexState.entries.filter((entry) => !keys.has(entry.key));
      await persistIndex(
        nextEntries,
        [...indexState.removedKeys, ...keys],
        indexState.dirty || keys.size > 0
      );
    },

    async listCandidates(mode, pageUrl, now = Date.now()): Promise<SessionDraftEnvelope[]> {
      return listCandidates(mode, pageUrl, now);
    },

    async pruneExpired(now = Date.now()): Promise<void> {
      const indexState = await readIndex(now);
      if (!indexState.dirty && indexState.removedKeys.length === 0) {
        return;
      }
      await persistIndex(indexState.entries, indexState.removedKeys, true);
    }
  };
}
