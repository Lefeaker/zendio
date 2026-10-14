import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeadline } from '../../../scripts/utils/firefoxWebDriverBidiSmokeAdapter.mjs';
import {
  findFirefoxReaderDraft,
  waitForFirefoxSaveScenario
} from '../../../scripts/utils/firefoxWebDriverBidiSaveScenario.mjs';

afterEach(() => vi.useRealTimers());

describe('Firefox save scenario durable observation', () => {
  const pageUrl = 'http://127.0.0.1:1234/article-first';
  const paragraph = 'The complete selected text must survive the refused write.';
  const key = 'aiob.sessionDraft.v1.reader.page-key.draft-id';
  const draft = {
    schemaVersion: 2,
    mode: 'reader',
    status: 'active',
    pageUrl,
    pageKey: 'page-key',
    draftId: 'draft-id',
    revision: 2,
    payload: { highlights: [{ selectedText: paragraph }] }
  };

  it('accepts the same active draft at a later persisted revision', () => {
    const initial = findFirefoxReaderDraft({ [key]: draft }, pageUrl, paragraph);
    expect(initial).toMatchObject({ key, draftId: draft.draftId, revision: 2 });
    const attempt = { operationId: 'op_abcdef', outcome: 'unknown' };
    expect(
      findFirefoxReaderDraft(
        {
          [key]: {
            ...draft,
            revision: 3,
            payload: { ...draft.payload, exportAttempt: attempt }
          }
        },
        pageUrl,
        paragraph,
        initial
      )
    ).toEqual({
      key,
      draftId: draft.draftId,
      revision: 3,
      exportAttempt: attempt
    });
  });

  it.each([
    ['receipt copy', { 'aiob.sessionDraft.index.v1': { receipts: [draft] } }],
    ['wrong key', { 'aiob.sessionDraft.v1.reader.page-key.other-id': draft }],
    ['wrong page', { [key]: { ...draft, pageUrl: `${pageUrl}/other` } }],
    ['ended draft', { [key]: { ...draft, status: 'exported' } }],
    ['unpersisted draft', { [key]: { ...draft, revision: 0 } }],
    [
      'only excerpt retained',
      { [key]: { ...draft, payload: { highlights: [{ selectedText: paragraph.slice(0, 20) }] } } }
    ],
    [
      'text only in unrelated payload',
      { [key]: { ...draft, payload: { title: paragraph, highlights: [] } } }
    ]
  ])('rejects %s despite matching text elsewhere', (_label, storage) => {
    expect(findFirefoxReaderDraft(storage, pageUrl, paragraph)).toBeUndefined();
  });

  it('rejects replacement or older drafts after the failed write', () => {
    const previous = { key, draftId: draft.draftId, revision: 2 };
    expect(
      findFirefoxReaderDraft({ [key]: { ...draft, revision: 1 } }, pageUrl, paragraph, previous)
    ).toBeUndefined();
    const replacement = { ...draft, draftId: 'new-id' };
    expect(
      findFirefoxReaderDraft(
        { 'aiob.sessionDraft.v1.reader.page-key.new-id': replacement },
        pageUrl,
        paragraph,
        previous
      )
    ).toBeUndefined();
    expect(
      findFirefoxReaderDraft(
        { [key]: draft, 'aiob.sessionDraft.v1.reader.page-key.new-id': replacement },
        pageUrl,
        paragraph
      )
    ).toBeUndefined();
  });
});

describe('Firefox save scenario polling ownership', () => {
  it('terminates a short-circuiting file probe after the real smoke deadline fences it', async () => {
    vi.useFakeTimers();
    const deadline = createDeadline();
    const probe = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const pending = waitForFirefoxSaveScenario(probe, 'RETRY_COMPLETE', {
      run: deadline.run,
      sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    });
    const rejected = expect(pending).rejects.toThrow(
      'FIREFOX_SAVE_SCENARIO_TIMEOUT:RETRY_COMPLETE'
    );

    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(deadline.fenced).toBe(true);
    const callsAfterDeadline = probe.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(probe).toHaveBeenCalledTimes(callsAfterDeadline);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('finishes a successful probe without leaving poll or deadline timers', async () => {
    vi.useFakeTimers();
    const deadline = createDeadline();
    const probe = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const pending = waitForFirefoxSaveScenario(probe, 'RETRY_COMPLETE', {
      run: deadline.run,
      sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    });
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(probe).toHaveBeenCalledTimes(2);
    expect(deadline.fenced).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
