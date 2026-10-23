/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../setup/globalSetup';
import { ClipSaveError, createClipSaveFailure } from '@shared/types/clipResult';
import {
  __resetContentSessionRegistryForTests,
  isReaderSessionActive
} from '@content/runtime/contentSessionRegistry';
import { DEFAULT_SESSION_MESSAGES } from '@content/reader/sessionMessages';
import {
  createSessionDraftStorageKey,
  type SessionDraftClientEnvelope
} from '@shared/sessionDrafts';
import { buildReaderSessionDraftEnvelope } from '@content/reader/sessionDrafts';
import {
  createSessionContext,
  createSelectionPayload,
  createPersistedHighlightRecord,
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
  it.each([
    'continue',
    'edit',
    'missing-snapshot',
    'persist-failure',
    'lost-ack',
    'fresh-progress'
  ] as const)(
    'retains confirmed progress and respects %s before another dispatch',
    async (scenario) => {
      const startedAt = new Date(2026, 9, 15, 23, 59, 59).getTime();
      const { context, key, callbacks } = await createPersistedSession();
      vi.setSystemTime(startedAt);
      context.dispatchClipResult.mockImplementationOnce((payload) => {
        const operationId = payload.meta?.operationId;
        if (!operationId) throw new Error('Missing attempt ID');
        return Promise.reject(
          new ClipSaveError(
            createClipSaveFailure('unknown', 'write', 'attachments', {
              operationId,
              planId: 'a'.repeat(64),
              total: 2,
              phase: 'attachments',
              storageTarget: 'downloads',
              confirmed: [
                {
                  id: 'shot-1',
                  outputPath: 'note/one.jpg',
                  download: { id: 1, filename: '/downloads/note/one.jpg' }
                }
              ]
            })
          )
        );
      });
      await callbacks.onFinish();
      await callbacks.onFinish();
      expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
      await expect(readStoredReaderDraft(context, key)).resolves.toMatchObject({
        payload: { exportAttempt: { attachmentProgress: { total: 2 } } }
      });
      const api = getSessionHarness(context.session);
      if (scenario === 'edit') {
        const edit = callbacks.onSubmitHighlightEdit('recovery-highlight', 'Newer content');
        await flushDraftPersistence();
        await edit;
      }
      if (scenario === 'missing-snapshot') api.state.frozenExportPayload = undefined;
      if (scenario === 'persist-failure')
        context.draftMessages.rejectNext('save', new Error('Cannot persist attempt'));
      if (scenario === 'lost-ack' || scenario === 'fresh-progress') {
        context.dispatchClipResult.mockImplementationOnce(async (payload) => {
          expect(
            (await readStoredReaderDraft(context, key))?.payload.exportAttempt?.attachmentProgress
              ?.blocked
          ).toBe(true);
          const progress = payload.meta?.attachmentProgress;
          expect(progress?.blocked).toBeUndefined();
          throw new ClipSaveError(
            createClipSaveFailure(
              'unknown',
              'connection',
              'note',
              scenario === 'fresh-progress' && progress
                ? {
                    ...progress,
                    phase: 'note',
                    confirmed: [...progress.confirmed, { id: 'shot-2', outputPath: 'note/two.jpg' }]
                  }
                : undefined
            )
          );
        });
      }
      api.state.exportRecoveryAction = 'continue';
      vi.setSystemTime(startedAt + 2000);
      await callbacks.onFinish();
      if (scenario === 'lost-ack' || scenario === 'fresh-progress') {
        expect(context.dispatchClipResult).toHaveBeenCalledTimes(2);
        const stored = await readStoredReaderDraft(context, key);
        expect(stored?.payload.exportAttempt?.attachmentProgress?.blocked).toBe(
          scenario === 'lost-ack' ? true : undefined
        );
        api.state.exportRecoveryAction = 'continue';
        await callbacks.onFinish();
        expect(context.dispatchClipResult).toHaveBeenCalledTimes(scenario === 'lost-ack' ? 2 : 3);
        if (scenario === 'lost-ack') {
          expect(api.state.frozenExportPayload).toBeUndefined();
          api.state.exportRecoveryAction = 'confirm-saved';
          await callbacks.onFinish();
          expect(context.dispatchClipResult).toHaveBeenCalledTimes(2);
        }
        expect(isReaderSessionActive(document)).toBe(false);
      } else if (scenario === 'continue') {
        expect(context.dispatchClipResult).toHaveBeenCalledTimes(2);
        const first = context.dispatchClipResult.mock.calls[0]?.[0];
        const second = context.dispatchClipResult.mock.calls[1]?.[0];
        expect(second?.markdown).toBe(first?.markdown);
        expect(second?.meta?.operationId).toBe(first?.meta?.operationId);
        expect(first?.meta?.exportStartedAt).toBe(startedAt);
        expect(second?.meta?.exportStartedAt).toBe(startedAt);
        expect(second?.meta?.attachmentProgress?.confirmed).toHaveLength(1);
        await expect(readStoredReaderDraft(context, key)).resolves.toBeUndefined();
      } else {
        expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
        expect(api.state.exportAttempt?.attachmentProgress?.confirmed).toHaveLength(1);
        expect(isReaderSessionActive(document)).toBe(true);
      }
    }
  );
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetContentSessionRegistryForTests(document);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('persists an uncertain export before dispatch and never repeats it on ordinary Finish', async () => {
    const { context, key, callbacks } = await createPersistedSession();
    context.dispatchClipResult.mockImplementationOnce(async () => {
      expect((await readStoredReaderDraft(context, key))?.payload.exportAttempt).toMatchObject({
        outcome: 'unknown'
      });
      throw new ClipSaveError(createClipSaveFailure('unknown', 'connection', 'note'));
    });
    await callbacks.onFinish();
    await callbacks.onFinish();
    expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    expect(context.view.destroy).not.toHaveBeenCalled();
    expect((await readStoredReaderDraft(context, key))?.payload.exportAttempt).toMatchObject({
      outcome: 'unknown'
    });
    expect(getSessionHarness(context.session).__testHighlights[0]?.comment).toBe(
      'Preserve this comment'
    );
  });

  it('keeps newer edits when the user confirms the earlier file was saved', async () => {
    const { context, key, callbacks } = await createPersistedSession();
    context.dispatchClipResult.mockRejectedValueOnce(
      new ClipSaveError(createClipSaveFailure('unknown'))
    );
    await callbacks.onFinish();
    const state = getSessionHarness(context.session);
    const highlight = state.__testHighlights[0];
    if (!highlight) throw new Error('Expected the persisted Reader highlight');
    highlight.comment = 'Newer comment';
    state.state.exportRecoveryAction = 'confirm-saved';
    await callbacks.onFinish();
    expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    expect(context.view.destroy).not.toHaveBeenCalled();
    const draft = await readStoredReaderDraft(context, key);
    expect(draft?.status).toBe('active');
    expect(JSON.stringify(draft)).toContain('Newer comment');
    expect(draft?.payload.exportAttempt).toBeUndefined();
  });

  it('does not clear newer live content when a successful write reply arrives', async () => {
    const { context, key, callbacks } = await createPersistedSession();
    context.dispatchClipResult.mockImplementationOnce(() => {
      const highlight = getSessionHarness(context.session).__testHighlights[0];
      if (!highlight) throw new Error('Expected the persisted Reader highlight');
      highlight.comment = 'New content during the reply';
      return Promise.resolve();
    });
    await callbacks.onFinish();
    expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    expect(context.view.destroy).not.toHaveBeenCalled();
    expect(JSON.stringify(await readStoredReaderDraft(context, key))).toContain(
      'New content during the reply'
    );
  });

  it('keeps the confirmed export pending if its saved marker cannot be persisted', async () => {
    const { context, key, callbacks } = await createPersistedSession();
    context.dispatchClipResult.mockImplementationOnce(() => {
      context.draftMessages.rejectNext('save', new Error('saved marker write failed'));
      return Promise.resolve();
    });
    await callbacks.onFinish();
    expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    expect(context.view.destroy).not.toHaveBeenCalled();
    expect((await readStoredReaderDraft(context, key))?.payload.exportAttempt).toMatchObject({
      outcome: 'unknown'
    });
    await callbacks.onFinish();
    expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    expect(context.view.destroy).toHaveBeenCalledTimes(1);
  });

  it('includes items outside the draft retention cap in the export identity', async () => {
    const { context, key, callbacks } = await createPersistedSession();
    const harness = getSessionHarness(context.session);
    const initial = harness.__testHighlights[0];
    if (!initial) throw new Error('Expected the persisted Reader highlight');
    harness.__setTestHighlights(
      Array.from({ length: 21 }, (_, index) => ({
        ...initial,
        id: `retention-${index}`,
        selectedText: `Text ${index}`,
        comment: `Comment ${index}`
      }))
    );
    context.dispatchClipResult.mockRejectedValueOnce(
      new ClipSaveError(createClipSaveFailure('unknown'))
    );
    await callbacks.onFinish();
    const retained = (await readStoredReaderDraft(context, key))?.payload.highlights;
    expect(retained).toHaveLength(20);
    expect(retained?.some((item) => item.id === 'retention-0')).toBe(false);
    const oldest = harness.__testHighlights[0];
    if (!oldest) throw new Error('Expected the oldest retained live highlight');
    oldest.comment = 'Changed oldest exported item';
    harness.state.exportRecoveryAction = 'confirm-saved';
    await callbacks.onFinish();
    expect(context.view.destroy).not.toHaveBeenCalled();
    expect(harness.__testHighlights[0]?.comment).toBe('Changed oldest exported item');
    expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    expect((await readStoredReaderDraft(context, key))?.status).toBe('active');
  });

  it('uses a fresh operation identity only after an explicit save-again choice', async () => {
    const startedAt = new Date(2026, 9, 15, 23, 59, 59).getTime();
    const { context, callbacks } = await createPersistedSession();
    vi.setSystemTime(startedAt);
    context.dispatchClipResult.mockRejectedValueOnce(
      new ClipSaveError(createClipSaveFailure('unknown'))
    );
    await callbacks.onFinish();
    const originalOperation = context.dispatchClipResult.mock.calls[0]?.[0]?.meta?.operationId;
    expect(context.dispatchClipResult.mock.calls[0]?.[0]?.meta?.exportStartedAt).toBe(startedAt);
    getSessionHarness(context.session).state.exportRecoveryAction = 'save-again';
    vi.setSystemTime(startedAt + 2000);
    await callbacks.onFinish();
    expect(context.dispatchClipResult).toHaveBeenCalledTimes(2);
    expect(context.dispatchClipResult.mock.calls[1]?.[0]?.meta?.operationId).not.toBe(
      originalOperation
    );
    expect(context.dispatchClipResult.mock.calls[1]?.[0]?.meta?.exportStartedAt).toBe(
      startedAt + 2000
    );
    expect(context.view.destroy).toHaveBeenCalledTimes(1);
  });

  it('shows the new selection while draft recovery is pending and cancels without late highlights', async () => {
    const context = createSessionContext();
    const node = document.getElementById('content');
    if (!node) throw new Error('Selection fixture missing');
    const delayed = context.draftMessages.deferNextResponse('selectAndClaim');
    const start = context.session.initialize({ ...createSelectionPayload(node), comment: '' });
    await vi.waitFor(() =>
      expect(
        context.draftMessages.observed.some((request) => request.operation === 'selectAndClaim')
      ).toBe(true)
    );
    expect(context.view.updateCount).toHaveBeenLastCalledWith(1);
    expect(getSessionHarness(context.session).__testHighlights[0]?.selectedText).toBe(
      node.textContent
    );
    const callbacks = context.getCallbacks();
    if (!callbacks) throw new Error('Panel callbacks missing');
    callbacks.onCancel();
    await vi.advanceTimersByTimeAsync(0);
    expect(context.view.destroy).not.toHaveBeenCalled();
    delayed.resolve();
    await start;
    await vi.waitFor(() => expect(context.view.destroy).toHaveBeenCalledTimes(1));
    expect(context.highlightManager.createHighlight).toHaveBeenCalledTimes(1);
    expect(context.highlightManager.unwrapHighlight).toHaveBeenCalledTimes(1);
    expect(getSessionHarness(context.session).__testHighlights).toEqual([]);
    expect(isReaderSessionActive(document)).toBe(false);
    await expect(
      context.draftRepository.loadLatest('reader', 'https://example.com/article')
    ).resolves.toBeNull();
  });

  it.each(['cancel', 'reload'])(
    'handles a late claimed draft during %s without restoring highlights',
    async (ending) => {
      const next = createSessionContext();
      const envelope = buildReaderSessionDraftEnvelope({
        draftId: 'late-reader-draft',
        createdAt: Date.now(),
        now: Date.now(),
        pageUrl: 'https://example.com/article',
        pageTitle: 'Late draft',
        highlights: [createPersistedHighlightRecord()],
        commentDrafts: {},
        status: 'restorable'
      });
      if (!envelope) throw new Error('Saved draft fixture missing');
      const saved = await next.draftRepository.save(envelope);
      const key = createSessionDraftStorageKey(saved);
      const delayed = next.draftMessages.deferNextResponse('selectAndClaim');
      const start = next.session.initialize();
      await vi.waitFor(() =>
        expect(
          next.draftMessages.observed.some((request) => request.operation === 'selectAndClaim')
        ).toBe(true)
      );
      if (ending === 'cancel') next.session.destroy();
      else next.session.suspendForReload();
      await vi.advanceTimersByTimeAsync(0);
      expect(next.view.destroy).not.toHaveBeenCalled();
      delayed.resolve();
      await start;
      if (ending === 'cancel') {
        await vi.waitFor(() => expect(next.view.destroy).toHaveBeenCalledTimes(1));
        await expect(readStoredReaderDraft(next, key)).resolves.toBeUndefined();
        expect(isReaderSessionActive(document)).toBe(false);
      } else {
        await vi.advanceTimersByTimeAsync(60_000);
        expect(
          next.draftMessages.observed.filter((request) => request.operation === 'renewLease')
        ).toHaveLength(0);
        await expect(readStoredReaderDraft(next, key)).resolves.toMatchObject({ status: 'active' });
        expect(next.view.destroy).not.toHaveBeenCalled();
      }
      expect(next.highlightManager.createHighlight).not.toHaveBeenCalled();
    }
  );

  it('does not await telemetry acknowledgements when starting or cancelling', async () => {
    const context = createSessionContext();
    context.messaging.send.mockImplementation(() => new Promise(() => {}));
    const node = document.getElementById('content');
    if (!node) throw new Error('Selection fixture missing');
    await context.session.initialize({ ...createSelectionPayload(node), comment: '' });
    expect(context.view.updateCount).toHaveBeenLastCalledWith(1);
    expect(context.messaging.send).toHaveBeenCalled();
    context.session.destroy();
    await vi.waitFor(() => expect(context.view.destroy).toHaveBeenCalledTimes(1));
    expect(getSessionHarness(context.session).__testHighlights).toEqual([]);
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
