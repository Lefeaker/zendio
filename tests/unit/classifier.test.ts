import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Options } from '../../src/background/store';

const originalFetch = globalThis.fetch;

function createConfig(overrides: Partial<NonNullable<Options['classifier']>> = {}) {
  return {
    enabled: true,
    provider: 'ollama' as const,
    endpoint: 'http://localhost:11434/api/chat',
    apiKey: '',
    model: 'llama3.1',
    taxonomy: {},
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
    const { classify } = await import('../../src/background/llm/classifier');
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        message: { content: JSON.stringify({ type: 'article', topics: ['tech'] }) }
      })
    };

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse as any);

    const result = await classify(
      createConfig(),
      { typeHint: 'article', platform: 'claude', url: 'https://example.com', title: 'Title' },
      'preview'
    );

    expect(result).toEqual({ type: 'article', topics: ['tech'] });
    expect(mockResponse.json).toHaveBeenCalledTimes(1);
  });

  it('throws when provider returns non-ok response', async () => {
    const { classify } = await import('../../src/background/llm/classifier');
    const mockResponse = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: vi.fn().mockResolvedValue('invalid key')
    };

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse as any);

    await expect(
      classify(
        createConfig({ provider: 'openai', apiKey: 'bad' }),
        { typeHint: 'article', platform: 'chatgpt', url: 'https://example.com', title: 'Title' },
        'preview'
      )
    ).rejects.toThrow(/401/);
  });

  it('aborts when response takes too long', async () => {
    const { classify } = await import('../../src/background/llm/classifier');

    const mockFetch = vi.fn().mockImplementation((_input, init: RequestInit | undefined) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });

    globalThis.fetch = mockFetch as any;

    const classifyPromise = classify(
      createConfig(),
      { typeHint: 'article', platform: 'claude', url: 'https://example.com', title: 'Title' },
      'preview'
    );

    const expectation = expect(classifyPromise).rejects.toThrow(/timed out/);

    vi.advanceTimersByTime(15_000);
    await vi.runAllTimersAsync();

    await expectation;
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws when payload is not valid JSON', async () => {
    const { classify } = await import('../../src/background/llm/classifier');
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{invalid json' } }]
      })
    };

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse as any);

    await expect(
      classify(
        createConfig({ provider: 'openai' }),
        { typeHint: 'article', platform: 'chatgpt', url: 'https://example.com', title: 'Title' },
        'preview'
      )
    ).rejects.toThrow(/valid JSON/);
  });
});
