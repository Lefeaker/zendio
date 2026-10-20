import { afterEach, expect, it, vi } from 'vitest';
import { createFetchRestClient } from '../../../src/infrastructure/restClient';
import { classify } from '../../../src/background/llm/classifier';
import { errorHandler } from '../../../src/shared/errors';
import { DEFAULT_TAXONOMY_CONFIG } from '../../../src/shared/types/taxonomy';

const connection = { baseUrl: 'https://example.test', vault: 'Vault', apiKey: 'test' };
const meta = { typeHint: 'article', platform: 'unknown', url: '', title: 'Example' };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('aborts and settles a standalone REST request before the content reply expires', async () => {
  vi.useFakeTimers();
  const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
  let settled = false;
  const result = createFetchRestClient(request).writeFile(connection, 'note.md', 'content');
  void result.catch(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(120_000);
  expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(settled).toBe(true);
  await expect(result).rejects.toMatchObject({ failureCategory: 'timeout' });
});

it('uses the configured classifier deadline for the actual network request', async () => {
  vi.useFakeTimers();
  const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
  vi.stubGlobal('fetch', request);
  let settled = false;
  const result = classify(
    {
      enabled: true,
      provider: 'ollama',
      endpoint: 'http://example.test',
      apiKey: '',
      model: 'model',
      taxonomy: DEFAULT_TAXONOMY_CONFIG,
      timeoutMs: 50
    },
    meta,
    'preview'
  );
  void result.then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(50);
  expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(settled).toBe(true);
  await expect(result).resolves.toMatchObject({ ok: false, error: { code: 'CLASSIFIER_TIMEOUT' } });
});

it('keeps the deadline through a stalled HTTP error body and never tries the alternate protocol', async () => {
  vi.useFakeTimers();
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(new ReadableStream(), { status: 500 }));
  const result = createFetchRestClient(request).writeFile(
    {
      ...connection,
      httpsUrl: 'https://primary.test',
      httpUrl: 'http://alternate.test'
    },
    'note.md',
    'content',
    { deadlineAt: Date.now() + 50 }
  );
  const rejected = expect(result).rejects.toMatchObject({ failureCategory: 'timeout' });
  await vi.advanceTimersByTimeAsync(50);
  await rejected;
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});

it('does not continue fallback when an abort-ignoring fetch rejects late', async () => {
  vi.useFakeTimers();
  let rejectRequest = (_reason: Error) => {};
  const request = vi.fn<typeof fetch>().mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      })
  );
  const result = createFetchRestClient(request).writeFile(
    {
      ...connection,
      httpsUrl: 'https://primary.test',
      httpUrl: 'http://alternate.test'
    },
    'note.md',
    'content',
    { deadlineAt: Date.now() + 50 }
  );
  const rejected = expect(result).rejects.toMatchObject({ failureCategory: 'timeout' });
  await vi.advanceTimersByTimeAsync(50);
  await rejected;
  rejectRequest(new Error('Failed to fetch'));
  await vi.advanceTimersByTimeAsync(0);
  expect(request).toHaveBeenCalledTimes(1);
});

it('cancels only the requested concurrent write and removes its external listener', async () => {
  vi.useFakeTimers();
  const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
  const client = createFetchRestClient(request);
  const controller = new AbortController();
  const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
  const first = client.writeFile(connection, 'first.md', 'content', { signal: controller.signal });
  const second = client.writeFile(connection, 'second.md', 'content', {
    deadlineAt: Date.now() + 100
  });
  const firstRejected = expect(first).rejects.toMatchObject({ failureCategory: 'connection' });
  const secondRejected = expect(second).rejects.toMatchObject({ failureCategory: 'timeout' });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort('private caller reason');
  await firstRejected;
  expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(request.mock.calls[1]?.[1]?.signal?.aborted).toBe(false);
  expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
  await vi.advanceTimersByTimeAsync(100);
  await secondRejected;
  expect(vi.getTimerCount()).toBe(0);
});

it('sends no request for an already cancelled or expired write', async () => {
  const request = vi.fn<typeof fetch>();
  const client = createFetchRestClient(request);
  const controller = new AbortController();
  controller.abort();
  await expect(
    client.writeFile(connection, 'note.md', 'content', { signal: controller.signal })
  ).rejects.toMatchObject({ failureCategory: 'connection' });
  await expect(
    client.writeFile(connection, 'note.md', 'content', { deadlineAt: Date.now() - 1 })
  ).rejects.toMatchObject({ failureCategory: 'timeout' });
  expect(request).not.toHaveBeenCalled();
});

it('confirms successful PUT headers without waiting for an unused body cancellation', async () => {
  vi.useFakeTimers();
  const cancel = vi.fn(() => new Promise<void>(() => undefined));
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 200 }));
  await expect(
    createFetchRestClient(request).writeFile(connection, 'note.md', 'content')
  ).resolves.toBeUndefined();
  expect(cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not let error reporting hold the next permitted protocol attempt', async () => {
  vi.useFakeTimers();
  vi.spyOn(errorHandler, 'handle').mockImplementation(() => new Promise(() => undefined));
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  await expect(
    createFetchRestClient(request).writeFile(
      {
        ...connection,
        httpsUrl: 'https://primary.test',
        httpUrl: 'http://alternate.test'
      },
      'note.md',
      'content'
    )
  ).resolves.toBeUndefined();
  expect(request).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(vi.getTimerCount()).toBe(0);
});
