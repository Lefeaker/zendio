/* @vitest-environment jsdom */

import type { ReaderPanelHighlight } from '@content/reader/application/readerPanelModel';
import type { ReaderHighlightRecord } from '@content/reader/services/highlightManager';
import { DEFAULT_SESSION_MESSAGES } from '@content/reader/sessionMessages';
import {
  __resetContentSessionRegistryForTests,
  getReaderSession,
  isReaderSessionActive
} from '@content/runtime/contentSessionRegistry';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../setup/globalSetup';
import {
  createDeferred,
  createSelectionPayload,
  createSessionContext,
  expectCanonicalReaderTelemetry,
  flushDraftPersistence,
  getDraftIdentity,
  getSessionHarness,
  getTelemetryMessages,
  loadLatestReaderDraft,
  setSelectionFor,
  settleReaderMutation
} from './readerSessionTestHarness';

describe('ReaderSession mutations', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
    document.documentElement.removeAttribute('data-aiob-reader-active');
    document.body.removeAttribute('data-aiobReaderHighlight');
    document.body.removeAttribute('data-aiobReaderHighlightTheme');
    __resetContentSessionRegistryForTests(document);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures selection directly inside reader mode without opening the clipper prompt', async () => {
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }
    await getSessionHarness(context.session).handleSelection(
      createSelectionPayload(content.firstChild)
    );

    const highlights = getSessionHarness(context.session).__testHighlights;
    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.comment).toBe('');
    expect(highlights[0]?.selectedText).toContain('Hello reader session world.');
    expect(context.clipPrompt.requestSelectionAction).not.toHaveBeenCalled();
    expect(context.view.updateCount).toHaveBeenLastCalledWith(1);
    expect(context.view.setHighlights).toHaveBeenCalled();
  });

  it('rolls back added highlights, hint state, and telemetry when durable add save fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    context.highlightManager.unwrapHighlight.mockImplementation(
      (highlight: ReaderHighlightRecord) => {
        highlight.wrapper.remove();
      }
    );
    context.highlightManager.createHighlight.mockImplementationOnce(
      (options: {
        id: string;
        selectedHtml: string;
        selectedText: string;
        comment: string;
        fragmentUrl: string;
      }) => {
        const wrapper = document.createElement('mark');
        wrapper.className = 'aiob-reader-highlight';
        wrapper.dataset.readerHighlightId = options.id;
        wrapper.dataset.readerComment = options.comment.trim();
        wrapper.textContent = options.selectedText;
        document.body.appendChild(wrapper);
        return {
          id: options.id,
          selectedHtml: options.selectedHtml,
          selectedText: options.selectedText,
          comment: options.comment.trim(),
          fragmentUrl: options.fragmentUrl,
          wrapper,
          wrapperSegments: [wrapper],
          createdAt: Date.now()
        } satisfies ReaderHighlightRecord;
      }
    );
    vi.spyOn(context.storageLocal, 'setMany').mockRejectedValueOnce(
      new Error('durable add failed')
    );

    const selectionPromise = Promise.resolve(
      getSessionHarness(context.session).handleSelection(createSelectionPayload(content.firstChild))
    );
    await Promise.resolve();

    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(1);
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_highlight_added')
    ).toBeUndefined();

    await flushDraftPersistence();
    await selectionPromise;

    await expect(
      context.draftRepository.loadLatest('reader', 'https://example.com/article')
    ).resolves.toBeNull();
    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(0);
    expect(document.querySelector('[data-reader-highlight-id]')).toBeNull();
    expect(context.view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_highlight_added')
    ).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('applies transactional add highlights while the draft mutation save boundary is active', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    const savingStatesDuringCreate: boolean[] = [];
    const originalCreateHighlight =
      context.highlightManager.createHighlight.getMockImplementation();
    if (!originalCreateHighlight) {
      throw new Error('expected highlight manager createHighlight implementation');
    }
    context.highlightManager.createHighlight.mockImplementation(
      (options: {
        id: string;
        selectedHtml: string;
        selectedText: string;
        comment: string;
        fragmentUrl: string;
      }) => {
        savingStatesDuringCreate.push(Boolean(getSessionHarness(context.session).state.saving));
        return originalCreateHighlight(options);
      }
    );

    const selectionPromise = Promise.resolve(
      getSessionHarness(context.session).handleSelection(createSelectionPayload(content.firstChild))
    );
    await Promise.resolve();

    expect(savingStatesDuringCreate).toEqual([true]);
    expect(getSessionHarness(context.session).state.saving).toBe(true);
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_highlight_added')
    ).toBeUndefined();

    await flushDraftPersistence();
    await selectionPromise;

    expect(getSessionHarness(context.session).state.saving).toBe(false);
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_highlight_added')
    ).toEqual({
      type: 'ANALYTICS_EVENT',
      event: 'reader_highlight_added',
      params: {
        selection_length_bucket: 'twenty_one_to_fifty',
        highlight_count_bucket: 'one'
      }
    });
  });

  it('rejects durable reader draft saves when storage persistence fails and keeps the session mounted for retry', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const wrapper = document.createElement('mark');
    wrapper.dataset.readerHighlightId = 'retry-highlight';
    wrapper.textContent = 'Retry highlight';
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'retry-highlight',
        selectedHtml: '<mark>Retry highlight</mark>',
        selectedText: 'Retry highlight',
        comment: 'retry me',
        fragmentUrl: '#retry-highlight',
        wrapper
      }
    ]);

    const saveError = new Error('durable save failed');
    vi.spyOn(context.storageLocal, 'setMany').mockRejectedValueOnce(saveError);

    const persistPromise = getSessionHarness(context.session).persistDraftMutation();
    const persistExpectation = expect(persistPromise).rejects.toThrow(saveError);
    await vi.advanceTimersByTimeAsync(250);

    await persistExpectation;
    expect(isReaderSessionActive(document)).toBe(true);
    expect(getReaderSession()).toBe(context.session);
    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(1);
    const draftIdentity = getDraftIdentity(context.session);
    expect(typeof draftIdentity.draftId).toBe('string');
    expect(typeof draftIdentity.draftCreatedAt).toBe('number');
    expect(typeof draftIdentity.draftStorageKey).toBe('string');
  });

  it('serializes durable reader mutations and ignores new selections while saving is in flight', async () => {
    const context = createSessionContext();
    await context.session.initialize();

    const firstSave = createDeferred<void>();
    const events: string[] = [];

    const firstRun = getSessionHarness(context.session).runDraftMutation({
      apply: () => {
        events.push('first:apply');
        return 'first-result';
      },
      save: async () => {
        events.push('first:save:start');
        await firstSave.promise;
        events.push('first:save:end');
      },
      commit: (result) => {
        events.push(`first:commit:${result}`);
      },
      rollback: () => {
        events.push('first:rollback');
      }
    });

    await Promise.resolve();

    const secondRun = getSessionHarness(context.session).runDraftMutation({
      apply: () => {
        events.push('second:apply');
        return 'second-result';
      },
      save: async () => {
        events.push('second:save');
      },
      commit: (result) => {
        events.push(`second:commit:${result}`);
      },
      rollback: () => {
        events.push('second:rollback');
      }
    });

    await Promise.resolve();

    expect(getSessionHarness(context.session).state.saving).toBe(true);
    expect(events).toEqual(['first:apply', 'first:save:start']);

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }
    setSelectionFor(content.firstChild);
    content.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));

    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(0);

    firstSave.resolve();

    await expect(firstRun).resolves.toBe(true);
    await expect(secondRun).resolves.toBe(true);

    expect(events).toEqual([
      'first:apply',
      'first:save:start',
      'first:save:end',
      'first:commit:first-result',
      'second:apply',
      'second:save',
      'second:commit:second-result'
    ]);
    expect(getSessionHarness(context.session).state.saving).toBe(false);
  });

  it('restores deleted highlights, wrapper presentation, and in-progress drafts when durable delete save fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-delete';
    wrapper.dataset.readerComment = 'drafted note';
    wrapper.textContent = 'Delete me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-delete',
        selectedHtml: '<mark>Delete me</mark>',
        selectedText: 'Delete me',
        comment: 'drafted note',
        fragmentUrl: '#delete-me',
        wrapper
      }
    ]);
    context.view.currentDrafts = {
      'h-delete': 'draft to keep'
    };
    context.view.setHighlights.mockImplementation((highlights: ReaderPanelHighlight[]) => {
      const validIds = new Set(highlights.map((highlight) => highlight.id));
      context.view.currentDrafts = Object.fromEntries(
        Object.entries(context.view.currentDrafts).filter(([id]) => validIds.has(id))
      );
    });
    const initialPersist = getSessionHarness(context.session).persistDraftMutation();
    await flushDraftPersistence();
    await initialPersist;
    context.highlightManager.unwrapHighlight.mockImplementation(
      (highlight: ReaderHighlightRecord) => {
        highlight.wrapper.remove();
      }
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(context.storageLocal, 'remove').mockRejectedValueOnce(
      new Error('durable delete failed')
    );

    const deletePromise = Promise.resolve(callbacks.onDeleteHighlight('h-delete'));
    const deleteExpectation = expect(deletePromise).rejects.toThrow(
      'Failed to save reader highlight removal.'
    );
    await Promise.resolve();

    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(0);
    expect(context.view.currentDrafts).toEqual({});
    expect(wrapper.isConnected).toBe(false);

    await flushDraftPersistence();
    await deleteExpectation;

    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(1);
    expect(context.view.currentDrafts).toEqual({
      'h-delete': 'draft to keep'
    });
    expect(wrapper.isConnected).toBe(true);
    expect(document.querySelectorAll('[data-reader-highlight-id="h-delete"]')).toHaveLength(1);
    expect(context.view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    warnSpy.mockRestore();
  });

  it('removes deleted highlight comment drafts from the durable reader draft before save', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const deleteWrapper = document.createElement('mark');
    deleteWrapper.className = 'aiob-reader-highlight';
    deleteWrapper.dataset.readerHighlightId = 'h-delete';
    deleteWrapper.textContent = 'Delete me';
    const keepWrapper = document.createElement('mark');
    keepWrapper.className = 'aiob-reader-highlight';
    keepWrapper.dataset.readerHighlightId = 'h-keep';
    keepWrapper.textContent = 'Keep me';
    document.body.append(deleteWrapper, keepWrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-delete',
        selectedHtml: '<mark>Delete me</mark>',
        selectedText: 'Delete me',
        comment: 'delete note',
        fragmentUrl: '#delete-me',
        wrapper: deleteWrapper
      },
      {
        id: 'h-keep',
        selectedHtml: '<mark>Keep me</mark>',
        selectedText: 'Keep me',
        comment: 'keep note',
        fragmentUrl: '#keep-me',
        wrapper: keepWrapper
      }
    ]);
    context.view.currentDrafts = {
      'h-delete': 'orphan draft',
      'h-keep': 'keep draft'
    };
    context.highlightManager.unwrapHighlight.mockImplementation(
      (highlight: ReaderHighlightRecord) => {
        highlight.wrapper.remove();
      }
    );

    const deletePromise = Promise.resolve(callbacks.onDeleteHighlight('h-delete'));
    await flushDraftPersistence();
    await deletePromise;

    const draft = await loadLatestReaderDraft(context);
    if (!draft) {
      throw new Error('reader draft missing after delete');
    }
    expect(draft.payload.highlights?.map(({ id }) => id)).toEqual(['h-keep']);
    expect(draft.payload.commentDrafts).toEqual({
      'h-keep': 'keep draft'
    });
    expect(draft.payload.commentDrafts).not.toHaveProperty('h-delete');
  });

  it('does not overwrite the durable reader draft with a deleted highlight when delete save fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const deleteWrapper = document.createElement('mark');
    deleteWrapper.className = 'aiob-reader-highlight';
    deleteWrapper.dataset.readerHighlightId = 'h-delete';
    deleteWrapper.textContent = 'Delete me';
    document.body.appendChild(deleteWrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-delete',
        selectedHtml: '<mark>Delete me</mark>',
        selectedText: 'Delete me',
        comment: 'delete note',
        fragmentUrl: '#delete-me',
        wrapper: deleteWrapper
      }
    ]);
    context.view.currentDrafts = {
      'h-delete': 'draft to keep'
    };

    const initialPersist = getSessionHarness(context.session).persistDraftMutation();
    await flushDraftPersistence();
    await initialPersist;
    const beforeDelete = await loadLatestReaderDraft(context);
    if (!beforeDelete) {
      throw new Error('reader draft missing before delete');
    }
    expect(beforeDelete.payload.highlights?.map(({ id }) => id)).toEqual(['h-delete']);
    expect(beforeDelete.payload.commentDrafts).toEqual({
      'h-delete': 'draft to keep'
    });

    context.highlightManager.unwrapHighlight.mockImplementation(
      (highlight: ReaderHighlightRecord) => {
        highlight.wrapper.remove();
      }
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(context.storageLocal, 'remove').mockRejectedValueOnce(
      new Error('durable delete failed')
    );

    const deletePromise = Promise.resolve(callbacks.onDeleteHighlight('h-delete'));
    const deleteExpectation = expect(deletePromise).rejects.toThrow(
      'Failed to save reader highlight removal.'
    );
    await Promise.resolve();
    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(0);
    expect(context.view.currentDrafts).toEqual({});
    expect(deleteWrapper.isConnected).toBe(false);

    await flushDraftPersistence();
    await deleteExpectation;

    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(1);
    expect(context.view.currentDrafts).toEqual({
      'h-delete': 'draft to keep'
    });
    expect(deleteWrapper.isConnected).toBe(true);
    await expect(loadLatestReaderDraft(context)).resolves.toEqual(beforeDelete);
    warnSpy.mockRestore();
  });

  it('emits reader_highlight_added only after durable add save succeeds', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    const selectionPromise = Promise.resolve(
      getSessionHarness(context.session).handleSelection(createSelectionPayload(content.firstChild))
    );
    await Promise.resolve();

    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_highlight_added')
    ).toBeUndefined();

    await flushDraftPersistence();
    await selectionPromise;

    const highlightEvent = getTelemetryMessages(context).find(
      (message) => message.event === 'reader_highlight_added'
    );
    expect(highlightEvent).toEqual({
      type: 'ANALYTICS_EVENT',
      event: 'reader_highlight_added',
      params: {
        selection_length_bucket: 'twenty_one_to_fifty',
        highlight_count_bucket: 'one'
      }
    });
    expectCanonicalReaderTelemetry(getTelemetryMessages(context));
  });

  it('rolls back edited comments and keeps editing state coherent when durable edit save fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-edit';
    wrapper.dataset.readerComment = 'memo';
    wrapper.dataset.readerFootnote = '2';
    wrapper.textContent = 'Edit me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-edit',
        selectedHtml: '<mark>Edit me</mark>',
        selectedText: 'Edit me',
        comment: 'memo',
        fragmentUrl: '#edit-me',
        wrapper
      }
    ]);
    const [highlight] = getSessionHarness(context.session).__testHighlights;
    if (!highlight) {
      throw new Error('reader highlight missing');
    }
    highlight.footnoteIndex = 2;
    context.view.currentDrafts = {
      'h-edit': 'updated memo'
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(context.storageLocal, 'setMany').mockRejectedValueOnce(new Error('edit failed'));

    const editPromise = Promise.resolve(
      callbacks.onSubmitHighlightEdit('h-edit', ' updated memo ')
    );
    const editExpectation = expect(editPromise).rejects.toThrow();
    await Promise.resolve();

    expect(highlight.comment).toBe('updated memo');
    expect(wrapper.dataset.readerComment).toBe('updated memo');
    expect(wrapper.dataset.readerFootnote).toBeUndefined();

    await flushDraftPersistence();
    await editExpectation;

    expect(highlight.comment).toBe('memo');
    expect(highlight.footnoteIndex).toBe(2);
    expect(wrapper.dataset.readerComment).toBe('memo');
    expect(wrapper.dataset.readerFootnote).toBe('2');
    expect(context.view.currentDrafts).toEqual({
      'h-edit': 'updated memo'
    });
    expect(context.view.stopEditing).not.toHaveBeenCalled();
    expect(context.view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    warnSpy.mockRestore();
  });

  it('removes committed highlight input drafts from the durable reader draft before edit save', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-edit';
    wrapper.dataset.readerComment = 'old memo';
    wrapper.textContent = 'Edit me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-edit',
        selectedHtml: '<mark>Edit me</mark>',
        selectedText: 'Edit me',
        comment: 'old memo',
        fragmentUrl: '#edit-me',
        wrapper
      }
    ]);
    context.view.currentDrafts = {
      'h-edit': 'new memo'
    };

    const editPromise = Promise.resolve(callbacks.onSubmitHighlightEdit('h-edit', ' new memo '));
    await flushDraftPersistence();
    await editPromise;

    const draft = await loadLatestReaderDraft(context);
    if (!draft) {
      throw new Error('reader draft missing after edit');
    }
    expect(draft.payload.highlights?.find(({ id }) => id === 'h-edit')?.comment).toBe('new memo');
    expect(draft.payload.commentDrafts).toEqual({});
    expect(draft.payload.commentDrafts).not.toHaveProperty('h-edit');
  });

  it('does not overwrite the durable reader draft with an edited comment when edit save fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-edit';
    wrapper.dataset.readerComment = 'old memo';
    wrapper.dataset.readerFootnote = '3';
    wrapper.textContent = 'Edit me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-edit',
        selectedHtml: '<mark>Edit me</mark>',
        selectedText: 'Edit me',
        comment: 'old memo',
        fragmentUrl: '#edit-me',
        wrapper
      }
    ]);
    const [highlight] = getSessionHarness(context.session).__testHighlights;
    if (!highlight) {
      throw new Error('reader highlight missing');
    }
    highlight.footnoteIndex = 3;
    context.view.currentDrafts = {
      'h-edit': 'new memo'
    };

    const initialPersist = getSessionHarness(context.session).persistDraftMutation();
    await flushDraftPersistence();
    await initialPersist;
    const beforeEdit = await loadLatestReaderDraft(context);
    if (!beforeEdit) {
      throw new Error('reader draft missing before edit');
    }
    expect(beforeEdit.payload.highlights?.find(({ id }) => id === 'h-edit')?.comment).toBe(
      'old memo'
    );
    expect(beforeEdit.payload.commentDrafts).toEqual({
      'h-edit': 'new memo'
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(context.storageLocal, 'setMany').mockRejectedValueOnce(new Error('edit failed'));

    const editPromise = Promise.resolve(callbacks.onSubmitHighlightEdit('h-edit', ' new memo '));
    const editExpectation = expect(editPromise).rejects.toThrow(
      'Failed to save reader highlight edit.'
    );
    await Promise.resolve();

    expect(highlight.comment).toBe('new memo');
    expect(context.view.currentDrafts).toEqual({});

    await flushDraftPersistence();
    await editExpectation;

    expect(highlight.comment).toBe('old memo');
    expect(highlight.footnoteIndex).toBe(3);
    expect(wrapper.dataset.readerComment).toBe('old memo');
    expect(wrapper.dataset.readerFootnote).toBe('3');
    expect(context.view.currentDrafts).toEqual({
      'h-edit': 'new memo'
    });
    expect(context.view.stopEditing).not.toHaveBeenCalled();
    expect(getTelemetryMessages(context).map((message) => message.event)).toEqual([
      'reader_session_started'
    ]);
    await expect(loadLatestReaderDraft(context)).resolves.toEqual(beforeEdit);
    warnSpy.mockRestore();
  });

  it('restores the previous destination preview when durable destination save fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks?.onSelectDestination) {
      throw new Error('destination callback missing');
    }

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-destination';
    wrapper.textContent = 'Destination highlight';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-destination',
        selectedHtml: '<mark>Destination highlight</mark>',
        selectedText: 'Destination highlight',
        comment: '',
        fragmentUrl: '#destination-highlight',
        wrapper
      }
    ]);

    const firstSelectionPromise = Promise.resolve(callbacks.onSelectDestination('research'));
    await flushDraftPersistence();
    await firstSelectionPromise;

    expect(context.view.updateDestination).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'research',
        kind: 'vault',
        label: 'Research Vault'
      })
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(context.storageLocal, 'setMany').mockRejectedValueOnce(
      new Error('destination save failed')
    );

    const secondSelectionPromise = Promise.resolve(callbacks.onSelectDestination('downloads'));
    await Promise.resolve();
    await flushDraftPersistence();
    await secondSelectionPromise;

    expect(context.view.updateDestination).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'research',
        kind: 'vault',
        label: 'Research Vault'
      })
    );
    const destinationDraft = await context.draftRepository.loadLatest(
      'reader',
      'https://example.com/article'
    );
    if (!destinationDraft || destinationDraft.mode !== 'reader') {
      throw new Error('reader draft missing after destination rollback');
    }
    expect(destinationDraft.payload.destination).toEqual({
      kind: 'vault',
      vaultId: 'research'
    });
    warnSpy.mockRestore();
  });

  it('keeps typed comment drafts visible, applies a failure hint, and preserves draft identity when autosave rejects', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    await settleReaderMutation(
      Promise.resolve(
        getSessionHarness(context.session).handleSelection(
          createSelectionPayload(content.firstChild)
        )
      )
    );

    const [highlight] = getSessionHarness(context.session).__testHighlights;
    if (!highlight) {
      throw new Error('reader highlight missing');
    }

    const draftIdentity = getDraftIdentity(context.session);
    const saveError = new Error('autosave failed');
    vi.spyOn(context.storageLocal, 'setMany').mockRejectedValueOnce(saveError);

    context.emitCommentDraftChange({
      [highlight.id]: 'typed note'
    });
    await flushDraftPersistence();

    expect(context.view.currentDrafts).toEqual({
      [highlight.id]: 'typed note'
    });
    expect(context.view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(getDraftIdentity(context.session)).toEqual(draftIdentity);
  });

  it('preserves draft identity when exact-key reader draft cleanup fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    await settleReaderMutation(
      Promise.resolve(
        getSessionHarness(context.session).handleSelection(
          createSelectionPayload(content.firstChild)
        )
      )
    );

    const persistedIdentity = getDraftIdentity(context.session);
    if (!persistedIdentity.draftStorageKey) {
      throw new Error('expected persisted draft key');
    }

    getSessionHarness(context.session).__setTestHighlights([]);

    const removeError = new Error('remove failed');
    const removeSpy = vi.spyOn(context.storageLocal, 'remove').mockRejectedValueOnce(removeError);

    const removePromise = getSessionHarness(context.session).persistDraftMutation();
    await expect(removePromise).rejects.toThrow(removeError);

    expect(removeSpy).toHaveBeenCalledWith([persistedIdentity.draftStorageKey]);
    expect(getDraftIdentity(context.session)).toEqual(persistedIdentity);
  });

  it('reports selection failures', async () => {
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    context.highlightManager.createHighlight.mockImplementationOnce(() => {
      throw new Error('network');
    });
    await getSessionHarness(context.session).handleSelection(
      createSelectionPayload(content.firstChild)
    );
    expect(context.view.updateHint).toHaveBeenCalledWith(
      DEFAULT_SESSION_MESSAGES.hintSelectionFailure
    );
    errorSpy.mockRestore();
  });

  it('ingests external highlights and clears selection', async () => {
    const context = createSessionContext();
    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }
    const range = setSelectionFor(content.firstChild);
    const selection = window.getSelection();
    if (!selection) {
      throw new Error('selection missing');
    }
    const removeSpy = vi.spyOn(selection, 'removeAllRanges');

    context.session.ingestExternalHighlight(range, '<p>ext</p>', 'ext', 'memo');
    await Promise.resolve();

    const highlights = getSessionHarness(context.session).__testHighlights;
    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.comment).toBe('memo');
    expect(removeSpy).toHaveBeenCalledTimes(1);
    removeSpy.mockRestore();
  });
});
