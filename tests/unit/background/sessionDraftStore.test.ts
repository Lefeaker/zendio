import { describe, expect, it, vi } from 'vitest';

import type {
  EnumerableStorageAreaService,
  StorageAreaService,
  StorageValueMap
} from '../../../src/platform/interfaces/storage';
import {
  createSessionDraftStore,
  type SessionDraftStore
} from '../../../src/background/services/sessionDraftStore';
import {
  createSessionDraftIndex,
  createLegacySessionDraftPageKey,
  createSessionDraftPageKey,
  createSessionDraftStorageKey,
  compareSessionDraftText,
  SESSION_DRAFT_INDEX_KEY,
  SessionDraftEnvelopeMutationResultSchema,
  SessionDraftEnvelopeSchema,
  SessionDraftIndexSchema,
  SessionDraftReadExactResultSchema,
  SessionDraftSelectAndClaimResultSchema,
  type SessionDraftEnvelope,
  type SessionDraftFinalizeExactRequest,
  type SessionDraftOwnerLivenessProbe,
  type SessionDraftPruneRequest,
  type SessionDraftReleaseLeaseRequest,
  type SessionDraftRemoveExactRequest,
  type SessionDraftRenewLeaseRequest,
  type SessionDraftSaveRequest,
  type SessionDraftSelectAndClaimRequest,
  type SessionDraftTrustedOwnerContext
} from '../../../src/shared/sessionDrafts';

const BASE_TIME = 4_000_000;
const COLLIDING_PAGE_URLS = [
  'https://example.com/reader/1ctg9w7-1jx99je',
  'https://example.com/reader/1d2u5vn-q239ae'
] as const;
const OWNER: SessionDraftTrustedOwnerContext = { tabId: 7, frameId: 0, windowId: 2 };
const FOREIGN_OWNER: SessionDraftTrustedOwnerContext = { tabId: 8, frameId: 0 };

class Deferred<T> {
  readonly promise: Promise<T>;
  private resolvePromise: ((value: T) => void) | undefined;

  constructor() {
    this.promise = new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  resolve(value: T): void {
    const resolve = this.resolvePromise;
    if (!resolve) throw new Error('Deferred already settled.');
    this.resolvePromise = undefined;
    resolve(value);
  }
}

class FakeEnumerableStorage {
  readonly values: StorageValueMap;
  readonly setManyAttempts: StorageValueMap[] = [];
  readonly removeAttempts: string[][] = [];
  readonly area: EnumerableStorageAreaService;
  getAllCalls = 0;
  private setManyGate: Deferred<void> | undefined;
  private rejectBeforeSetMany = false;
  private rejectAfterSetMany = false;

  constructor(initial: StorageValueMap = { [SESSION_DRAFT_INDEX_KEY]: createSessionDraftIndex() }) {
    this.values = structuredClone(initial);
    this.area = {
      get: <T>(key: string): Promise<T | undefined> =>
        Promise.resolve(this.values[key] as T | undefined),
      getMany: async <T>(keys: string[]): Promise<Record<string, T | undefined>> => {
        const values: Record<string, T | undefined> = {};
        for (const key of keys) values[key] = await this.area.get<T>(key);
        return values;
      },
      getAll: (): Promise<StorageValueMap> => {
        this.getAllCalls += 1;
        return Promise.resolve(structuredClone(this.values));
      },
      set: <T>(key: string, value: T): Promise<void> => {
        this.values[key] = value;
        return Promise.resolve();
      },
      setMany: async <T>(entries: Record<string, T>): Promise<void> => {
        this.setManyAttempts.push(structuredClone(entries));
        const gate = this.setManyGate;
        this.setManyGate = undefined;
        if (gate) await gate.promise;
        if (this.rejectBeforeSetMany) {
          this.rejectBeforeSetMany = false;
          throw new Error('setMany rejected before commit');
        }
        Object.assign(this.values, entries);
        if (this.rejectAfterSetMany) {
          this.rejectAfterSetMany = false;
          throw new Error('setMany response lost after commit');
        }
      },
      remove: (keyOrKeys: string | string[]): Promise<void> => {
        const keys = Array.isArray(keyOrKeys) ? [...keyOrKeys] : [keyOrKeys];
        this.removeAttempts.push(keys);
        for (const key of keys) delete this.values[key];
        return Promise.resolve();
      },
      clear: (): Promise<void> => {
        for (const key of Object.keys(this.values)) delete this.values[key];
        return Promise.resolve();
      },
      watchKey: () => () => undefined,
      watchAll: () => () => undefined
    };
  }

  deferNextSetMany(): Deferred<void> {
    const gate = new Deferred<void>();
    this.setManyGate = gate;
    return gate;
  }

  failNextSetManyBeforeCommit(): void {
    this.rejectBeforeSetMany = true;
  }

  failNextSetManyAfterCommit(): void {
    this.rejectAfterSetMany = true;
  }
}

function saveRequest(
  draftId: string,
  requestId: string,
  options: {
    expectedRevision?: number;
    leaseId?: string;
    payload?: Record<string, string>;
    pageUrl?: string;
  } = {}
): SessionDraftSaveRequest {
  const pageUrl = options.pageUrl ?? `https://example.com/${draftId}`;
  const pageKey = createSessionDraftPageKey('reader', pageUrl);
  return {
    operation: 'save',
    requestId,
    key: createSessionDraftStorageKey({ mode: 'reader', pageKey, draftId }),
    expectedRevision: options.expectedRevision ?? null,
    ...(options.leaseId ? { leaseId: options.leaseId } : {}),
    draft: {
      draftId,
      mode: 'reader',
      pageUrl,
      pageTitle: `Draft ${draftId}`,
      payload: options.payload ?? { text: draftId }
    }
  };
}

function selectRequest(pageUrl: string, requestId: string): SessionDraftSelectAndClaimRequest {
  return { operation: 'selectAndClaim', requestId, mode: 'reader', pageUrl };
}

function createStoreHarness(
  storage = new FakeEnumerableStorage(),
  probe: SessionDraftOwnerLivenessProbe = vi.fn<SessionDraftOwnerLivenessProbe>(() =>
    Promise.resolve('inactive')
  )
): {
  store: SessionDraftStore;
  storage: FakeEnumerableStorage;
  probe: SessionDraftOwnerLivenessProbe;
  setNow(value: number): void;
} {
  let now = BASE_TIME;
  let leaseSequence = 0;
  const created = createSessionDraftStore(storage.area, {
    ownerLivenessProbe: probe,
    now: () => now,
    createLeaseId: () => `lease-${++leaseSequence}`
  });
  if (!created.ok) throw new Error(created.code);
  return {
    store: created.store,
    storage,
    probe,
    setNow: (value) => {
      now = value;
    }
  };
}

function expectSaved(result: Awaited<ReturnType<SessionDraftStore['save']>>): SessionDraftEnvelope {
  expect(result.outcome).toBe('saved');
  if (result.outcome !== 'saved' || !result.envelope) {
    throw new Error(`Expected saved envelope, received ${result.outcome}.`);
  }
  return result.envelope;
}

async function createInvalidSiblingHarness(label: string) {
  const harness = createStoreHarness();
  const validRequest = saveRequest(`valid-${label}`, `save-valid-${label}`);
  const invalidRequest = saveRequest(`invalid-${label}`, `save-invalid-${label}`);
  const validEnvelope = expectSaved(await harness.store.save(validRequest, OWNER));
  expectSaved(await harness.store.save(invalidRequest, OWNER));
  const stored = SessionDraftEnvelopeSchema.safeParse(harness.storage.values[invalidRequest.key]);
  if (!stored.success) throw new Error('Expected the invalid-sibling setup envelope.');
  const invalidValue = { ...stored.data, pageKey: `wrong-${label}` };
  harness.storage.values[invalidRequest.key] = invalidValue;
  return { ...harness, validRequest, invalidRequest, validEnvelope, invalidValue };
}

type StoreMutationResult =
  | Awaited<ReturnType<SessionDraftStore['save']>>
  | Awaited<ReturnType<SessionDraftStore['removeExact']>>
  | Awaited<ReturnType<SessionDraftStore['prune']>>
  | Awaited<ReturnType<SessionDraftStore['selectAndClaim']>>;

async function expectLostResponseReplay(
  harness: ReturnType<typeof createStoreHarness>,
  invoke: (store: SessionDraftStore) => Promise<StoreMutationResult>,
  outcome: string
): Promise<StoreMutationResult> {
  harness.storage.failNextSetManyAfterCommit();
  await expect(invoke(harness.store)).resolves.toEqual({
    outcome: 'conflict',
    code: 'STORAGE_FAILURE'
  });
  const writesAfterLoss = harness.storage.setManyAttempts.length;
  const replayed = await invoke(createStoreHarness(harness.storage).store);
  expect(replayed).toMatchObject({ outcome, replay: { replayed: true } });
  expect(harness.storage.setManyAttempts).toHaveLength(writesAfterLoss);
  return replayed;
}

describe('sessionDraftStore facade', () => {
  it('fails closed before any storage access when enumeration is unavailable', () => {
    let getCalls = 0;
    const baseOnly: StorageAreaService = {
      get: <T>(): Promise<T | undefined> => {
        getCalls += 1;
        return Promise.resolve(undefined);
      },
      getMany: () => Promise.resolve({}),
      set: () => Promise.resolve(),
      setMany: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      clear: () => Promise.resolve(),
      watchKey: () => () => undefined,
      watchAll: () => () => undefined
    };

    expect(
      createSessionDraftStore(baseOnly, {
        ownerLivenessProbe: () => Promise.resolve('inactive')
      })
    ).toEqual({ ok: false, code: 'SESSION_DRAFT_STORAGE_ENUMERATION_UNAVAILABLE' });
    expect(getCalls).toBe(0);
  });

  it('serializes independently scheduled saves of different keys and preserves both entries', async () => {
    const { store, storage } = createStoreHarness();
    const gate = storage.deferNextSetMany();
    const first = store.save(saveRequest('alpha', 'save-alpha'), OWNER);
    const second = store.save(saveRequest('beta', 'save-beta'), OWNER);

    await vi.waitFor(() => expect(storage.setManyAttempts).toHaveLength(1));
    expect(storage.values[saveRequest('alpha', 'ignored').key]).toBeUndefined();
    gate.resolve(undefined);

    expect((await first).outcome).toBe('saved');
    expect((await second).outcome).toBe('saved');
    const index = SessionDraftIndexSchema.safeParse(storage.values[SESSION_DRAFT_INDEX_KEY]);
    expect(index.success).toBe(true);
    if (!index.success) throw new Error('Expected a persisted draft index.');
    expect(index.data.entries.map((entry) => entry.key)).toEqual(
      expect.arrayContaining([
        saveRequest('alpha', 'ignored').key,
        saveRequest('beta', 'ignored').key
      ])
    );
  });

  it('isolates same-draftId lifecycle and receipts across the known page-key collision', async () => {
    const { store, storage } = createStoreHarness();
    const [leftUrl, rightUrl] = COLLIDING_PAGE_URLS;
    const left = saveRequest('shared-draft', 'save-collision-left', { pageUrl: leftUrl });
    const right = saveRequest('shared-draft', 'save-collision-right', { pageUrl: rightUrl });

    expect(left.key).not.toBe(right.key);
    const leftEnvelope = expectSaved(await store.save(left, OWNER));
    const rightEnvelope = expectSaved(await store.save(right, OWNER));
    expect(leftEnvelope.pageUrl).toBe(leftUrl);
    expect(rightEnvelope.pageUrl).toBe(rightUrl);

    const leftLease = leftEnvelope.lease?.leaseId;
    if (!leftLease) throw new Error('Expected the left collision lease.');
    await expect(
      store.finalizeExact(
        {
          operation: 'finalizeExact',
          requestId: 'finalize-collision-left',
          key: left.key,
          expectedRevision: leftEnvelope.revision,
          leaseId: leftLease,
          status: 'exported'
        },
        OWNER
      )
    ).resolves.toMatchObject({ outcome: 'finalized', envelope: { pageUrl: leftUrl } });
    await expect(
      store.removeExact(
        {
          operation: 'removeExact',
          requestId: 'remove-collision-left',
          key: left.key,
          expectedRevision: leftEnvelope.revision + 1,
          leaseId: leftLease
        },
        OWNER
      )
    ).resolves.toMatchObject({ outcome: 'removed', key: left.key });

    await expect(store.readExact({ operation: 'readExact', key: left.key })).resolves.toEqual({
      outcome: 'missing'
    });
    await expect(
      store.readExact({ operation: 'readExact', key: right.key })
    ).resolves.toMatchObject({
      outcome: 'found',
      envelope: { pageUrl: rightUrl, draftId: 'shared-draft' }
    });
    await expect(
      store.list({ operation: 'list', mode: 'reader', pageUrl: leftUrl })
    ).resolves.toMatchObject({ outcome: 'listed', envelopes: [] });
    await expect(
      store.list({ operation: 'list', mode: 'reader', pageUrl: rightUrl })
    ).resolves.toMatchObject({
      outcome: 'listed',
      envelopes: [{ pageUrl: rightUrl, draftId: 'shared-draft' }]
    });

    const index = SessionDraftIndexSchema.parse(storage.values[SESSION_DRAFT_INDEX_KEY]);
    expect(
      index.receipts.find((receipt) => receipt.requestId === 'save-collision-right')?.key
    ).toBe(right.key);
    expect(
      index.receipts.find((receipt) => receipt.requestId === 'remove-collision-left')?.key
    ).toBe(left.key);
  });

  it('retains the current envelope under a fixed-clock full-capacity tie', async () => {
    const storage = new FakeEnumerableStorage();
    let leaseSequence = 0;
    const created = createSessionDraftStore(storage.area, {
      ownerLivenessProbe: () => Promise.resolve('inactive'),
      now: () => BASE_TIME,
      createLeaseId: () => `capacity-lease-${++leaseSequence}`,
      maxEntries: 1
    });
    if (!created.ok) throw new Error(created.code);
    const requests = [
      saveRequest('capacity-alpha', 'capacity-alpha'),
      saveRequest('capacity-omega', 'capacity-omega')
    ].sort((left, right) => compareSessionDraftText(left.key, right.key));
    const first = requests[0];
    const current = requests[1];
    if (!first || !current) throw new Error('Expected two capacity requests.');
    expectSaved(await created.store.save(first, OWNER));

    const saved = expectSaved(await created.store.save(current, OWNER));
    const index = SessionDraftIndexSchema.parse(storage.values[SESSION_DRAFT_INDEX_KEY]);

    expect(saved.draftId).toBe(current.draft.draftId);
    expect(index.entries.map((entry) => entry.key)).toEqual([current.key]);
    expect(storage.values[current.key]).toEqual(saved);
    expect(storage.values[first.key]).toBeUndefined();
    expect(storage.removeAttempts.flat()).toEqual([first.key]);
  });

  it('retains the current page under a fixed-clock restorable-page tie', async () => {
    const storage = new FakeEnumerableStorage();
    let leaseSequence = 0;
    const created = createSessionDraftStore(storage.area, {
      ownerLivenessProbe: () => Promise.resolve('inactive'),
      now: () => BASE_TIME,
      createLeaseId: () => `page-lease-${++leaseSequence}`,
      retentionPolicy: { maxRestorablePages: 1 },
      maxEntries: 100
    });
    if (!created.ok) throw new Error(created.code);
    const requests = [
      saveRequest('page-alpha', 'page-alpha'),
      saveRequest('page-omega', 'page-omega')
    ].sort((left, right) => {
      const leftPage = createSessionDraftPageKey(left.draft.mode, left.draft.pageUrl);
      const rightPage = createSessionDraftPageKey(right.draft.mode, right.draft.pageUrl);
      return compareSessionDraftText(
        `${left.draft.mode}:${leftPage}`,
        `${right.draft.mode}:${rightPage}`
      );
    });
    const first = requests[0];
    const current = requests[1];
    if (!first || !current) throw new Error('Expected two page-cap requests.');
    expectSaved(await created.store.save(first, OWNER));

    const saved = expectSaved(await created.store.save(current, OWNER));
    const index = SessionDraftIndexSchema.parse(storage.values[SESSION_DRAFT_INDEX_KEY]);

    expect(index.entries.map((entry) => entry.key)).toEqual([current.key]);
    expect(storage.values[current.key]).toEqual(saved);
    expect(storage.values[first.key]).toBeUndefined();
    expect(storage.removeAttempts.flat()).toEqual([first.key]);
  });

  it('allows one same-revision save and rejects the queued stale writer without a write', async () => {
    const { store, storage } = createStoreHarness();
    const initial = expectSaved(await store.save(saveRequest('same', 'initial'), OWNER));
    const update = (requestId: string, text: string) =>
      saveRequest('same', requestId, {
        expectedRevision: initial.revision,
        leaseId: initial.lease?.leaseId,
        payload: { text }
      });
    const before = storage.setManyAttempts.length;
    const [left, right] = await Promise.all([
      store.save(update('left', 'left'), OWNER),
      store.save(update('right', 'right'), OWNER)
    ]);

    expect([left.outcome, right.outcome].sort()).toEqual(['conflict', 'saved']);
    expect(
      left.outcome === 'conflict' ? left.code : right.outcome === 'conflict' && right.code
    ).toBe('REVISION_CONFLICT');
    expect(storage.setManyAttempts).toHaveLength(before + 1);
  });

  it('does not let reads or rejected mutations eagerly clean an invalid exact sibling', async () => {
    const harness = await createInvalidSiblingHarness('isolated');
    const leaseId = harness.validEnvelope.lease?.leaseId;
    if (!leaseId) throw new Error('Expected the valid sibling lease.');
    const indexBefore = structuredClone(harness.storage.values[SESSION_DRAFT_INDEX_KEY]);
    const writesBefore = harness.storage.setManyAttempts.length;

    await expect(
      harness.store.readExact({ operation: 'readExact', key: harness.validRequest.key })
    ).resolves.toMatchObject({ outcome: 'found', envelope: { draftId: 'valid-isolated' } });
    await expect(
      harness.store.save(
        saveRequest('valid-isolated', 'stale-isolated', {
          expectedRevision: 0,
          leaseId
        }),
        OWNER
      )
    ).resolves.toEqual({ outcome: 'conflict', code: 'REVISION_CONFLICT' });
    await expect(
      harness.store.save(
        saveRequest('valid-isolated', 'foreign-isolated', {
          expectedRevision: harness.validEnvelope.revision,
          leaseId
        }),
        FOREIGN_OWNER
      )
    ).resolves.toEqual({ outcome: 'conflict', code: 'OWNER_CONFLICT' });

    expect(harness.storage.setManyAttempts).toHaveLength(writesBefore);
    expect(harness.storage.removeAttempts).toEqual([]);
    expect(harness.storage.values[harness.invalidRequest.key]).toEqual(harness.invalidValue);
    expect(harness.storage.values[SESSION_DRAFT_INDEX_KEY]).toEqual(indexBefore);
  });

  it('cleans and reports only the invalid sibling through each cleanup-capable operation', async () => {
    for (const operation of ['read', 'list', 'claim', 'prune']) {
      const harness = await createInvalidSiblingHarness(operation);
      let result: unknown;
      if (operation === 'read') {
        result = await harness.store.readExact({
          operation: 'readExact',
          key: harness.invalidRequest.key
        });
      } else if (operation === 'list') {
        result = await harness.store.list({
          operation: 'list',
          mode: 'reader',
          pageUrl: harness.invalidRequest.draft.pageUrl
        });
      } else if (operation === 'claim') {
        result = await harness.store.selectAndClaim(
          selectRequest(harness.invalidRequest.draft.pageUrl, `cleanup-${operation}`),
          OWNER
        );
      } else {
        result = await harness.store.prune({
          operation: 'prune',
          requestId: `cleanup-${operation}`
        });
      }
      expect(result).toMatchObject(
        operation === 'list'
          ? { outcome: 'listed', invalidRemovedCount: 1 }
          : operation === 'prune'
            ? { outcome: 'pruned', removedCount: 1 }
            : { outcome: 'invalid_removed', invalidRemovedCount: 1 }
      );
      expect(harness.storage.values[harness.invalidRequest.key]).toBeUndefined();
      expect(harness.storage.values[harness.validRequest.key]).toBeDefined();
      expect(harness.storage.removeAttempts.flat()).toEqual([harness.invalidRequest.key]);
    }
  });

  it('retries failed invalid cleanup once and replays it after restart without another write', async () => {
    const harness = await createInvalidSiblingHarness('retry');
    const request = selectRequest(harness.invalidRequest.draft.pageUrl, 'cleanup-retry');
    harness.storage.failNextSetManyBeforeCommit();

    await expect(harness.store.selectAndClaim(request, OWNER)).resolves.toEqual({
      outcome: 'conflict',
      code: 'STORAGE_FAILURE'
    });
    expect(harness.storage.values[harness.invalidRequest.key]).toEqual(harness.invalidValue);
    await expect(harness.store.selectAndClaim(request, OWNER)).resolves.toEqual({
      outcome: 'invalid_removed',
      invalidRemovedCount: 1
    });
    const writesAfterRetry = harness.storage.setManyAttempts.length;

    await expect(
      createStoreHarness(harness.storage).store.selectAndClaim(request, OWNER)
    ).resolves.toMatchObject({
      outcome: 'invalid_removed',
      invalidRemovedCount: 1,
      replay: { replayed: true, requiresReadExact: true }
    });
    expect(harness.storage.setManyAttempts).toHaveLength(writesAfterRetry);
  });

  it('replays the exact invalid prune count after a lost response and restart cleanup', async () => {
    const harness = await createInvalidSiblingHarness('prune-replay');
    const request: SessionDraftPruneRequest = {
      operation: 'prune',
      requestId: 'invalid-prune-replay'
    };
    harness.storage.failNextSetManyAfterCommit();

    await expect(harness.store.prune(request)).resolves.toEqual({
      outcome: 'conflict',
      code: 'STORAGE_FAILURE'
    });
    const restarted = createStoreHarness(harness.storage).store;
    await expect(restarted.prune(request)).resolves.toMatchObject({
      outcome: 'pruned',
      removedCount: 1,
      replay: { replayed: true }
    });
    const writesAfterRecovery = harness.storage.setManyAttempts.length;
    await restarted.prune(request);
    expect(harness.storage.setManyAttempts).toHaveLength(writesAfterRecovery);
  });

  it('replays a lost save response once and rejects changed-payload request-ID reuse', async () => {
    const { store, storage } = createStoreHarness();
    const request = saveRequest('lost', 'lost-response');
    storage.failNextSetManyAfterCommit();

    await expect(store.save(request, OWNER)).resolves.toEqual({
      outcome: 'conflict',
      code: 'STORAGE_FAILURE'
    });
    const writesAfterLoss = storage.setManyAttempts.length;
    const restarted = createStoreHarness(storage).store;
    const replayed = await restarted.save(request, OWNER);

    expect(replayed).toMatchObject({
      outcome: 'saved',
      revision: 1,
      replay: { replayed: true, requiresReadExact: false }
    });
    expect(storage.setManyAttempts).toHaveLength(writesAfterLoss);
    await expect(
      restarted.save(
        { ...request, draft: { ...request.draft, payload: { text: 'changed' } } },
        OWNER
      )
    ).resolves.toEqual({ outcome: 'conflict', code: 'REQUEST_ID_REUSE' });
    expect(storage.setManyAttempts).toHaveLength(writesAfterLoss);
  });

  it('returns metadata-only replay when the same revision key belongs to a recreated generation', async () => {
    const harness = createStoreHarness();
    const original = saveRequest('generation', 'generation-original', {
      payload: { text: 'original bytes' }
    });
    harness.storage.failNextSetManyAfterCommit();
    await expect(harness.store.save(original, OWNER)).resolves.toEqual({
      outcome: 'conflict',
      code: 'STORAGE_FAILURE'
    });
    const found = await harness.store.readExact({ operation: 'readExact', key: original.key });
    if (found.outcome !== 'found' || found.envelope.schemaVersion !== 2 || !found.envelope.lease) {
      throw new Error('Expected the committed original generation.');
    }
    const finalized = await harness.store.finalizeExact(
      {
        operation: 'finalizeExact',
        requestId: 'generation-finalize',
        key: original.key,
        expectedRevision: found.envelope.revision,
        leaseId: found.envelope.lease.leaseId,
        status: 'discarded'
      },
      OWNER
    );
    if (finalized.outcome !== 'finalized') throw new Error('Expected generation finalization.');
    await expect(
      harness.store.removeExact(
        {
          operation: 'removeExact',
          requestId: 'generation-remove',
          key: original.key,
          expectedRevision: finalized.revision,
          leaseId: found.envelope.lease.leaseId
        },
        OWNER
      )
    ).resolves.toMatchObject({ outcome: 'removed' });
    const recreated = expectSaved(
      await harness.store.save(
        saveRequest('generation', 'generation-recreated', {
          payload: { text: 'recreated bytes' }
        }),
        OWNER
      )
    );
    expect(recreated.revision).toBe(1);
    const writesBeforeReplay = harness.storage.setManyAttempts.length;

    const replayed = await createStoreHarness(harness.storage).store.save(original, OWNER);
    expect(replayed).toMatchObject({
      outcome: 'saved',
      revision: 1,
      replay: { replayed: true, requiresReadExact: true }
    });
    expect(replayed).not.toHaveProperty('envelope');
    expect(harness.storage.values[original.key]).toEqual(recreated);
    expect(harness.storage.setManyAttempts).toHaveLength(writesBeforeReplay);
  });

  it('durably replays lost finalize, renew, release, and claim responses after restart', async () => {
    const finalizeHarness = createStoreHarness();
    const finalizedDraft = expectSaved(
      await finalizeHarness.store.save(saveRequest('lost-finalize', 'setup-finalize'), OWNER)
    );
    const finalizeLease = finalizedDraft.lease?.leaseId;
    if (!finalizeLease) throw new Error('Expected finalize lease.');
    const finalizeRequest: SessionDraftFinalizeExactRequest = {
      operation: 'finalizeExact',
      requestId: 'lost-finalize',
      key: saveRequest('lost-finalize', 'ignored').key,
      expectedRevision: finalizedDraft.revision,
      leaseId: finalizeLease,
      status: 'exported'
    };
    await expectLostResponseReplay(
      finalizeHarness,
      (store) => store.finalizeExact(finalizeRequest, OWNER),
      'finalized'
    );

    const renewHarness = createStoreHarness();
    const renewedDraft = expectSaved(
      await renewHarness.store.save(saveRequest('lost-renew', 'setup-renew'), OWNER)
    );
    const renewLease = renewedDraft.lease?.leaseId;
    if (!renewLease) throw new Error('Expected renew lease.');
    const renewRequest: SessionDraftRenewLeaseRequest = {
      operation: 'renewLease',
      requestId: 'lost-renew',
      key: saveRequest('lost-renew', 'ignored').key,
      expectedRevision: renewedDraft.revision,
      leaseId: renewLease
    };
    await expectLostResponseReplay(
      renewHarness,
      (store) => store.renewLease(renewRequest, OWNER),
      'renewed'
    );

    const releaseHarness = createStoreHarness();
    const releasedDraft = expectSaved(
      await releaseHarness.store.save(saveRequest('lost-release', 'setup-release'), OWNER)
    );
    const releaseLease = releasedDraft.lease?.leaseId;
    if (!releaseLease) throw new Error('Expected release lease.');
    const releaseRequest: SessionDraftReleaseLeaseRequest = {
      operation: 'releaseLease',
      requestId: 'lost-release',
      key: saveRequest('lost-release', 'ignored').key,
      expectedRevision: releasedDraft.revision,
      leaseId: releaseLease
    };
    await expectLostResponseReplay(
      releaseHarness,
      (store) => store.releaseLease(releaseRequest, OWNER),
      'released'
    );

    const claimHarness = createStoreHarness();
    const claimDraft = expectSaved(
      await claimHarness.store.save(saveRequest('lost-claim', 'setup-claim'), OWNER)
    );
    const claimLease = claimDraft.lease?.leaseId;
    if (!claimLease) throw new Error('Expected claim lease.');
    await claimHarness.store.releaseLease(
      {
        operation: 'releaseLease',
        requestId: 'setup-claim-release',
        key: saveRequest('lost-claim', 'ignored').key,
        expectedRevision: claimDraft.revision,
        leaseId: claimLease
      },
      OWNER
    );
    const claimRequest = selectRequest(
      saveRequest('lost-claim', 'ignored').draft.pageUrl,
      'lost-claim'
    );
    await expectLostResponseReplay(
      claimHarness,
      (store) => store.selectAndClaim(claimRequest, FOREIGN_OWNER),
      'claimed'
    );
  });

  it('replays lost exact-remove and prune outcomes after restart cleanup without a second mutation', async () => {
    const removeHarness = createStoreHarness();
    const removeDraft = expectSaved(
      await removeHarness.store.save(saveRequest('lost-remove', 'setup-remove'), OWNER)
    );
    const removeLease = removeDraft.lease?.leaseId;
    if (!removeLease) throw new Error('Expected remove lease.');
    const finalized = await removeHarness.store.finalizeExact(
      {
        operation: 'finalizeExact',
        requestId: 'setup-remove-finalize',
        key: saveRequest('lost-remove', 'ignored').key,
        expectedRevision: removeDraft.revision,
        leaseId: removeLease,
        status: 'discarded'
      },
      OWNER
    );
    if (finalized.outcome !== 'finalized') throw new Error('Expected finalized remove setup.');
    const removeRequest: SessionDraftRemoveExactRequest = {
      operation: 'removeExact',
      requestId: 'lost-remove',
      key: saveRequest('lost-remove', 'ignored').key,
      expectedRevision: finalized.revision,
      leaseId: removeLease
    };
    removeHarness.storage.failNextSetManyAfterCommit();
    await expect(removeHarness.store.removeExact(removeRequest, OWNER)).resolves.toEqual({
      outcome: 'conflict',
      code: 'STORAGE_FAILURE'
    });
    const restartedRemove = createStoreHarness(removeHarness.storage).store;
    await expect(restartedRemove.removeExact(removeRequest, OWNER)).resolves.toMatchObject({
      outcome: 'removed',
      revision: finalized.revision,
      replay: { replayed: true, requiresReadExact: true }
    });
    const removeRecoveryWrites = removeHarness.storage.setManyAttempts.length;
    await restartedRemove.removeExact(removeRequest, OWNER);
    expect(removeHarness.storage.setManyAttempts).toHaveLength(removeRecoveryWrites);

    const pruneHarness = createStoreHarness();
    await pruneHarness.store.save(saveRequest('lost-prune', 'setup-prune'), OWNER);
    const expiredAt = BASE_TIME + 48 * 60 * 60 * 1000 + 1;
    pruneHarness.setNow(expiredAt);
    const pruneRequest: SessionDraftPruneRequest = {
      operation: 'prune',
      requestId: 'lost-prune'
    };
    pruneHarness.storage.failNextSetManyAfterCommit();
    await expect(pruneHarness.store.prune(pruneRequest)).resolves.toEqual({
      outcome: 'conflict',
      code: 'STORAGE_FAILURE'
    });
    const restartedPrune = createStoreHarness(pruneHarness.storage);
    restartedPrune.setNow(expiredAt);
    await expect(restartedPrune.store.prune(pruneRequest)).resolves.toMatchObject({
      outcome: 'pruned',
      removedCount: 1,
      replay: { replayed: true }
    });
    const pruneRecoveryWrites = pruneHarness.storage.setManyAttempts.length;
    await restartedPrune.store.prune(pruneRequest);
    expect(pruneHarness.storage.setManyAttempts).toHaveLength(pruneRecoveryWrites);
  });

  it('continues exact revision and lease rules after a clean store restart', async () => {
    const harness = createStoreHarness();
    const saved = expectSaved(await harness.store.save(saveRequest('restart', 'restart-1'), OWNER));
    const leaseId = saved.lease?.leaseId;
    if (!leaseId) throw new Error('Expected saved lease.');
    const restarted = createStoreHarness(harness.storage).store;
    const updated = await restarted.save(
      saveRequest('restart', 'restart-2', { expectedRevision: 1, leaseId }),
      OWNER
    );

    expect(updated).toMatchObject({ outcome: 'saved', revision: 2 });
    await expect(
      restarted.save(
        saveRequest('restart', 'restart-stale', { expectedRevision: 1, leaseId }),
        OWNER
      )
    ).resolves.toEqual({ outcome: 'conflict', code: 'REVISION_CONFLICT' });
  });

  it('lists only the exact mode and canonical page identity', async () => {
    const { store } = createStoreHarness();
    const request = saveRequest('listed', 'save-listed');
    await store.save(request, OWNER);

    await expect(
      store.list({ operation: 'list', mode: 'reader', pageUrl: request.draft.pageUrl })
    ).resolves.toMatchObject({
      outcome: 'listed',
      envelopes: [{ draftId: 'listed', mode: 'reader' }],
      invalidRemovedCount: 0
    });
    await expect(
      store.list({ operation: 'list', mode: 'video', pageUrl: request.draft.pageUrl })
    ).resolves.toMatchObject({ outcome: 'listed', envelopes: [] });
  });

  it('supports exact finalize/read/remove and rejects foreign or stale callers', async () => {
    const { store } = createStoreHarness();
    const saved = expectSaved(await store.save(saveRequest('terminal', 'save-terminal'), OWNER));
    const leaseId = saved.lease?.leaseId;
    if (!leaseId) throw new Error('Expected saved lease.');
    const finalize: SessionDraftFinalizeExactRequest = {
      operation: 'finalizeExact',
      requestId: 'finalize-terminal',
      key: saveRequest('terminal', 'ignored').key,
      expectedRevision: saved.revision,
      leaseId,
      status: 'exported'
    };

    await expect(store.finalizeExact(finalize, FOREIGN_OWNER)).resolves.toEqual({
      outcome: 'conflict',
      code: 'OWNER_CONFLICT'
    });
    const finalized = await store.finalizeExact(finalize, OWNER);
    expect(finalized).toMatchObject({
      outcome: 'finalized',
      revision: 2,
      envelope: { status: 'exported' }
    });
    const found = await store.readExact({ operation: 'readExact', key: finalize.key });
    expect(found).toMatchObject({
      outcome: 'found',
      envelope: { status: 'exported', revision: 2 }
    });
    await expect(
      store.removeExact(
        {
          operation: 'removeExact',
          requestId: 'remove-stale',
          key: finalize.key,
          expectedRevision: 1,
          leaseId
        },
        OWNER
      )
    ).resolves.toEqual({ outcome: 'conflict', code: 'REVISION_CONFLICT' });
    await expect(
      store.removeExact(
        {
          operation: 'removeExact',
          requestId: 'remove-terminal',
          key: finalize.key,
          expectedRevision: 2,
          leaseId
        },
        OWNER
      )
    ).resolves.toMatchObject({ outcome: 'removed', revision: 2 });
    await expect(store.readExact({ operation: 'readExact', key: finalize.key })).resolves.toEqual({
      outcome: 'missing'
    });
  });

  it('removes only one physical key when two pages reuse the same draft ID', async () => {
    const { store } = createStoreHarness();
    const firstRequest = saveRequest('shared-id', 'shared-first');
    const secondUrl = 'https://example.com/alternate-shared-id';
    const secondPageKey = createSessionDraftPageKey('reader', secondUrl);
    const secondRequest: SessionDraftSaveRequest = {
      ...firstRequest,
      requestId: 'shared-second',
      key: createSessionDraftStorageKey({
        mode: 'reader',
        pageKey: secondPageKey,
        draftId: firstRequest.draft.draftId
      }),
      draft: { ...firstRequest.draft, pageUrl: secondUrl, pageTitle: 'Alternate page' }
    };
    const first = expectSaved(await store.save(firstRequest, OWNER));
    const second = expectSaved(await store.save(secondRequest, OWNER));
    if (!first.lease) throw new Error('Expected the first exact lease.');
    const finalized = await store.finalizeExact(
      {
        operation: 'finalizeExact',
        requestId: 'shared-finalize',
        key: firstRequest.key,
        expectedRevision: first.revision,
        leaseId: first.lease.leaseId,
        status: 'discarded'
      },
      OWNER
    );
    if (finalized.outcome !== 'finalized') throw new Error('Expected shared-ID finalization.');
    await store.removeExact(
      {
        operation: 'removeExact',
        requestId: 'shared-remove',
        key: firstRequest.key,
        expectedRevision: finalized.revision,
        leaseId: first.lease.leaseId
      },
      OWNER
    );

    await expect(
      store.readExact({ operation: 'readExact', key: firstRequest.key })
    ).resolves.toEqual({ outcome: 'missing' });
    await expect(
      store.readExact({ operation: 'readExact', key: secondRequest.key })
    ).resolves.toMatchObject({ outcome: 'found', envelope: second });
  });

  it('renews then releases a lease while preserving payload and clearing ownership', async () => {
    const { store } = createStoreHarness();
    const saved = expectSaved(await store.save(saveRequest('release', 'save-release'), OWNER));
    const leaseId = saved.lease?.leaseId;
    if (!leaseId) throw new Error('Expected saved lease.');
    const renewed = await store.renewLease(
      {
        operation: 'renewLease',
        requestId: 'renew-release',
        key: saveRequest('release', 'x').key,
        expectedRevision: 1,
        leaseId
      },
      OWNER
    );
    expect(renewed).toMatchObject({
      outcome: 'renewed',
      revision: 2,
      envelope: { payload: saved.payload }
    });
    const released = await store.releaseLease(
      {
        operation: 'releaseLease',
        requestId: 'release-release',
        key: saveRequest('release', 'x').key,
        expectedRevision: 2,
        leaseId
      },
      OWNER
    );
    expect(released).toMatchObject({
      outcome: 'released',
      revision: 3,
      envelope: { status: 'restorable', payload: saved.payload }
    });
    if (released.outcome === 'released') expect(released.envelope).not.toHaveProperty('lease');
  });

  it('grants at most one concurrent claim for a restorable draft', async () => {
    const { store, storage, probe } = createStoreHarness();
    const saved = expectSaved(await store.save(saveRequest('claim', 'save-claim'), OWNER));
    const leaseId = saved.lease?.leaseId;
    if (!leaseId) throw new Error('Expected saved lease.');
    await store.releaseLease(
      {
        operation: 'releaseLease',
        requestId: 'release-claim',
        key: saveRequest('claim', 'x').key,
        expectedRevision: 1,
        leaseId
      },
      OWNER
    );
    const pageUrl = saveRequest('claim', 'x').draft.pageUrl;
    const [first, second] = await Promise.all([
      store.selectAndClaim(selectRequest(pageUrl, 'claim-first'), FOREIGN_OWNER),
      store.selectAndClaim(selectRequest(pageUrl, 'claim-second'), FOREIGN_OWNER)
    ]);

    expect([first, second].filter((result) => result.outcome === 'claimed')).toHaveLength(1);
    expect([first, second].filter((result) => result.outcome === 'none')).toHaveLength(1);
    expect(probe).not.toHaveBeenCalled();
    const writes = storage.setManyAttempts.length;
    await expect(
      store.save(
        saveRequest('claim', 'stale-after-claim', {
          expectedRevision: saved.revision,
          leaseId
        }),
        OWNER
      )
    ).resolves.toEqual({ outcome: 'conflict', code: 'REVISION_CONFLICT' });
    expect(storage.setManyAttempts).toHaveLength(writes);
  });

  it('persists and replays an exact no-claim outcome without later reusing its request ID', async () => {
    const { store, storage } = createStoreHarness();
    const request = selectRequest('https://example.com/none', 'claim-none');

    await expect(store.selectAndClaim(request, OWNER)).resolves.toEqual({
      outcome: 'none',
      invalidRemovedCount: 0
    });
    const writes = storage.setManyAttempts.length;
    const restarted = createStoreHarness(storage).store;
    await expect(restarted.selectAndClaim(request, OWNER)).resolves.toMatchObject({
      outcome: 'none',
      invalidRemovedCount: 0,
      replay: { replayed: true, requiresReadExact: true }
    });
    expect(storage.setManyAttempts).toHaveLength(writes);
    await expect(
      restarted.selectAndClaim({ ...request, pageUrl: 'https://example.com/changed' }, OWNER)
    ).resolves.toEqual({ outcome: 'conflict', code: 'REQUEST_ID_REUSE' });
    expect(storage.setManyAttempts).toHaveLength(writes);
  });

  it('fails closed for live/unavailable expired owners and claims only explicit inactivity', async () => {
    const probe = vi.fn<SessionDraftOwnerLivenessProbe>(() => Promise.resolve('active'));
    const harness = createStoreHarness(undefined, probe);
    await harness.store.save(saveRequest('expired', 'save-expired'), OWNER);
    harness.setNow(BASE_TIME + 31_000);
    const pageUrl = saveRequest('expired', 'x').draft.pageUrl;
    const writes = harness.storage.setManyAttempts.length;

    await expect(
      harness.store.selectAndClaim(selectRequest(pageUrl, 'live'), FOREIGN_OWNER)
    ).resolves.toEqual({ outcome: 'conflict', code: 'OWNER_ACTIVE' });
    expect(harness.storage.setManyAttempts).toHaveLength(writes);
    probe.mockRejectedValueOnce(new Error('unavailable'));
    await expect(
      harness.store.selectAndClaim(selectRequest(pageUrl, 'unavailable'), FOREIGN_OWNER)
    ).resolves.toEqual({ outcome: 'conflict', code: 'OWNER_LIVENESS_UNAVAILABLE' });
    expect(harness.storage.setManyAttempts).toHaveLength(writes);
    probe.mockResolvedValueOnce('inactive');
    await expect(
      harness.store.selectAndClaim(selectRequest(pageUrl, 'inactive'), FOREIGN_OWNER)
    ).resolves.toMatchObject({ outcome: 'claimed', selectionReason: 'expired_owner_inactive' });
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it('reads v1 non-destructively and migrates only on the first successful claim', async () => {
    const pageUrl = 'https://example.com/legacy';
    const pageKey = createLegacySessionDraftPageKey('reader', pageUrl);
    const key = createSessionDraftStorageKey({ mode: 'reader', pageKey, draftId: 'legacy' });
    const legacy = {
      schemaVersion: 1,
      draftId: 'legacy',
      mode: 'reader',
      pageKey,
      pageUrl,
      pageTitle: 'Legacy',
      createdAt: BASE_TIME - 10,
      updatedAt: BASE_TIME - 5,
      expiresAt: BASE_TIME + 10_000,
      status: 'active',
      payload: { ownerContext: { tabId: 3, frameId: 0 }, text: 'legacy' }
    };
    const storage = new FakeEnumerableStorage({
      [SESSION_DRAFT_INDEX_KEY]: {
        schemaVersion: 1,
        entries: [
          {
            key,
            draftId: 'legacy',
            mode: 'reader',
            pageKey,
            updatedAt: BASE_TIME - 5,
            expiresAt: BASE_TIME + 10_000,
            status: 'active'
          }
        ]
      },
      [key]: legacy
    });
    const { store, probe } = createStoreHarness(storage);

    const read = await store.readExact({ operation: 'readExact', key });
    expect(read).toMatchObject({
      outcome: 'found',
      envelope: { schemaVersion: 1, revision: 0, payload: { text: 'legacy' } }
    });
    if (read.outcome === 'found') expect(read.envelope).not.toHaveProperty('legacyOwnerContext');
    const listed = await store.list({ operation: 'list', mode: 'reader', pageUrl });
    expect(listed).toMatchObject({
      outcome: 'listed',
      envelopes: [{ schemaVersion: 1, revision: 0, payload: { text: 'legacy' } }]
    });
    if (listed.outcome === 'listed') {
      expect(listed.envelopes[0]).not.toHaveProperty('legacyOwnerContext');
    }
    expect(storage.setManyAttempts).toHaveLength(0);
    expect(storage.values[key]).toEqual(legacy);
    const claimRequest: SessionDraftSelectAndClaimRequest = {
      operation: 'selectAndClaim',
      requestId: 'claim-legacy',
      mode: 'reader',
      pageUrl
    };
    const claimed = await store.selectAndClaim(claimRequest, OWNER);
    expect(claimed).toMatchObject({
      outcome: 'claimed',
      revision: 1,
      envelope: { schemaVersion: 2, payload: { text: 'legacy' } }
    });
    expect(probe).toHaveBeenCalledWith({
      kind: 'legacy-v1',
      key,
      owner: { tabId: 3, frameId: 0 }
    });
    if (claimed.outcome === 'claimed') {
      expect(claimed.envelope?.payload).not.toHaveProperty('ownerContext');
      if (!claimed.envelope) throw new Error('Expected the migrated legacy envelope.');
      const migratedKey = createSessionDraftStorageKey({
        mode: claimed.envelope.mode,
        pageKey: claimed.envelope.pageKey,
        draftId: claimed.envelope.draftId
      });
      expect(migratedKey).not.toBe(key);
      expect(storage.values[key]).toBeUndefined();
      expect(storage.values[migratedKey]).toEqual(claimed.envelope);
      await expect(store.selectAndClaim(claimRequest, OWNER)).resolves.toMatchObject({
        outcome: 'claimed',
        revision: 1,
        replay: { replayed: true, requiresReadExact: false },
        envelope: { pageKey: claimed.envelope.pageKey }
      });
    }
  });

  it('does not report a failed setMany and the FIFO remains usable afterward', async () => {
    const { store, storage } = createStoreHarness();
    storage.failNextSetManyBeforeCommit();
    await expect(store.save(saveRequest('failed', 'failed-save'), OWNER)).resolves.toEqual({
      outcome: 'conflict',
      code: 'STORAGE_FAILURE'
    });
    expect(storage.values[saveRequest('failed', 'x').key]).toBeUndefined();
    expect(storage.removeAttempts).toHaveLength(0);
    await expect(
      store.save(saveRequest('recovered', 'recovered-save'), OWNER)
    ).resolves.toMatchObject({ outcome: 'saved', revision: 1 });
  });

  it('returns schema-serializable outcomes and rejects invalid owner/key/size without writes', async () => {
    const { store, storage } = createStoreHarness();
    const request = saveRequest('negative', 'negative-save');
    const before = storage.setManyAttempts.length;
    await expect(store.save(request, { tabId: -1, frameId: 0 })).resolves.toEqual({
      outcome: 'conflict',
      code: 'OWNER_CONTEXT_INVALID'
    });
    await expect(store.save({ ...request, key: `${request.key}.wrong` }, OWNER)).resolves.toEqual({
      outcome: 'conflict',
      code: 'STORAGE_KEY_MISMATCH'
    });
    await expect(
      store.save(
        {
          ...request,
          requestId: 'oversized',
          draft: { ...request.draft, payload: { text: 'x'.repeat(512 * 1024) } }
        },
        OWNER
      )
    ).resolves.toEqual({ outcome: 'conflict', code: 'PAYLOAD_TOO_LARGE' });
    expect(storage.setManyAttempts).toHaveLength(before);

    const saved = await store.save({ ...request, requestId: 'valid' }, OWNER);
    const read = await store.readExact({ operation: 'readExact', key: request.key });
    const selected = await store.selectAndClaim(
      {
        operation: 'selectAndClaim',
        requestId: 'none',
        mode: 'video',
        pageUrl: 'https://example.com/video'
      },
      OWNER
    );
    expect(SessionDraftEnvelopeMutationResultSchema.safeParse(saved).success).toBe(true);
    expect(SessionDraftReadExactResultSchema.safeParse(read).success).toBe(true);
    expect(SessionDraftSelectAndClaimResultSchema.safeParse(selected).success).toBe(true);
    expect(structuredClone(JSON.parse(JSON.stringify({ saved, read, selected })))).toEqual({
      saved,
      read,
      selected
    });
  });
});
