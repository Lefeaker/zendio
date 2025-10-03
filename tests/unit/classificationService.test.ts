import { describe, it, expect, beforeEach, vi } from 'vitest';

const classifyMock = vi.fn();

vi.mock('../../src/background/llm/classifier', () => ({
  classify: classifyMock
}));

describe('classificationService', () => {
  beforeEach(() => {
    vi.resetModules();
    classifyMock.mockReset();
  });

  it('returns fallback when classifier disabled', async () => {
    const { classifyClip } = await import('../../src/background/services/classificationService');
    const options = createOptions({ enabled: false });
    const payload = createPayload();

    const result = await classifyClip(options, payload);
    expect(result.type).toBe(payload.type);
    expect(classifyMock).not.toHaveBeenCalled();
  });

  it('returns classifier result when invocation succeeds', async () => {
    const { classifyClip } = await import('../../src/background/services/classificationService');
    const options = createOptions({ enabled: true });
    const payload = createPayload();
    const classifierResult = { type: 'custom', topics: ['tech'] };

    classifyMock.mockResolvedValueOnce(classifierResult);

    const result = await classifyClip(options, payload);
    expect(result).toEqual(classifierResult);
  });

  it('falls back when classifier throws', async () => {
    const { classifyClip } = await import('../../src/background/services/classificationService');
    const options = createOptions({ enabled: true });
    const payload = createPayload();

    classifyMock.mockRejectedValueOnce(new Error('network'));

    const result = await classifyClip(options, payload);
    expect(result.type).toBe(payload.type);
  });

  it('limits preview length to 4000 characters', async () => {
    const { createClassificationPreview } = await import('../../src/background/services/classificationService');
    const longMarkdown = '#'.repeat(6000);
    const payload = createPayload({ markdown: longMarkdown });

    const preview = createClassificationPreview(payload);
    expect(preview.length).toBeLessThanOrEqual(4000);
  });
});

function createOptions(classifierOverrides: Partial<{ enabled: boolean }> = {}) {
  return {
    rest: {
      baseUrl: 'https://127.0.0.1:27124/',
      httpsUrl: 'https://127.0.0.1:27124/',
      httpUrl: 'http://127.0.0.1:27123/',
      vault: 'Default',
      apiKey: 'key',
      rootDir: 'root'
    },
    templates: {
      article: '',
      ai: '',
      fragment: ''
    },
    domainMappings: {},
    classifier: {
      enabled: classifierOverrides.enabled ?? true,
      provider: 'ollama',
      endpoint: 'http://localhost:11434/api/chat',
      apiKey: '',
      model: 'llama3.1',
      taxonomy: {}
    },
    deepResearch: undefined,
    vaultRouter: undefined,
    fragmentClipper: undefined
  };
}

function createPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    markdown: '# Title',
    title: 'Title',
    type: 'article',
    meta: {
      url: 'https://example.com/post',
      platform: 'test'
    },
    ...overrides
  } as any;
}
