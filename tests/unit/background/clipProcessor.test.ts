import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ErrorSeverity } from '@shared/errors';
import { ClipProcessingResultSchema } from '@shared/schemas';

const getOptionsMock = vi.fn();
const selectVaultMock = vi.fn();
const classifyClipMock = vi.fn();
const resolvePathMock = vi.fn();
const writeMarkdownMock = vi.fn();
const recordUsageMock = vi.fn();
const downloadMock = vi.fn();

const templateOptions = { article: '', fragment: '', reading: '', ai: '' } as const;

vi.mock('../../../src/background/store', () => ({
  getOptions: getOptionsMock
}));

vi.mock('../../../src/background/services/vaultRouterService', () => ({
  selectVaultForClip: selectVaultMock
}));

vi.mock('../../../src/background/services/classificationService', () => ({
  classifyClip: classifyClipMock
}));

vi.mock('../../../src/background/pathResolver', () => ({
  resolvePath: resolvePathMock
}));

vi.mock('../../../src/background/services/obsidianWriter', () => ({
  writeMarkdownToVault: writeMarkdownMock
}));

vi.mock('../../../src/background/services/usageStats', () => ({
  recordClipUsage: recordUsageMock
}));

vi.mock('../../../src/platform', () => ({
  getPlatformServices: () => ({
    downloads: {
      download: downloadMock
    }
  })
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
    downloadMock.mockReset();
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
    const classificationResult = {
      type: 'article',
      topics: [],
      tags: [],
      status: 'success' as const
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Articles/foo.md');
    writeMarkdownMock.mockResolvedValue(undefined);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } = await import(
      '../../../src/background/application/clipProcessor'
    );
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
      restVault: 'Secondary',
      destination: 'vault',
      classification: classificationResult
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
    const classificationResult = {
      type: 'article',
      topics: [],
      tags: [],
      status: 'success' as const
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Articles/foo.md');
    writeMarkdownMock.mockResolvedValue(undefined);
    recordUsageMock.mockRejectedValue(new Error('usage failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { processClipPayload } = await import(
      '../../../src/background/application/clipProcessor'
    );
    await expect(processClipPayload(createPayload())).resolves.toMatchObject({
      filePath: 'Articles/foo.md',
      destination: 'vault',
      restVault: 'Vault'
    });

    expect(recordUsageMock).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[clipProcessor] Failed to record usage stats:',
      expect.any(Error)
    );
  });

  it('returns result that conforms to ClipProcessingResultSchema', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    selectVaultMock.mockReturnValue({
      vault: { name: 'Test Vault' },
      restConfig: { baseUrl: 'https://vault', vault: 'Test', apiKey: 'key' },
      context: {}
    });
    const classificationResult = {
      type: 'article',
      topics: ['tech'],
      tags: ['test'],
      status: 'success' as const
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Articles/test.md');
    writeMarkdownMock.mockResolvedValue(undefined);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } = await import(
      '../../../src/background/application/clipProcessor'
    );
    const result = await processClipPayload(createPayload());

    // Verify result conforms to Schema
    const parseResult = ClipProcessingResultSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data).toEqual(result);
      expect(parseResult.data.filePath).toBe('Articles/test.md');
      expect(parseResult.data.restVault).toBe('Test');
      expect(parseResult.data.vaultName).toBe('Test Vault');
      expect(parseResult.data.destination).toBe('vault');
      expect(parseResult.data.classification).toEqual(classificationResult);
    }
  });

  it('downloads markdown instead of writing to a vault when downloads is selected', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    const classificationResult = {
      type: 'article',
      topics: [],
      tags: [],
      status: 'success' as const
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Articles/downloaded-note.md');
    downloadMock.mockResolvedValue(12);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } = await import(
      '../../../src/background/application/clipProcessor'
    );
    const result = await processClipPayload(
      createPayload({
        meta: {
          url: 'https://example.com',
          exportDestination: { kind: 'downloads' }
        }
      })
    );

    expect(selectVaultMock).not.toHaveBeenCalled();
    expect(writeMarkdownMock).not.toHaveBeenCalled();
    expect(downloadMock).toHaveBeenCalledWith({
      filename: 'downloaded-note.md',
      content: '# note',
      mimeType: 'text/markdown;charset=utf-8'
    });
    expect(result).toEqual({
      filePath: 'downloaded-note.md',
      restVault: '',
      destination: 'downloads',
      classification: classificationResult
    });
  });

  it('includes classificationWarning when classification falls back with error', async () => {
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
    const errorDetail = {
      code: 'TEST_ERROR',
      domain: 'classifier' as const,
      message: 'Classification failed',
      severity: ErrorSeverity.ERROR,
      recoverable: true
    };
    const classificationResult = {
      type: 'article',
      topics: [],
      tags: [],
      status: 'fallback' as const,
      fallbackReason: 'error' as const,
      errorDetail
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Articles/test.md');
    writeMarkdownMock.mockResolvedValue(undefined);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } = await import(
      '../../../src/background/application/clipProcessor'
    );
    const result = await processClipPayload(createPayload());

    // Verify result includes classificationWarning
    expect(result.classificationWarning).toEqual(errorDetail);

    // Verify result conforms to Schema
    const parseResult = ClipProcessingResultSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
  });
});
