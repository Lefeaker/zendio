import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../../src/shared/config';
import type { ClipPayload } from '../../../src/shared/types';
import type { Options } from '../../../src/background/store';
import { registerService, resetGlobalRegistry, TOKENS } from '../../../src/shared/di';
import { createPreviewPlatformServices } from '../../../src/platform/preview/services';
import { createFetchRestClient } from '../../../src/infrastructure/restClient';
import {
  processClipPayload,
  clipProcessingFailureResult
} from '../../../src/background/application/clipProcessor';
import { errorHandler } from '../../../src/shared/errors';
import {
  awaitClipSaveResult,
  type ClipAttachmentProgress
} from '../../../src/shared/types/clipResult';

let options: Options;
vi.mock('../../../src/background/store', () => ({ getOptions: () => Promise.resolve(options) }));
vi.mock('../../../src/background/services/analyticsEvents', () => ({
  trackUsageEvent: () => Promise.resolve(),
  trackActivationMilestoneIfNeeded: () => Promise.resolve()
}));
vi.mock('../../../src/background/services/usageStats', () => ({
  recordClipUsage: () => Promise.resolve()
}));

function payload(): ClipPayload {
  return {
    type: 'video',
    title: 'Deadline note',
    markdown: '![one](attachment://one)\n![two](attachment://two)\n![three](attachment://three)',
    meta: {
      operationId: 'op_deadline123',
      url: 'https://example.test/video',
      attachments: ['one', 'two', 'three'].map((id) => ({
        id,
        fileName: `${id}.png`,
        mimeType: 'image/png',
        content: { encoding: 'base64', data: 'YQ==', byteLength: 1 }
      }))
    }
  };
}

function useTransport(request: typeof fetch) {
  const platform = createPreviewPlatformServices();
  platform.restClient = createFetchRestClient(request);
  registerService(TOKENS.platformServices, () => platform);
}

beforeEach(() => {
  vi.useFakeTimers();
  options = {
    ...DEFAULT_OPTIONS,
    classifier: { ...DEFAULT_OPTIONS.classifier, enabled: false },
    templates: { ...DEFAULT_OPTIONS.templates, video: 'Videos/{title}' },
    rest: {
      baseUrl: 'https://example.test',
      httpsUrl: 'https://example.test',
      httpUrl: 'http://alternate.test',
      vault: 'Vault',
      apiKey: 'test'
    },
    vaultRouter: { vaults: [], rules: [], defaultVaultId: '' }
  };
  vi.spyOn(errorHandler, 'handle').mockImplementation(() => new Promise(() => undefined));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetGlobalRegistry();
});

it('shares one deadline across attachments, preserves confirmations and never writes the remaining attachment or note', async () => {
  let resolveSecond = (_response: Response) => {};
  const request = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(new Response(null, { status: 200 })), 80_000)
        )
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        })
    );
  useTransport(request);
  const result = processClipPayload(payload()).catch(clipProcessingFailureResult);
  const reply = awaitClipSaveResult(() => result);
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(80_000);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1]?.[1]?.signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(40_000);
  const failure = await result;
  expect(failure).toMatchObject({
    success: false,
    outcome: 'unknown',
    failureCategory: 'timeout',
    stage: 'attachments',
    attachmentProgress: {
      phase: 'attachments',
      total: 3,
      confirmed: [{ id: 'one' }]
    }
  });
  await expect(reply).resolves.toMatchObject({
    outcome: 'unknown',
    attachmentProgress: { confirmed: [{ id: 'one' }] }
  });
  expect(request.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
  resolveSecond(new Response(null, { status: 200 }));
  await vi.advanceTimersByTimeAsync(40_000);
  expect(request).toHaveBeenCalledTimes(2);
  expect(failure).toMatchObject({ attachmentProgress: { confirmed: [{ id: 'one' }] } });
});

it('includes classification time in the save deadline and sends no PUT after it expires', async () => {
  options.classifier = { ...DEFAULT_OPTIONS.classifier, enabled: true, timeoutMs: 300_000 };
  const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
  vi.stubGlobal('fetch', request);
  useTransport(request);
  try {
    const result = processClipPayload(payload()).catch(clipProcessingFailureResult);
    await vi.advanceTimersByTimeAsync(120_000);
    await expect(result).resolves.toMatchObject({
      outcome: 'failed',
      failureCategory: 'timeout',
      stage: 'prepare'
    });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('propagates explicit cancellation through the actual processor, route and writer', async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
  useTransport(request);
  const controller = new AbortController();
  const result = processClipPayload(payload(), { signal: controller.signal }).catch(
    clipProcessingFailureResult
  );
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  controller.abort();
  await expect(result).resolves.toMatchObject({
    outcome: 'unknown',
    failureCategory: 'connection',
    stage: 'attachments'
  });
  expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(150_000);
  expect(request).toHaveBeenCalledOnce();
});

it.each([
  { timeout: true, history: false },
  { timeout: true, history: true },
  { timeout: false, history: false },
  { timeout: false, history: true }
])('bounds a pending native digest and preserves history: %j', async ({ timeout, history }) => {
  const request = vi.fn<typeof fetch>();
  useTransport(request);
  const clip = payload();
  const progress: ClipAttachmentProgress | undefined = history
    ? {
        operationId: 'op_deadline123',
        planId: 'a'.repeat(64),
        storageTarget: 'rest-api',
        phase: 'attachments',
        total: 3,
        confirmed: [{ id: 'one', outputPath: 'one.png' }]
      }
    : undefined;
  clip.meta = { ...clip.meta, attachmentProgress: progress };
  const original = structuredClone(progress);
  let finish = (_result: ArrayBuffer) => {};
  const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(
    () =>
      new Promise<ArrayBuffer>((resolve) => {
        finish = resolve;
      })
  );
  const controller = new AbortController();
  const pending = processClipPayload(clip, { signal: controller.signal }).catch(
    clipProcessingFailureResult
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(digest).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();
  if (timeout) await vi.advanceTimersByTimeAsync(120_000);
  else controller.abort();
  const failure = await pending;
  expect(failure).toMatchObject({
    outcome: history ? 'unknown' : 'failed',
    stage: 'prepare',
    failureCategory: timeout ? 'timeout' : 'connection'
  });
  if (!('success' in failure)) throw new Error('Expected interrupted preparation');
  expect(failure.attachmentProgress).toEqual(original);
  expect(progress).toEqual(original);
  finish(new ArrayBuffer(32));
  await vi.advanceTimersByTimeAsync(0);
  expect(digest).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();
  expect(failure.attachmentProgress).toEqual(original);
});
