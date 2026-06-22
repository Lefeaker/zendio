/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../setup/globalSetup';
import { buildReaderSessionDraftEnvelope } from '@content/reader/sessionDrafts';
import {
  __resetContentSessionRegistryForTests,
  isReaderSessionActive
} from '@content/runtime/contentSessionRegistry';
import {
  createPersistedHighlightRecord,
  createSelectionPayload,
  createSessionContext,
  expectCanonicalReaderTelemetry,
  flushDraftPersistence,
  getSessionHarness,
  getTelemetryMessages,
  settleReaderMutation
} from './readerSessionTestHarness';

describe('ReaderSession telemetry', () => {
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

  it('tracks session start with the unknown source fallback', async () => {
    const context = createSessionContext();

    await context.session.initialize();

    expect(getTelemetryMessages(context)).toEqual([
      {
        type: 'ANALYTICS_EVENT',
        event: 'reader_session_started',
        params: { source: 'unknown' }
      }
    ]);
  });

  it('does not emit reader draft restore telemetry when no draft candidate exists', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();

    await context.session.initialize();

    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_draft_restored')
    ).toBeUndefined();
  });

  it('does not let reader draft restore analytics failures block hydration', async () => {
    vi.useFakeTimers();
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));
    const context = createSessionContext();
    const now = Date.now();
    const envelope = buildReaderSessionDraftEnvelope({
      draftId: 'reader-draft-analytics',
      createdAt: now - 10,
      now,
      pageUrl: 'https://example.com/article',
      pageTitle: 'Restored article',
      destination: { kind: 'downloads' },
      highlights: [
        createPersistedHighlightRecord({
          id: 'saved-1',
          selectedText: 'Hello reader session world.',
          selectedHtml: '<mark>Hello reader session world.</mark>',
          comment: 'remember this',
          fragmentUrl: '#saved-1',
          createdAt: 15
        })
      ],
      commentDrafts: {},
      status: 'restorable'
    });
    if (!envelope) {
      throw new Error('expected analytics restore envelope');
    }
    await context.draftRepository.save(envelope);
    context.messaging.send.mockRejectedValueOnce(new Error('analytics down'));

    await context.session.initialize();

    expect(context.messaging.send.mock.calls[0]?.[0]).toMatchObject({
      event: 'reader_draft_restored'
    });
    expect(getSessionHarness(context.session).__testHighlights).toEqual([
      expect.objectContaining({
        id: 'saved-1',
        selectedText: 'Hello reader session world.',
        comment: 'remember this',
        createdAt: 15
      })
    ]);
    expect(debugSpy).toHaveBeenCalledWith(
      '[ReaderSession] Failed to send analytics event:',
      expect.any(Error)
    );
    debugSpy.mockRestore();
  });

  it('does not let analytics send failures block export cleanup', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const context = createSessionContext();
    context.messaging.send.mockRejectedValue(new Error('analytics down'));

    await context.session.initialize();

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-export';
    wrapper.textContent = 'Export me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-export',
        selectedHtml: '<mark>Export me</mark>',
        selectedText: 'Export me',
        comment: 'note',
        fragmentUrl: '#export',
        wrapper
      }
    ]);

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    await callbacks.onFinish();

    expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    expect(context.view.destroy).toHaveBeenCalledTimes(1);
    expect(isReaderSessionActive(document)).toBe(false);
    expect(debugSpy).toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it('tracks cancellation with canonical duration bucket only', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));

    const context = createSessionContext();
    await context.session.initialize();
    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }
    await settleReaderMutation(
      getSessionHarness(context.session).handleSelection(createSelectionPayload(content.firstChild))
    );

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    vi.setSystemTime(new Date('2026-06-05T00:00:35.000Z'));
    callbacks.onCancel();
    await vi.waitFor(() => {
      expect(context.view.destroy).toHaveBeenCalledTimes(1);
    });

    const cancelledEvent = getTelemetryMessages(context).find(
      (message) => message.event === 'reader_session_cancelled'
    );
    expect(cancelledEvent).toEqual({
      type: 'ANALYTICS_EVENT',
      event: 'reader_session_cancelled',
      params: {
        duration_bucket: '30s_to_119s'
      }
    });
    await vi.waitFor(async () => {
      expect(
        await context.draftRepository.loadLatest('reader', 'https://example.com/article')
      ).toBeNull();
    });
    expectCanonicalReaderTelemetry(getTelemetryMessages(context));
  });

  it('never sends raw reader content or off-catalog params in telemetry payloads', async () => {
    vi.useFakeTimers();
    document.title = 'Private Title';
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!(content?.firstChild instanceof Text)) {
      throw new Error('content node missing');
    }
    content.firstChild.textContent = 'Private Quote';

    await settleReaderMutation(
      getSessionHarness(context.session).handleSelection({
        ...createSelectionPayload(content.firstChild),
        selectedHtml: '<mark>Private Quote</mark>',
        selectedText: 'Private Quote'
      })
    );
    const [restoredHighlight] = getSessionHarness(context.session).__testHighlights;
    if (!restoredHighlight) {
      throw new Error('reader highlight missing');
    }
    context.emitCommentDraftChange({
      [restoredHighlight.id]: 'Private Draft'
    });
    await flushDraftPersistence();

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }
    if (!callbacks.onSelectDestination) {
      throw new Error('destination callback missing');
    }

    await settleReaderMutation(Promise.resolve(callbacks.onSelectDestination('downloads')));
    await callbacks.onFinish();

    const telemetryMessages = getTelemetryMessages(context);
    const serialized = JSON.stringify(telemetryMessages);

    expect(serialized).not.toContain('Private Quote');
    expect(serialized).not.toContain('Private Draft');
    expect(serialized).not.toContain('<mark>Private Quote</mark>');
    expect(serialized).not.toContain('https://example.com/article');
    expect(serialized).not.toContain('Private Title');
    expect(serialized).not.toContain('reader_session_exported');
    expect(serialized).not.toContain('reader_session_failed');
    expect(serialized).not.toContain('entry_point');
    expect(serialized).not.toContain('export_mode');
    expect(serialized).not.toContain('export_destination');
    expect(serialized).not.toContain('duration_ms');
    expect(serialized).not.toContain('outcome');
    expectCanonicalReaderTelemetry(telemetryMessages);
  });
});
