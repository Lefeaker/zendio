import type { ClipResultResponse } from '../../../src/shared/types';
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
import type { MessagingService } from '../../../src/platform/interfaces/messaging';
import { createMemoryStorageService } from '../../../src/platform/preview/memoryStorage';
import { MockOptionsRepository } from '../../utils/repositories/MockOptionsRepository';

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

  it('keeps an uncertain write and requires an explicit new save, then retries cleanup without rewriting', async () => {
    const context = createSessionContext();
    const acknowledgementReply = vi.fn<() => Promise<ClipResultResponse>>();
    const messaging: Pick<MessagingService, 'send'> = {
      // MessagingService lets the caller choose TResult; this fixture supplies only the
      // actual production pipeline response and leaves runtime validation to Reader.
      send: async <TResult>() => (await acknowledgementReply()) as TResult
    };
    const runtime = createReaderSessionDependencies({
      optionsRepository: new MockOptionsRepository(),
      storage: createMemoryStorageService(),
      runtime: { getURL: (path) => path },
      messaging
    });
    context.dispatchClipResult.mockImplementation(
      async (payload: Parameters<typeof runtime.dispatchClipResult>[0]) => {
        const acknowledgement = await handleClipResult({ type: 'CLIP_RESULT', payload }, 1, {
          sendSupportPrompt: vi.fn().mockResolvedValue(undefined)
        });
        acknowledgementReply.mockResolvedValueOnce(acknowledgement);
        await runtime.dispatchClipResult(payload);
      }
    );
    const content = document.getElementById('content');
    if (!content) throw new Error('Missing Reader source fixture');
    await context.session.initialize({
      ...createSelectionPayload(content),
      comment: 'Keep my comment'
    });
    const callbacks = context.getCallbacks();
    if (!callbacks) throw new Error('Reader panel was not mounted');
    await flushDraftPersistence();
    const key = getDraftIdentity(context.session).draftStorageKey;
    if (!key) throw new Error('Reader draft was not persisted');
    await vi.waitFor(async () =>
      expect(await readStoredReaderDraft(context, key)).toMatchObject({ status: 'active' })
    );
    writeMarkdownMock.mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
    await callbacks.onFinish();
    await vi.waitFor(() => expect(writeMarkdownMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(context.view.destroy).not.toHaveBeenCalled();
    expect(isReaderSessionActive(document)).toBe(true);
    expect(getSessionHarness(context.session).__testHighlights[0]?.comment).toBe('Keep my comment');
    const draft = await readStoredReaderDraft(context, key);
    expect(draft?.status).toBe('active');
    expect(JSON.stringify(draft)).toContain('Keep my comment');
    await callbacks.onFinish();
    expect(writeMarkdownMock).toHaveBeenCalledTimes(1);
    getSessionHarness(context.session).state.exportRecoveryAction = 'save-again';
    context.draftMessages.loseNextResponse('removeExact', new Error('cleanup ACK lost'));
    await callbacks.onFinish();
    expect(context.view.destroy).not.toHaveBeenCalled();
    expect(writeMarkdownMock).toHaveBeenCalledTimes(2);
    await callbacks.onFinish();
    await vi.waitFor(() => expect(context.view.destroy).toHaveBeenCalledTimes(1));
    expect(writeMarkdownMock).toHaveBeenCalledTimes(2);
    expect(writeMarkdownMock.mock.lastCall?.[1]).toContain('Keep my comment');
    expect(isReaderSessionActive(document)).toBe(false);
  });
});
