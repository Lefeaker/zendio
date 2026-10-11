/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReaderSessionDependencies } from '@content/reader/sessionDependencies';
import {
  __resetContentSessionRegistryForTests,
  isReaderSessionActive
} from '@content/runtime/contentSessionRegistry';
import {
  createSessionContext,
  createSelectionPayload,
  flushDraftPersistence,
  getDraftIdentity,
  getSessionHarness,
  readStoredReaderDraft
} from '../content/reader/readerSessionTestHarness';
import {
  classifyClipMock,
  getOptionsMock,
  resetClipProcessorHarnessMocks,
  resolvePathMock,
  selectVaultMock,
  templateOptions,
  writeMarkdownMock
} from './clipTestHarness';
import { handleClipResult } from '../../../src/background/pipelines/clipPipeline';
import type { ClipResultMessage } from '@shared/types';

vi.mock('@shared/di/serviceRegistry', () => ({ resolveRepository: () => ({}) }));

describe('Reader save through the production background pipeline', () => {
  beforeEach(() => {
    __resetContentSessionRegistryForTests(document);
    resetClipProcessorHarnessMocks();
    vi.useFakeTimers();
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { vault: 'Test', apiKey: 'fixture', baseUrl: 'http://localhost' }
    });
    classifyClipMock.mockResolvedValue({
      type: 'article',
      topics: [],
      tags: [],
      status: 'success'
    });
    resolvePathMock.mockReturnValue('Reading/note.md');
    selectVaultMock.mockReturnValue({
      vault: null,
      restConfig: { vault: 'Test', apiKey: 'fixture', baseUrl: 'http://localhost' },
      context: {}
    });
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('keeps highlights and the stored draft after writer failure, then closes only after a successful retry', async () => {
    const context = createSessionContext();
    const runtime = createReaderSessionDependencies({
      optionsRepository: {} as never,
      storage: {} as never,
      runtime: { getURL: (path) => path },
      messaging: {
        send: async <TResult>(message: unknown) =>
          (await handleClipResult(message as ClipResultMessage, 1, {
            sendSupportPrompt: vi.fn().mockResolvedValue(undefined)
          })) as TResult
      }
    });
    context.dispatchClipResult.mockImplementation(runtime.dispatchClipResult);
    await context.session.initialize({
      ...createSelectionPayload(document.getElementById('content')!),
      comment: 'Keep my comment'
    });
    await flushDraftPersistence();
    const key = getDraftIdentity(context.session).draftStorageKey;
    if (!key) throw new Error('Reader draft was not persisted');
    await vi.waitFor(async () =>
      expect(await readStoredReaderDraft(context, key)).toMatchObject({ status: 'active' })
    );
    writeMarkdownMock.mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
    await context.getCallbacks()!.onFinish();
    await vi.waitFor(() => expect(writeMarkdownMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(context.view.destroy).not.toHaveBeenCalled();
    expect(isReaderSessionActive(document)).toBe(true);
    expect(getSessionHarness(context.session).__testHighlights[0]?.comment).toBe('Keep my comment');
    const draft = await readStoredReaderDraft(context, key);
    expect(draft?.status).toBe('active');
    expect(JSON.stringify(draft)).toContain('Keep my comment');
    context.draftMessages.loseNextResponse('removeExact', new Error('cleanup ACK lost'));
    await context.getCallbacks()!.onFinish();
    expect(context.view.destroy).not.toHaveBeenCalled();
    expect(writeMarkdownMock).toHaveBeenCalledTimes(2);
    await context.getCallbacks()!.onFinish();
    await vi.waitFor(() => expect(context.view.destroy).toHaveBeenCalledTimes(1));
    expect(writeMarkdownMock).toHaveBeenCalledTimes(2);
    expect(writeMarkdownMock.mock.lastCall?.[1]).toContain('Keep my comment');
    expect(isReaderSessionActive(document)).toBe(false);
  });
});
