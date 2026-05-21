import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { asType } from '../../utils/typeHelpers';
import type { Options } from '../../../src/background/store';
import { ErrorSeverity } from '@shared/errors/types';
import { DEFAULT_TAXONOMY_CONFIG } from '@shared/types/taxonomy';

const originalFetch = globalThis.fetch;
type FetchParams = [input: RequestInfo | URL, init?: RequestInit];

function createConfig(overrides: Partial<NonNullable<Options['classifier']>> = {}) {
  return {
    enabled: true,
    provider: 'ollama' as const,
    endpoint: 'http://localhost:11434/api/chat',
    apiKey: '',
    model: 'llama3.1',
    taxonomy: DEFAULT_TAXONOMY_CONFIG,
    ...overrides
  };
}

describe('classifier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (globalThis as { fetch?: typeof fetch }).fetch;
    }
  });

  it('parses JSON payload from provider', async () => {
    const { classify } = await import('../../../src/background/llm/classifier');
    const fetchMock = vi.fn<FetchParams, Promise<Response>>().mockResolvedValue(
      createJsonResponse({
        message: { content: JSON.stringify({ type: 'article', topics: ['tech'] }) }
      })
    );
    globalThis.fetch = asType<typeof fetch>(fetchMock);

    const result = await classify(
      createConfig(),
      { typeHint: 'article', platform: 'claude', url: 'https://example.com', title: 'Title' },
      'preview'
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual({ type: 'article', topics: ['tech'] });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns structured error when provider responds with non-ok status', async () => {
    const { classify } = await import('../../../src/background/llm/classifier');
    const fetchMock = vi
      .fn<FetchParams, Promise<Response>>()
      .mockResolvedValue(
        createTextResponse('invalid key', { status: 401, statusText: 'Unauthorized' })
      );
    globalThis.fetch = asType<typeof fetch>(fetchMock);

    const result = await classify(
      createConfig({ provider: 'openai', apiKey: 'bad' }),
      { typeHint: 'article', platform: 'chatgpt', url: 'https://example.com', title: 'Title' },
      'preview'
    );

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toMatchObject({
        code: 'CLASSIFIER_TRANSPORT_FAILURE',
        domain: 'classifier',
        message: 'invalid key',
        severity: ErrorSeverity.ERROR
      });
      expect(result.error.context).toMatchObject({
        provider: 'openai',
        status: 401
      });
    }
  });

  it('returns timeout error when response takes too long', async () => {
    const { classify } = await import('../../../src/background/llm/classifier');

    const mockFetch = vi.fn<FetchParams, Promise<Response>>().mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal ?? undefined;
        signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });

    globalThis.fetch = asType<typeof fetch>(mockFetch);

    const classifyPromise = classify(
      createConfig(),
      { typeHint: 'article', platform: 'claude', url: 'https://example.com', title: 'Title' },
      'preview'
    );

    vi.advanceTimersByTime(15_000);
    await vi.runAllTimersAsync();

    const result = await classifyPromise;
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error.code).toBe('CLASSIFIER_TIMEOUT');
      expect(result.error.context).toMatchObject({ provider: 'ollama' });
    }
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns parse error when payload is not valid JSON', async () => {
    const { classify } = await import('../../../src/background/llm/classifier');
    const fetchMock = vi.fn<FetchParams, Promise<Response>>().mockResolvedValue(
      createJsonResponse({
        choices: [{ message: { content: '{invalid json' } }]
      })
    );
    globalThis.fetch = asType<typeof fetch>(fetchMock);

    const result = await classify(
      createConfig({ provider: 'openai' }),
      { typeHint: 'article', platform: 'chatgpt', url: 'https://example.com', title: 'Title' },
      'preview'
    );

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error.code).toBe('CLASSIFIER_INVALID_PAYLOAD');
      expect(result.error.context).toMatchObject({ provider: 'openai' });
    }
  });

  it('rejects invalid classification request input at the boundary', async () => {
    const { classify } = await import('../../../src/background/llm/classifier');

    await expect(
      classify(
        createConfig(),
        { typeHint: '', platform: 'claude', url: 'https://example.com', title: 'Title' },
        'preview'
      )
    ).rejects.toThrow();
  });
});

function createJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
    ...init
  });
}

function createTextResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, init);
}
