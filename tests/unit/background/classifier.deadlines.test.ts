import { afterEach, expect, it, vi } from 'vitest';
import { classify } from '../../../src/background/llm/classifier';
import { classifyClip } from '../../../src/background/services/classificationService';
import { DEFAULT_OPTIONS } from '../../../src/shared/config';
import type { Options } from '../../../src/background/store';
import { DEFAULT_TAXONOMY_CONFIG } from '../../../src/shared/types/taxonomy';
import { errorHandler } from '../../../src/shared/errors';

const config: NonNullable<Options['classifier']> = {
  enabled: true,
  provider: 'ollama',
  endpoint: 'http://example.test',
  apiKey: '',
  model: 'model',
  taxonomy: DEFAULT_TAXONOMY_CONFIG
};
const meta = { typeHint: 'article', platform: 'unknown', url: '', title: 'Example' };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('uses the same configured deadline for fallback and a stalled JSON response body', async () => {
  vi.useFakeTimers();
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(new ReadableStream(), { status: 200 }));
  vi.stubGlobal('fetch', request);
  const result = classifyClip(
    { ...DEFAULT_OPTIONS, classifier: { ...config, timeoutMs: 50 } },
    {
      type: 'article',
      title: 'Example',
      markdown: 'preview'
    }
  );
  await vi.advanceTimersByTimeAsync(50);
  await expect(result).resolves.toMatchObject({ status: 'fallback', fallbackReason: 'timeout' });
  expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('aborts a stalled non-OK body at the missing-config default of two seconds', async () => {
  vi.useFakeTimers();
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(new ReadableStream(), { status: 503 }));
  vi.stubGlobal('fetch', request);
  const result = classify(config, meta, 'preview');
  await vi.advanceTimersByTimeAsync(1_999);
  expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await expect(result).resolves.toMatchObject({ ok: false, error: { code: 'CLASSIFIER_TIMEOUT' } });
  expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});

it('isolates concurrent request deadlines and preserves explicit cancellation as transport failure', async () => {
  vi.useFakeTimers();
  const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
  vi.stubGlobal('fetch', request);
  const controller = new AbortController();
  const first = classify({ ...config, timeoutMs: 50 }, meta, 'first');
  const second = classify({ ...config, timeoutMs: 15_000 }, meta, 'second', {
    signal: controller.signal
  });
  await vi.advanceTimersByTimeAsync(50);
  await expect(first).resolves.toMatchObject({ ok: false, error: { code: 'CLASSIFIER_TIMEOUT' } });
  expect(request.mock.calls[1]?.[1]?.signal?.aborted).toBe(false);
  controller.abort();
  await expect(second).resolves.toMatchObject({
    ok: false,
    error: { code: 'CLASSIFIER_TRANSPORT_FAILURE', message: 'REQUEST_CANCELLED' }
  });
  expect(request.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('caps a long configured classifier request at the saving operation deadline', async () => {
  vi.useFakeTimers();
  const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
  vi.stubGlobal('fetch', request);
  const result = classify({ ...config, timeoutMs: 300_000 }, meta, 'preview', {
    deadlineAt: Date.now() + 120_000
  });
  await vi.advanceTimersByTimeAsync(120_000);
  await expect(result).resolves.toMatchObject({ ok: false, error: { code: 'CLASSIFIER_TIMEOUT' } });
  expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});

it('returns fallback without waiting for a stalled error reporter', async () => {
  vi.useFakeTimers();
  vi.spyOn(errorHandler, 'handle').mockImplementation(() => new Promise(() => undefined));
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('network unavailable')));
  const result = await classifyClip(
    { ...DEFAULT_OPTIONS, classifier: config },
    { title: 'Example', markdown: 'preview' }
  );
  expect(result).toMatchObject({ status: 'fallback', fallbackReason: 'error' });
  await vi.advanceTimersByTimeAsync(2_000);
  expect(vi.getTimerCount()).toBe(0);
});

it('cannot turn a late success from an abort-ignoring provider into classification success', async () => {
  vi.useFakeTimers();
  let resolveRequest = (_response: Response) => {};
  const request = vi.fn<typeof fetch>().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
  );
  vi.stubGlobal('fetch', request);
  const result = classify({ ...config, timeoutMs: 50 }, meta, 'preview');
  await vi.advanceTimersByTimeAsync(50);
  await expect(result).resolves.toMatchObject({ ok: false, error: { code: 'CLASSIFIER_TIMEOUT' } });
  resolveRequest(new Response(JSON.stringify({ message: { content: '{"type":"late"}' } })));
  await vi.advanceTimersByTimeAsync(0);
  await expect(result).resolves.toMatchObject({ ok: false, error: { code: 'CLASSIFIER_TIMEOUT' } });
  expect(request).toHaveBeenCalledOnce();
});
