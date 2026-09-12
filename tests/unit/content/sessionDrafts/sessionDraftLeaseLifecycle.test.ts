import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionDraftLeaseLifecycle } from '../../../../src/content/sessionDrafts/sessionDraftTabContext';
import { createSessionDraftLeaseOwnerRegistry } from '../../../../src/content/sessionDrafts/sessionDraftLeaseOwnerRegistry';
import {
  createSessionDraftPageKey,
  createSessionDraftStorageKey,
  SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS,
  type SessionDraftEnvelope,
  type SessionDraftEnvelopeMutationResult
} from '../../../../src/shared/sessionDrafts';

function deferred<Result>() {
  let resolve!: (result: Result) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Result>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function envelope(revision = 1, leaseId = 'lease-1'): SessionDraftEnvelope {
  const pageUrl = 'https://example.com/recovery';
  return {
    schemaVersion: 2,
    draftId: 'recovery-draft',
    mode: 'reader',
    pageKey: createSessionDraftPageKey('reader', pageUrl),
    pageUrl,
    pageTitle: 'Recovery',
    createdAt: 1,
    updatedAt: revision,
    expiresAt: 1_000_000,
    status: 'active',
    revision,
    lease: {
      leaseId,
      owner: { tabId: 7, frameId: 0 },
      renewedAt: revision,
      leaseExpiresAt: 100_000
    },
    payload: { commentDrafts: { item: 'Unsaved note' } }
  };
}

function fixture() {
  const renewal = deferred<SessionDraftEnvelopeMutationResult>();
  const release = deferred<SessionDraftEnvelopeMutationResult>();
  const repository = {
    renewLease: vi.fn(() => renewal.promise),
    releaseLease: vi.fn(() => release.promise)
  };
  const registry = createSessionDraftLeaseOwnerRegistry();
  const onAccepted = vi.fn();
  const lifecycle = createSessionDraftLeaseLifecycle({
    mode: 'reader',
    repository,
    registry,
    onAccepted,
    warningPrefix: '[ReaderSession]'
  });
  const initial = envelope();
  const key = createSessionDraftStorageKey(initial);
  lifecycle.accept(initial);
  return { lifecycle, repository, registry, renewal, release, initial, key, onAccepted };
}

describe('session draft lease asynchronous lifetime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not resurrect a cleared owner when an earlier renewal response arrives', async () => {
    const f = fixture();
    await vi.advanceTimersByTimeAsync(SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS);
    expect(f.repository.renewLease).toHaveBeenCalledTimes(1);
    f.lifecycle.clear();
    f.onAccepted.mockClear();
    f.renewal.resolve({ outcome: 'renewed', revision: 2, envelope: envelope(2) });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.lifecycle.current).toBeNull();
    expect(f.onAccepted).not.toHaveBeenCalled();
    expect(f.registry.owns(f.key, 'lease-1')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves a newer saved revision when a stale renewal response arrives', async () => {
    const f = fixture();
    await vi.advanceTimersByTimeAsync(SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS);
    f.lifecycle.accept(envelope(3));
    f.renewal.resolve({ outcome: 'renewed', revision: 2, envelope: envelope(2) });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.lifecycle.current?.revision).toBe(3);
    expect(f.onAccepted).toHaveBeenLastCalledWith(envelope(3), f.key);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('does not replace a newly accepted lease with a delayed release response', async () => {
    const f = fixture();
    const pending = f.lifecycle.release();
    f.lifecycle.accept(envelope(3, 'new-lease'));
    const released = envelope(2);
    delete released.lease;
    released.status = 'restorable';
    f.release.resolve({ outcome: 'released', revision: 2, envelope: released });
    await pending;
    expect(f.lifecycle.current).toEqual(envelope(3, 'new-lease'));
    expect(f.registry.owns(f.key, 'new-lease')).toBe(true);
    expect(f.onAccepted).toHaveBeenLastCalledWith(envelope(3, 'new-lease'), f.key);
  });

  it('releases using the committed renewal revision when page teardown overlaps its reply', async () => {
    const f = fixture();
    await vi.advanceTimersByTimeAsync(SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS);
    const releasing = f.lifecycle.release();
    expect(f.repository.releaseLease).not.toHaveBeenCalled();
    f.renewal.resolve({ outcome: 'renewed', revision: 2, envelope: envelope(2) });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.repository.releaseLease).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 2 })
    );
    const released: SessionDraftEnvelope = { ...envelope(3), status: 'restorable' };
    delete released.lease;
    f.release.resolve({ outcome: 'released', revision: 3, envelope: released });
    await releasing;
    expect(f.lifecycle.current?.status).toBe('restorable');
  });

  it('does not schedule renewals for a committed terminal draft awaiting cleanup', () => {
    const f = fixture();
    f.lifecycle.accept({ ...envelope(2), status: 'discarded' });
    expect(f.registry.owns(f.key, 'lease-1')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops retries after the extension context has been invalidated', async () => {
    const f = fixture();
    await vi.advanceTimersByTimeAsync(SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS);
    f.renewal.reject(new Error('Extension context invalidated.'));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.registry.owns(f.key, 'lease-1')).toBe(false);
  });
});
