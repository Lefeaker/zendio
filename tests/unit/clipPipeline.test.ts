import { describe, it, expect, beforeEach, vi } from 'vitest';

const getOptionsMock = vi.fn();
const selectVaultMock = vi.fn();
const classifyClipMock = vi.fn();
const resolvePathMock = vi.fn();
const writeMarkdownMock = vi.fn();
const notifySuccessMock = vi.fn();
const notifyFailureMock = vi.fn();

const templateOptions = { article: '', fragment: '', clipper: '', reading: '', ai: '' } as const;

vi.mock('../../src/background/store', () => ({
  getOptions: getOptionsMock
}));

vi.mock('../../src/background/services/vaultRouterService', () => ({
  selectVaultForClip: selectVaultMock
}));

vi.mock('../../src/background/services/classificationService', () => ({
  classifyClip: classifyClipMock
}));

vi.mock('../../src/background/pathResolver', () => ({
  resolvePath: resolvePathMock
}));

vi.mock('../../src/background/services/obsidianWriter', () => ({
  writeMarkdownToVault: writeMarkdownMock
}));

vi.mock('../../src/background/services/notifications', () => ({
  notifyClipSuccess: notifySuccessMock,
  notifyClipFailure: notifyFailureMock
}));

describe('background clipPipeline', () => {
  beforeEach(() => {
    vi.resetModules();
    getOptionsMock.mockReset();
    selectVaultMock.mockReset();
    classifyClipMock.mockReset();
    resolvePathMock.mockReset();
    writeMarkdownMock.mockReset();
    notifySuccessMock.mockReset();
    notifyFailureMock.mockReset();
  });

  function createMessage(payloadOverrides: Partial<Record<string, unknown>> = {}) {
    return {
      type: 'CLIP_RESULT' as const,
      payload: {
        markdown: '# note',
        title: 'Title',
        type: 'article',
        meta: { url: 'https://example.com' },
        ...payloadOverrides
      }
    };
  }

  it('writes markdown to selected vault and notifies success', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    selectVaultMock.mockReturnValue({
      vault: { name: 'Secondary Vault' },
      restConfig: { baseUrl: 'https://vault', vault: 'Secondary', apiKey: 'key' },
      context: {}
    });
    classifyClipMock.mockResolvedValue({ type: 'article' });
    resolvePathMock.mockReturnValue('Articles/foo.md');
    writeMarkdownMock.mockResolvedValue(undefined);

    const { handleClipResult } = await import('../../src/background/pipelines/clipPipeline');
    await handleClipResult(createMessage());

    expect(writeMarkdownMock).toHaveBeenCalledWith({ baseUrl: 'https://vault', vault: 'Secondary', apiKey: 'key' }, 'Articles/foo.md', '# note');
    expect(notifySuccessMock).toHaveBeenCalledWith('Articles/foo.md', 'Secondary Vault');
    expect(notifyFailureMock).not.toHaveBeenCalled();
  });

  it('rejects payloads without markdown', async () => {
    const { handleClipResult } = await import('../../src/background/pipelines/clipPipeline');
    await handleClipResult(createMessage({ markdown: undefined }));

    expect(notifyFailureMock).toHaveBeenCalledWith('Invalid clip payload: missing markdown content');
    expect(writeMarkdownMock).not.toHaveBeenCalled();
  });

  it('notifies failure when writing to vault throws', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    selectVaultMock.mockReturnValue({
      vault: null,
      restConfig: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' },
      context: {}
    });
    classifyClipMock.mockResolvedValue({ type: 'article' });
    resolvePathMock.mockReturnValue('Articles/fail.md');
    writeMarkdownMock.mockRejectedValue(new Error('network'));

    const { handleClipResult } = await import('../../src/background/pipelines/clipPipeline');
    await handleClipResult(createMessage());

    expect(writeMarkdownMock).toHaveBeenCalled();
    expect(notifyFailureMock).toHaveBeenCalled();
  });
});
