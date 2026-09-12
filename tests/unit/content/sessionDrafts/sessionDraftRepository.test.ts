import { describe, expect, it, vi } from 'vitest';

import { createSessionDraftRepository } from '../../../../src/content/sessionDrafts/sessionDraftRepository';
import {
  createSessionDraftPageKey,
  createSessionDraftStorageKey,
  SESSION_DRAFT_LEASE_DURATION_MS,
  SESSION_DRAFT_RUNTIME_MESSAGE_TYPE,
  SessionDraftRuntimeMessageSchema,
  type SessionDraftClientEnvelope,
  type SessionDraftEnvelope,
  type SessionDraftRequest
} from '../../../../src/shared/sessionDrafts';
import type { RuntimeMessageSender } from '../../../../src/platform/interfaces/runtime';
import { asType } from '../../../utils/typeHelpers';

type RuntimeMessage = Parameters<RuntimeMessageSender>[0];

const pageUrl = 'https://example.com/article';
const key = createSessionDraftStorageKey({
  mode: 'reader',
  pageKey: createSessionDraftPageKey('reader', pageUrl),
  draftId: 'draft-1'
});

describe('session draft message repository', () => {
  it('sends strict operation envelopes and validates the operation result', async () => {
    const sender = asType<RuntimeMessageSender>(
      vi.fn(() => Promise.resolve({ outcome: 'missing' }))
    );
    const repository = createSessionDraftRepository(sender);
    await expect(repository.readExact({ operation: 'readExact', key })).resolves.toEqual({
      outcome: 'missing'
    });
    expect(sender).toHaveBeenCalledWith({
      type: SESSION_DRAFT_RUNTIME_MESSAGE_TYPE,
      request: { operation: 'readExact', key }
    });
  });

  it('rejects the reserved transport marker before domain parsing', async () => {
    const repository = createSessionDraftRepository(
      asType<RuntimeMessageSender>(() =>
        Promise.resolve({ __zendioTransportError: { code: 'MESSAGE_LISTENER_FAILED' } })
      )
    );
    await expect(repository.readExact({ operation: 'readExact', key })).rejects.toThrow(
      'SESSION_DRAFT_TRANSPORT_REJECTED'
    );
  });

  it('rejects malformed operation responses instead of widening outcomes', async () => {
    const repository = createSessionDraftRepository(
      asType<RuntimeMessageSender>(() => Promise.resolve({ outcome: 'missing', unexpected: true }))
    );
    await expect(repository.readExact({ operation: 'readExact', key })).rejects.toThrow(
      'SESSION_DRAFT_RESPONSE_INVALID'
    );
  });

  it('replays the same primary and release requests after a lost release response', async () => {
    const requests: SessionDraftRequest[] = [];
    let loseReleaseResponse = true;
    const activeEnvelope: SessionDraftEnvelope = {
      schemaVersion: 2,
      draftId: 'draft-1',
      mode: 'reader',
      pageKey: createSessionDraftPageKey('reader', pageUrl),
      pageUrl,
      pageTitle: 'Article',
      createdAt: 1,
      updatedAt: 2,
      expiresAt: 1_000,
      status: 'active',
      revision: 1,
      lease: {
        leaseId: 'lease-1',
        owner: { tabId: 9, frameId: 0 },
        renewedAt: 2,
        leaseExpiresAt: 2 + SESSION_DRAFT_LEASE_DURATION_MS
      },
      payload: { commentDrafts: { item: 'first' } }
    };
    const sender = asType<RuntimeMessageSender>((message: RuntimeMessage) => {
      const request = SessionDraftRuntimeMessageSchema.parse(message).request;
      requests.push(request);
      if (request.operation === 'save') {
        return Promise.resolve({ outcome: 'saved', revision: 1, envelope: activeEnvelope });
      }
      if (request.operation === 'releaseLease') {
        if (loseReleaseResponse) {
          loseReleaseResponse = false;
          return Promise.reject(new Error('release response lost'));
        }
        const releasedEnvelope: Record<string, unknown> = { ...activeEnvelope };
        Reflect.deleteProperty(releasedEnvelope, 'lease');
        return Promise.resolve({
          outcome: 'released',
          revision: 2,
          envelope: { ...releasedEnvelope, status: 'restorable', revision: 2 }
        });
      }
      return Promise.reject(new Error(`Unexpected operation: ${request.operation}`));
    });
    const repository = createSessionDraftRepository(sender);
    const firstDraft: SessionDraftClientEnvelope = {
      ...activeEnvelope,
      status: 'restorable',
      payload: { commentDrafts: { item: 'first' } }
    };
    const changedDraft: SessionDraftClientEnvelope = {
      ...firstDraft,
      updatedAt: 3,
      payload: { commentDrafts: { item: 'changed' } }
    };

    await expect(repository.save(firstDraft)).rejects.toThrow('release response lost');
    await expect(repository.save(changedDraft)).resolves.toMatchObject({
      status: 'restorable',
      revision: 2
    });

    const primaryRequests = requests.filter((request) => request.operation === 'save');
    const releaseRequests = requests.filter((request) => request.operation === 'releaseLease');
    expect(primaryRequests).toHaveLength(2);
    expect(primaryRequests[1]).toEqual(primaryRequests[0]);
    expect(primaryRequests[0]).toMatchObject({
      draft: { payload: { commentDrafts: { item: 'first' } } }
    });
    expect(releaseRequests).toHaveLength(2);
    expect(releaseRequests[1]).toEqual(releaseRequests[0]);
  });

  it('adopts a handed-off claim before the first controller save', async () => {
    const requests: SessionDraftRequest[] = [];
    const claimed: SessionDraftEnvelope = {
      schemaVersion: 2,
      draftId: 'claimed-draft',
      mode: 'reader',
      pageKey: createSessionDraftPageKey('reader', pageUrl),
      pageUrl,
      pageTitle: 'Claimed article',
      createdAt: 1,
      updatedAt: 2,
      expiresAt: 1_000,
      status: 'active',
      revision: 4,
      lease: {
        leaseId: 'claimed-lease',
        owner: { tabId: 9, frameId: 0 },
        renewedAt: 2,
        leaseExpiresAt: 2 + SESSION_DRAFT_LEASE_DURATION_MS
      },
      payload: { commentDrafts: { item: 'claimed' } }
    };
    const repository = createSessionDraftRepository(
      asType<RuntimeMessageSender>((message: RuntimeMessage) => {
        const request = SessionDraftRuntimeMessageSchema.parse(message).request;
        requests.push(request);
        return Promise.resolve({
          outcome: 'saved',
          revision: 5,
          envelope: {
            ...claimed,
            revision: 5,
            payload: { commentDrafts: { item: 'updated' } }
          }
        });
      })
    );
    repository.adoptClaimed(claimed);

    await repository.save(
      {
        ...claimed,
        payload: { commentDrafts: { item: 'updated' } }
      },
      { requestId: 'save-after-handoff' }
    );

    expect(requests[0]).toMatchObject({
      operation: 'save',
      expectedRevision: 4,
      leaseId: 'claimed-lease',
      draft: { payload: { commentDrafts: { item: 'updated' } } }
    });
  });

  it('replays the same primary and finalize requests after a lost finalize response', async () => {
    const requests: SessionDraftRequest[] = [];
    let loseFinalizeResponse = true;
    const active: SessionDraftEnvelope = {
      schemaVersion: 2,
      draftId: 'terminal-draft',
      mode: 'reader',
      pageKey: createSessionDraftPageKey('reader', pageUrl),
      pageUrl,
      pageTitle: 'Terminal article',
      createdAt: 1,
      updatedAt: 2,
      expiresAt: 1_000,
      status: 'active',
      revision: 1,
      lease: {
        leaseId: 'terminal-lease',
        owner: { tabId: 9, frameId: 0 },
        renewedAt: 2,
        leaseExpiresAt: 2 + SESSION_DRAFT_LEASE_DURATION_MS
      },
      payload: { commentDrafts: { item: 'first' } }
    };
    const repository = createSessionDraftRepository(
      asType<RuntimeMessageSender>((message: RuntimeMessage) => {
        const request = SessionDraftRuntimeMessageSchema.parse(message).request;
        requests.push(request);
        if (request.operation === 'save') {
          return Promise.resolve({ outcome: 'saved', revision: 1, envelope: active });
        }
        if (request.operation === 'finalizeExact') {
          if (loseFinalizeResponse) {
            loseFinalizeResponse = false;
            return Promise.reject(new Error('finalize response lost'));
          }
          return Promise.resolve({
            outcome: 'finalized',
            revision: 2,
            envelope: { ...active, status: 'discarded', revision: 2 }
          });
        }
        return Promise.reject(new Error(`Unexpected operation: ${request.operation}`));
      })
    );
    const firstDraft: SessionDraftClientEnvelope = { ...active, status: 'discarded' };
    const changedDraft: SessionDraftClientEnvelope = {
      ...firstDraft,
      status: 'exported',
      payload: { commentDrafts: { item: 'changed' } }
    };

    await expect(repository.save(firstDraft)).rejects.toThrow('finalize response lost');
    await expect(repository.save(changedDraft)).resolves.toMatchObject({
      status: 'discarded',
      revision: 2
    });

    const saves = requests.filter((request) => request.operation === 'save');
    const finalizes = requests.filter((request) => request.operation === 'finalizeExact');
    expect(saves[1]).toEqual(saves[0]);
    expect(finalizes[1]).toEqual(finalizes[0]);
    expect(finalizes[0]).toMatchObject({ status: 'discarded' });
  });
});
