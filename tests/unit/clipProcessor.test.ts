import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const getOptionsMock = vi.fn();
const selectVaultMock = vi.fn();
const classifyClipMock = vi.fn();
const resolvePathMock = vi.fn();
const writeMarkdownMock = vi.fn();
const recordUsageMock = vi.fn();

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

vi.mock('../../src/background/services/usageStats', () => ({
  recordClipUsage: recordUsageMock
}));

describe('clipProcessor', () => {
  beforeEach(() => {
    vi.resetModules();
    getOptionsMock.mockReset();
    selectVaultMock.mockReset();
    classifyClipMock.mockReset();
    resolvePathMock.mockReset();
    writeMarkdownMock.mockReset();
    recordUsageMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createPayload(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      markdown: '# note',
      title: 'Title',
      type: 'article',
      meta: { url: 'https://example.com' },
      ...overrides
    };
  }

  it('writes markdown and returns processing results', async () => {
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
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } = await import('../../src/background/application/clipProcessor');
    const result = await processClipPayload(createPayload());

    expect(writeMarkdownMock).toHaveBeenCalledWith(
      { baseUrl: 'https://vault', vault: 'Secondary', apiKey: 'key' },
      'Articles/foo.md',
      '# note'
    );
    expect(recordUsageMock).toHaveBeenCalled();
    expect(result).toEqual({
      filePath: 'Articles/foo.md',
      vaultName: 'Secondary Vault',
      restVault: 'Secondary'
    });
  });

  it('logs usage stats failures without throwing', async () => {
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
    resolvePathMock.mockReturnValue('Articles/foo.md');
    writeMarkdownMock.mockResolvedValue(undefined);
    recordUsageMock.mockRejectedValue(new Error('usage failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { processClipPayload } = await import('../../src/background/application/clipProcessor');
    await expect(processClipPayload(createPayload())).resolves.toMatchObject({
      filePath: 'Articles/foo.md',
      restVault: 'Vault'
    });

    expect(recordUsageMock).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[clipProcessor] Failed to record usage stats:', expect.any(Error));
  });
});
