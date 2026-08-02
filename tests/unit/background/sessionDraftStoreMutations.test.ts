import { describe, expect, it } from 'vitest';

import {
  claimSessionDraftTransition,
  mutateSessionDraftLeaseTransition,
  saveSessionDraftTransition,
  validateSessionDraftRemoveTransition
} from '../../../src/background/services/sessionDraftStoreMutations';
import {
  createLegacySessionDraftPageKey,
  createSessionDraftPageKey,
  createSessionDraftStorageKey
} from '../../../src/shared/sessionDrafts/keys';
import type {
  SessionDraftFinalizeExactRequest,
  SessionDraftReleaseLeaseRequest,
  SessionDraftRemoveExactRequest,
  SessionDraftRenewLeaseRequest,
  SessionDraftSaveRequest
} from '../../../src/shared/sessionDrafts/messages';
import {
  SESSION_DRAFT_LEASE_DURATION_MS,
  type SessionDraftEnvelope,
  type SessionDraftLegacyRecord,
  type SessionDraftTrustedOwnerContext
} from '../../../src/shared/sessionDrafts/types';

const NOW = 2_000_000;
const RETENTION_MS = 48 * 60 * 60 * 1000;
const OWNER: SessionDraftTrustedOwnerContext = { tabId: 7, frameId: 0, windowId: 4 };
const FOREIGN_OWNER: SessionDraftTrustedOwnerContext = { tabId: 8, frameId: 0 };

function saveRequest(overrides: Partial<SessionDraftSaveRequest> = {}): SessionDraftSaveRequest {
  const pageUrl = 'https://example.com/article';
  const pageKey = createSessionDraftPageKey('reader', pageUrl);
  return {
    operation: 'save',
    requestId: 'save-1',
    key: createSessionDraftStorageKey({ mode: 'reader', pageKey, draftId: 'draft-1' }),
    expectedRevision: null,
    draft: {
      draftId: 'draft-1',
      mode: 'reader',
      pageUrl,
      pageTitle: 'Article',
      payload: { notes: ['one'] }
    },
    ...overrides
  };
}

function activeEnvelope(overrides: Partial<SessionDraftEnvelope> = {}): SessionDraftEnvelope {
  const request = saveRequest();
  return {
    schemaVersion: 2,
    revision: 1,
    draftId: request.draft.draftId,
    mode: request.draft.mode,
    pageKey: createSessionDraftPageKey(request.draft.mode, request.draft.pageUrl),
    pageUrl: request.draft.pageUrl,
    pageTitle: request.draft.pageTitle,
    createdAt: NOW - 1_000,
    updatedAt: NOW - 500,
    expiresAt: NOW + RETENTION_MS,
    status: 'active',
    payload: request.draft.payload,
    lease: {
      leaseId: 'lease-1',
      owner: OWNER,
      renewedAt: NOW - 500,
      leaseExpiresAt: NOW - 500 + SESSION_DRAFT_LEASE_DURATION_MS
    },
    ...overrides
  };
}

function legacyRecord(overrides: Partial<SessionDraftLegacyRecord> = {}): SessionDraftLegacyRecord {
  const current = activeEnvelope();
  return {
    schemaVersion: 1,
    revision: 0,
    draftId: current.draftId,
    mode: current.mode,
    pageKey: createLegacySessionDraftPageKey(current.mode, current.pageUrl),
    pageUrl: current.pageUrl,
    pageTitle: current.pageTitle,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    expiresAt: current.expiresAt,
    status: 'active',
    payload: current.payload,
    legacyOwnerContext: OWNER,
    ...overrides
  };
}

const context = {
  now: NOW,
  retentionMs: RETENTION_MS,
  owner: OWNER,
  newLeaseId: 'lease-new'
};

function expectSuccess(
  result: ReturnType<typeof saveSessionDraftTransition>
): SessionDraftEnvelope {
  expect(result.outcome).toBe('success');
  if (result.outcome !== 'success') throw new Error(`Expected success, got ${result.code}`);
  return result.envelope;
}

describe('sessionDraftStoreMutations', () => {
  it('creates revision one only for a null expected revision and exact physical identity', () => {
    const created = expectSuccess(saveSessionDraftTransition(undefined, saveRequest(), context));

    expect(created).toMatchObject({
      schemaVersion: 2,
      revision: 1,
      status: 'active',
      updatedAt: NOW,
      expiresAt: NOW + RETENTION_MS,
      lease: {
        leaseId: 'lease-new',
        owner: OWNER,
        renewedAt: NOW,
        leaseExpiresAt: NOW + SESSION_DRAFT_LEASE_DURATION_MS
      }
    });
    expect(
      saveSessionDraftTransition(undefined, saveRequest({ expectedRevision: 1 }), context)
    ).toEqual({ outcome: 'conflict', code: 'DRAFT_NOT_FOUND' });
    expect(
      saveSessionDraftTransition(
        undefined,
        saveRequest({ key: 'aiob.sessionDraft.v1.reader.wrong.draft-1' }),
        context
      )
    ).toEqual({ outcome: 'conflict', code: 'STORAGE_KEY_MISMATCH' });
  });

  it('updates an active draft once and rejects stale, missing, foreign, and terminal leases', () => {
    const current = activeEnvelope();
    const request = saveRequest({
      requestId: 'save-2',
      expectedRevision: 1,
      leaseId: 'lease-1',
      draft: { ...saveRequest().draft, pageTitle: 'Updated', payload: { notes: ['two'] } }
    });
    const saved = expectSuccess(saveSessionDraftTransition(current, request, context));

    expect(saved).toMatchObject({
      revision: 2,
      pageTitle: 'Updated',
      payload: { notes: ['two'] },
      lease: { leaseId: 'lease-1', renewedAt: NOW }
    });
    expect(saveSessionDraftTransition(saved, request, context)).toEqual({
      outcome: 'conflict',
      code: 'REVISION_CONFLICT'
    });
    expect(
      saveSessionDraftTransition(current, { ...request, leaseId: undefined }, context)
    ).toEqual({ outcome: 'conflict', code: 'LEASE_REQUIRED' });
    expect(
      saveSessionDraftTransition(current, { ...request, leaseId: 'foreign' }, context)
    ).toEqual({ outcome: 'conflict', code: 'LEASE_CONFLICT' });
    expect(
      saveSessionDraftTransition(current, request, { ...context, owner: FOREIGN_OWNER })
    ).toEqual({ outcome: 'conflict', code: 'OWNER_CONFLICT' });
    expect(
      saveSessionDraftTransition({ ...current, status: 'exported' }, request, context)
    ).toEqual({ outcome: 'conflict', code: 'TERMINAL_DRAFT' });
  });

  it('migrates legacy restorable/same-owner saves without retaining payload owner metadata', () => {
    const request = saveRequest({ expectedRevision: 0 });
    const sameOwner = expectSuccess(saveSessionDraftTransition(legacyRecord(), request, context));
    const restorable = expectSuccess(
      saveSessionDraftTransition(
        legacyRecord({ status: 'restorable', legacyOwnerContext: undefined }),
        request,
        context
      )
    );

    expect(sameOwner).toMatchObject({ schemaVersion: 2, revision: 1, lease: { owner: OWNER } });
    expect(sameOwner.pageKey).toBe(
      createSessionDraftPageKey(request.draft.mode, request.draft.pageUrl)
    );
    expect(sameOwner.pageKey).not.toBe(legacyRecord().pageKey);
    expect(restorable).toMatchObject({ schemaVersion: 2, revision: 1, status: 'active' });
    expect(sameOwner.payload).not.toHaveProperty('ownerContext');
    expect(sameOwner).not.toHaveProperty('legacyOwnerContext');
    expect(
      saveSessionDraftTransition(
        legacyRecord({ legacyOwnerContext: FOREIGN_OWNER }),
        request,
        context
      )
    ).toEqual({ outcome: 'conflict', code: 'OWNER_CONFLICT' });
    expect(
      saveSessionDraftTransition(legacyRecord(), { ...request, leaseId: 'legacy-lease' }, context)
    ).toEqual({ outcome: 'conflict', code: 'LEASE_CONFLICT' });
  });

  it('renews, finalizes, and releases through exact revision/lease transitions', () => {
    const current = activeEnvelope();
    const exact = {
      requestId: 'exact-1',
      key: saveRequest().key,
      expectedRevision: 1,
      leaseId: 'lease-1'
    };
    const renew: SessionDraftRenewLeaseRequest = { operation: 'renewLease', ...exact };
    const renewed = mutateSessionDraftLeaseTransition(current, renew, context);
    expect(renewed.outcome).toBe('success');
    if (renewed.outcome !== 'success') return;
    expect(renewed.envelope).toMatchObject({
      revision: 2,
      status: 'active',
      payload: current.payload,
      lease: { leaseId: 'lease-1', renewedAt: NOW }
    });

    const finalize: SessionDraftFinalizeExactRequest = {
      operation: 'finalizeExact',
      ...exact,
      status: 'exported'
    };
    const finalized = mutateSessionDraftLeaseTransition(current, finalize, context);
    expect(finalized.outcome).toBe('success');
    if (finalized.outcome !== 'success') return;
    expect(finalized.envelope).toMatchObject({ revision: 2, status: 'exported' });

    const release: SessionDraftReleaseLeaseRequest = { operation: 'releaseLease', ...exact };
    const released = mutateSessionDraftLeaseTransition(current, release, context);
    expect(released.outcome).toBe('success');
    if (released.outcome !== 'success') return;
    expect(released.envelope).toMatchObject({ revision: 2, status: 'restorable' });
    expect('lease' in released.envelope).toBe(false);
  });

  it('allows exact removal only after terminal finalization by the current lease owner', () => {
    const terminal = activeEnvelope({ revision: 2, status: 'discarded' });
    const request: SessionDraftRemoveExactRequest = {
      operation: 'removeExact',
      requestId: 'remove-1',
      key: saveRequest().key,
      expectedRevision: 2,
      leaseId: 'lease-1'
    };

    expect(validateSessionDraftRemoveTransition(terminal, request, OWNER)).toBeUndefined();
    expect(validateSessionDraftRemoveTransition(activeEnvelope(), request, OWNER)).toBe(
      'TERMINAL_REQUIRED'
    );
    expect(
      validateSessionDraftRemoveTransition(terminal, { ...request, expectedRevision: 1 }, OWNER)
    ).toBe('REVISION_CONFLICT');
    expect(validateSessionDraftRemoveTransition(terminal, request, FOREIGN_OWNER)).toBe(
      'OWNER_CONFLICT'
    );
  });

  it('claims v1/v2 records with one monotonic revision', () => {
    const legacy = legacyRecord({ status: 'restorable', legacyOwnerContext: undefined });
    const current = activeEnvelope({
      status: 'restorable',
      lease: undefined,
      revision: 3
    });
    const legacyClaim = claimSessionDraftTransition(legacy, context);
    const currentClaim = claimSessionDraftTransition(current, context);

    expect(legacyClaim.outcome).toBe('success');
    expect(currentClaim.outcome).toBe('success');
    if (legacyClaim.outcome !== 'success' || currentClaim.outcome !== 'success') return;
    expect(legacyClaim.envelope).toMatchObject({ schemaVersion: 2, revision: 1 });
    expect(legacyClaim.envelope.pageKey).toBe(
      createSessionDraftPageKey(legacy.mode, legacy.pageUrl)
    );
    expect(legacyClaim.envelope).not.toHaveProperty('legacyOwnerContext');
    expect(currentClaim.envelope).toMatchObject({ schemaVersion: 2, revision: 4 });
    expect(claimSessionDraftTransition(activeEnvelope({ status: 'exported' }), context)).toEqual({
      outcome: 'conflict',
      code: 'TERMINAL_DRAFT'
    });
  });
});
