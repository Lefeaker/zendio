import { describe, expect, it, vi } from 'vitest';
import { createSessionDraftStore } from '../../../src/background/services/sessionDraftStore';
import { handleSessionDraftMessage } from '../../../src/background/listeners/sessionDraftMessages';
import { createSessionDraftOwnerLivenessProbe } from '../../../src/background/services/sessionDraftOwnerLivenessProbe';
import { createMemoryStorageArea } from '../../../src/platform/preview/memoryStorage';
import { TabsBoundaryError } from '../../../src/platform/interfaces/tabs';
import { createMessageSenderInfo } from '../../../src/platform/shared/messageListenerInvocation';
import {
  createSessionDraftStorageIdentity,
  getSessionDraftLeaseDocumentId,
  normalizeSessionDraftStoredValue,
  SESSION_DRAFT_RUNTIME_MESSAGE_TYPE,
  SessionDraftEnvelopeSchema,
  type SessionDraftEnvelope,
  type SessionDraftLease,
  type SessionDraftRequest,
  type SessionDraftSaveRequest,
  type SessionDraftSelectAndClaimRequest
} from '../../../src/shared/sessionDrafts';
import { asType } from '../../utils/typeHelpers';
import type { TabsService } from '../../../src/platform/interfaces/tabs';

const draft: SessionDraftSaveRequest['draft'] = {
  draftId: 'document-draft',
  mode: 'reader',
  pageUrl: 'https://example.com/document-owner',
  pageTitle: 'Document owner',
  payload: { commentDrafts: { note: 'Keep this note' } }
};
const key = createSessionDraftStorageIdentity(draft).key;
const saveRequest: SessionDraftSaveRequest = {
  operation: 'save',
  requestId: 'create',
  key,
  expectedRevision: null,
  draft
};

function fixture(receiver: 'alive' | 'gone' = 'alive') {
  const memory = createMemoryStorageArea();
  const keys = new Set<string>();
  const area = {
    ...memory,
    async setMany<T>(values: Record<string, T>) {
      for (const key of Object.keys(values)) keys.add(key);
      await memory.setMany(values);
    },
    async remove(value: string | string[]) {
      for (const key of typeof value === 'string' ? [value] : value) keys.delete(key);
      await memory.remove(value);
    },
    getAll: () => memory.getMany([...keys])
  };
  const sendMessage = asType<TabsService['sendMessage']>(
    vi.fn((_tab: number, message: { probeId: string }) =>
      receiver === 'gone'
        ? Promise.reject(new TabsBoundaryError('NO_RECEIVER'))
        : Promise.resolve({ probeId: message.probeId, active: false })
    )
  );
  const probe = createSessionDraftOwnerLivenessProbe({
    get: () => Promise.resolve(asType<chrome.tabs.Tab>({ id: 7 })),
    sendMessage
  });
  const created = createSessionDraftStore(area, { ownerLivenessProbe: probe });
  if (!created.ok) throw new Error(created.code);
  const send = (request: SessionDraftRequest, documentId = 'document-A') =>
    handleSessionDraftMessage(
      created.store,
      normalizeSessionDraftStoredValue({ type: SESSION_DRAFT_RUNTIME_MESSAGE_TYPE, request }),
      { tabId: 7, frameId: 0, documentId }
    );
  return { area, send, sendMessage };
}

async function saved(
  f: ReturnType<typeof fixture>
): Promise<SessionDraftEnvelope & { lease: SessionDraftLease }> {
  const result = await f.send(saveRequest);
  if (result?.outcome !== 'saved' || !result.envelope?.lease)
    throw new Error('Expected saved leased envelope');
  return { ...result.envelope, lease: result.envelope.lease };
}

describe('session draft document ownership', () => {
  it('retains the browser-supplied document identity at the message boundary', () => {
    expect(
      createMessageSenderInfo({ tab: { id: 7 }, frameId: 0, documentId: 'document-A' })
    ).toMatchObject({ tabId: 7, documentId: 'document-A' });
  });

  it('binds an opaque lease without changing persisted schema-v2 owner fields', async () => {
    const f = fixture();
    const envelope = await saved(f);
    expect(getSessionDraftLeaseDocumentId(envelope.lease.leaseId)).toBe('document-A');
    expect(envelope.lease?.owner).toEqual({ tabId: 7, frameId: 0 });
    expect(SessionDraftEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it('rejects a new document reusing the same tab, revision and old lease', async () => {
    const f = fixture();
    const envelope = await saved(f);
    await expect(
      f.send(
        {
          ...saveRequest,
          requestId: 'new-document-write',
          expectedRevision: 1,
          leaseId: envelope.lease.leaseId,
          draft: { ...draft, payload: { commentDrafts: { note: 'Wrong document' } } }
        },
        'document-B'
      )
    ).resolves.toEqual({ outcome: 'conflict', code: 'OWNER_CONFLICT' });
    await expect(f.area.get(key)).resolves.toMatchObject({ payload: draft.payload });
  });

  it('recovers a missing document immediately by probing its exact document id', async () => {
    const f = fixture('gone');
    await saved(f);
    const result = await f.send(
      {
        operation: 'selectAndClaim',
        requestId: 'new-document-claim',
        mode: 'reader',
        pageUrl: draft.pageUrl
      },
      'document-B'
    );
    expect(result).toMatchObject({ outcome: 'claimed', envelope: { payload: draft.payload } });
    expect(f.sendMessage).toHaveBeenCalledWith(7, expect.anything(), {
      frameId: 0,
      documentId: 'document-A'
    });
  });

  it('does not steal a newly granted lease before its live document registers the response', async () => {
    const f = fixture();
    const envelope = await saved(f);
    await f.send({
      operation: 'releaseLease',
      requestId: 'release',
      key,
      expectedRevision: 1,
      leaseId: envelope.lease.leaseId
    });
    const claim: Omit<SessionDraftSelectAndClaimRequest, 'requestId'> = {
      operation: 'selectAndClaim',
      mode: 'reader',
      pageUrl: draft.pageUrl
    };
    const results = await Promise.all([
      f.send({ ...claim, requestId: 'first' }, 'document-B'),
      f.send({ ...claim, requestId: 'second' }, 'document-C')
    ]);
    expect(results.filter((r) => r?.outcome === 'claimed')).toHaveLength(1);
    expect(results.filter((r) => r?.outcome === 'conflict')).toHaveLength(1);
  });
});
