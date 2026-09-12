/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../setup/globalSetup';
import {
  __resetContentSessionRegistryForTests,
  isReaderSessionActive
} from '@content/runtime/contentSessionRegistry';
import { DEFAULT_SESSION_MESSAGES } from '@content/reader/sessionMessages';
import type { SessionDraftClientEnvelope } from '@shared/sessionDrafts';
import {
  createSessionContext,
  flushDraftPersistence,
  getDraftIdentity,
  getSessionHarness,
  readStoredReaderDraft
} from './readerSessionTestHarness';

async function createPersistedSession() {
  const context = createSessionContext();
  await context.session.initialize();
  const wrapper = document.createElement('mark');
  wrapper.className = 'aiob-reader-highlight';
  wrapper.dataset.readerHighlightId = 'recovery-highlight';
  wrapper.textContent = 'Preserve this highlight';
  document.body.append(wrapper);
  getSessionHarness(context.session).__setTestHighlights([
    {
      id: 'recovery-highlight',
      selectedHtml: '<span>Preserve this highlight</span>',
      selectedText: 'Preserve this highlight',
      comment: 'Preserve this comment',
      fragmentUrl: '#recovery-highlight',
      wrapper
    }
  ]);
  context.emitCommentDraftChange({});
  await flushDraftPersistence();
  const key = getDraftIdentity(context.session).draftStorageKey;
  const callbacks = context.getCallbacks();
  if (!key || !callbacks) throw new Error('Persisted Reader fixture missing');
  return { context, key, callbacks };
}

describe('ReaderSession terminal recovery through the background store', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetContentSessionRegistryForTests(document);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('saves a new note after an in-flight renewal has committed but not acknowledged', async () => {
    const { context, key } = await createPersistedSession();
    const repository = context.draftRepository;
    const read = await repository.readExact({ operation: 'readExact', key });
    if (read.outcome !== 'found' || read.envelope.schemaVersion !== 2 || !read.envelope.lease) {
      throw new Error('Expected a leased draft');
    }
    const initial = read.envelope;
    const delayed = context.draftMessages.deferNextResponse('renewLease');
    const renewal = repository.renewLease({
      operation: 'renewLease',
      requestId: 'renew-before-user-edit',
      key,
      expectedRevision: initial.revision,
      leaseId: read.envelope.lease.leaseId
    });
    await vi.waitFor(async () => {
      await expect(readStoredReaderDraft(context, key)).resolves.toMatchObject({
        revision: initial.revision + 1
      });
    });
    const next: SessionDraftClientEnvelope = {
      ...initial,
      schemaVersion: 2,
      payload: { ...initial.payload, commentDrafts: { 'recovery-highlight': 'New user note' } }
    };
    const save = repository.save(next);
    delayed.resolve();
    await renewal;
    await expect(save).resolves.toMatchObject({
      revision: initial.revision + 2,
      payload: { commentDrafts: { 'recovery-highlight': 'New user note' } }
    });
  });

  it('does not rewind the revision cache when an older read arrives after a save', async () => {
    const { context, key } = await createPersistedSession();
    const repository = context.draftRepository;
    const read = await repository.readExact({ operation: 'readExact', key });
    if (read.outcome !== 'found' || read.envelope.schemaVersion !== 2)
      throw new Error('Missing draft');
    const initial = read.envelope;
    const delayed = context.draftMessages.deferNextResponse('readExact');
    const staleRead = repository.readExact({ operation: 'readExact', key });
    await vi.advanceTimersByTimeAsync(0);
    const next: SessionDraftClientEnvelope = {
      ...initial,
      schemaVersion: 2,
      payload: { ...initial.payload, commentDrafts: { 'recovery-highlight': 'First edit' } }
    };
    await repository.save(next);
    delayed.resolve();
    await staleRead;
    await expect(
      repository.save({
        ...next,
        payload: { ...next.payload, commentDrafts: { 'recovery-highlight': 'Second edit' } }
      })
    ).resolves.toMatchObject({ revision: initial.revision + 2 });
  });

  it('finishes cancel on retry after the removal committed but its response was lost', async () => {
    const { context, key, callbacks } = await createPersistedSession();
    context.draftMessages.loseNextResponse('removeExact', new Error('committed response lost'));
    callbacks.onCancel();
    await vi.waitFor(() =>
      expect(context.view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure)
    );
    await expect(readStoredReaderDraft(context, key)).resolves.toBeUndefined();
    expect(context.view.destroy).not.toHaveBeenCalled();

    callbacks.onCancel();
    await vi.waitFor(() => expect(context.view.destroy).toHaveBeenCalledTimes(1));
    expect(isReaderSessionActive(document)).toBe(false);
    await expect(readStoredReaderDraft(context, key)).resolves.toBeUndefined();
  });

  it('reconciles a lost finalize reply after the committed terminal record was already cleaned', async () => {
    const { context, key, callbacks } = await createPersistedSession();
    context.draftMessages.loseNextResponse('finalizeExact', new Error('finalize response lost'));
    await callbacks.onFinish();
    const read = await context.draftRepository.readExact({ operation: 'readExact', key });
    if (read.outcome !== 'found' || read.envelope.schemaVersion !== 2 || !read.envelope.lease)
      throw new Error('Terminal record missing');
    expect(read.envelope.status).toBe('exported');
    await context.draftRepository.removeExact({
      operation: 'removeExact',
      requestId: 'maintenance-removal',
      key,
      expectedRevision: read.envelope.revision,
      leaseId: read.envelope.lease.leaseId
    });
    await callbacks.onFinish();
    expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    expect(context.view.destroy).toHaveBeenCalledTimes(1);
  });

  it.each(['before removal', 'after removal'])(
    'does not export twice when cleanup fails %s and the user retries',
    async (failure) => {
      const { context, key, callbacks } = await createPersistedSession();
      if (failure === 'before removal') {
        context.draftMessages.rejectNext('removeExact', new Error('cleanup transport failure'));
      } else {
        context.draftMessages.loseNextResponse('removeExact', new Error('committed response lost'));
      }
      await callbacks.onFinish();
      expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
      expect(context.view.destroy).not.toHaveBeenCalled();
      if (failure === 'before removal') {
        await expect(readStoredReaderDraft(context, key)).resolves.toMatchObject({
          status: 'exported'
        });
      } else {
        await expect(readStoredReaderDraft(context, key)).resolves.toBeUndefined();
      }

      await callbacks.onFinish();
      expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
      expect(context.view.destroy).toHaveBeenCalledTimes(1);
      expect(isReaderSessionActive(document)).toBe(false);
      await expect(readStoredReaderDraft(context, key)).resolves.toBeUndefined();
    }
  );
});
