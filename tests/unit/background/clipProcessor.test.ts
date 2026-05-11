import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ErrorSeverity } from '@shared/errors';
import { ClipProcessingResultSchema } from '@shared/schemas';

const getOptionsMock = vi.fn();
const selectVaultMock = vi.fn();
const classifyClipMock = vi.fn();
const resolvePathMock = vi.fn();
const writeMarkdownMock = vi.fn();
const writeAttachmentMock = vi.fn();
const createWriteSessionMock = vi.fn();
const recordUsageMock = vi.fn();
const downloadMock = vi.fn();
const getServiceMock = vi.hoisted(() =>
  vi.fn(() => ({
    downloads: {
      download: downloadMock
    }
  }))
);

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
  createVaultWriteSession: createWriteSessionMock,
  writeMarkdownToVault: writeMarkdownMock,
  writeAttachmentToVault: writeAttachmentMock
}));

vi.mock('../../../src/background/services/usageStats', () => ({
  recordClipUsage: recordUsageMock
}));

vi.mock('../../../src/shared/di', () => ({
  getService: getServiceMock
}));

describe('clipProcessor', () => {
  beforeEach(() => {
    vi.resetModules();
    getOptionsMock.mockReset();
    selectVaultMock.mockReset();
    classifyClipMock.mockReset();
    resolvePathMock.mockReset();
    writeMarkdownMock.mockReset();
    writeAttachmentMock.mockReset();
    createWriteSessionMock.mockReset();
    recordUsageMock.mockReset();
    downloadMock.mockReset();
    getServiceMock.mockReset();
    getServiceMock.mockReturnValue({
      downloads: {
        download: downloadMock
      }
    });
    createWriteSessionMock.mockResolvedValue({
      target: { storageTarget: 'rest-api' },
      writeMarkdown: writeMarkdownMock,
      writeAttachment: writeAttachmentMock
    });
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

    expect(createWriteSessionMock).toHaveBeenCalledWith(
      {
        baseUrl: 'https://vault',
        vault: 'Secondary',
        apiKey: 'key'
      },
      {}
    );
    expect(writeMarkdownMock).toHaveBeenCalledWith('Articles/foo.md', '# note');
    expect(recordUsageMock).toHaveBeenCalled();
    expect(result).toEqual({
      filePath: 'Articles/foo.md',
      vaultName: 'Secondary Vault',
      restVault: 'Secondary',
      destination: 'vault',
      storageTarget: 'rest-api',
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
      restVault: 'Vault',
      storageTarget: 'rest-api'
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
      expect(parseResult.data.storageTarget).toBe('rest-api');
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
      storageTarget: 'downloads',
      classification: classificationResult
    });
  });

  it('downloads multiple video screenshots into a note-named folder and indexes them from markdown', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    const classificationResult = {
      type: 'video',
      topics: [],
      tags: [],
      status: 'success' as const
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Video/video-note.md');
    downloadMock.mockResolvedValue(12);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } = await import(
      '../../../src/background/application/clipProcessor'
    );
    await processClipPayload(
      createPayload({
        markdown:
          '# video\n![Screenshot](aiob-attachment:shot-1)\n![Screenshot](aiob-attachment:shot-2)',
        meta: {
          url: 'https://youtube.com/watch?v=1',
          exportDestination: { kind: 'downloads' },
          attachments: [
            {
              id: 'shot-1',
              fileName: 'file-20260509194226985.jpg',
              mimeType: 'image/jpeg',
              dataUrl: 'data:image/jpeg;base64,aaa'
            },
            {
              id: 'shot-2',
              fileName: 'file-20260509194227986.jpg',
              mimeType: 'image/jpeg',
              dataUrl: 'data:image/jpeg;base64,bbb'
            }
          ]
        }
      })
    );

    expect(downloadMock).toHaveBeenNthCalledWith(1, {
      filename: 'video-note/file-20260509194226985.jpg',
      url: 'data:image/jpeg;base64,aaa',
      mimeType: 'image/jpeg'
    });
    expect(downloadMock).toHaveBeenNthCalledWith(2, {
      filename: 'video-note/file-20260509194227986.jpg',
      url: 'data:image/jpeg;base64,bbb',
      mimeType: 'image/jpeg'
    });
    expect(downloadMock).toHaveBeenNthCalledWith(3, {
      filename: 'video-note.md',
      content:
        '# video\n![Screenshot](video-note/file-20260509194226985.jpg)\n![Screenshot](video-note/file-20260509194227986.jpg)',
      mimeType: 'text/markdown;charset=utf-8'
    });
  });

  it('writes video screenshots to the Obsidian custom attachment location', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    selectVaultMock.mockReturnValue({
      vault: null,
      restConfig: { baseUrl: 'https://default', vault: 'Vault', apiKey: 'key' },
      context: {}
    });
    const classificationResult = {
      type: 'video',
      topics: [],
      tags: [],
      status: 'success' as const
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Reading/公众号/2026/2026-05-05/test.md');
    writeAttachmentMock.mockResolvedValue(undefined);
    writeMarkdownMock.mockResolvedValue(undefined);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } = await import(
      '../../../src/background/application/clipProcessor'
    );
    await processClipPayload(
      createPayload({
        markdown: '# video\n![Screenshot](aiob-attachment:shot-1)',
        meta: {
          url: 'https://youtube.com/watch?v=1',
          attachments: [
            {
              id: 'shot-1',
              fileName: 'file-20260509194226985.jpg',
              mimeType: 'image/jpeg',
              dataUrl: 'data:image/jpeg;base64,aaa'
            }
          ]
        }
      })
    );

    expect(writeAttachmentMock).toHaveBeenCalledWith(
      'Reading/公众号/2026/2026-05-05/assets/test/file-20260509194226985.jpg',
      'data:image/jpeg;base64,aaa',
      'image/jpeg'
    );
    expect(writeMarkdownMock).toHaveBeenCalledWith(
      'Reading/公众号/2026/2026-05-05/test.md',
      '# video\n![Screenshot](assets/test/file-20260509194226985.jpg)'
    );
  });

  it('returns the actual local storage target from the write session', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    selectVaultMock.mockReturnValue({
      vault: { name: 'Local Routed Vault' },
      restConfig: {
        baseUrl: 'https://vault',
        vault: 'RemoteName',
        apiKey: 'key',
        localFolderId: 'folder-main',
        localFolderName: 'LocalMain'
      },
      context: {}
    });
    createWriteSessionMock.mockResolvedValue({
      target: { storageTarget: 'local-folder', localFolderName: 'LocalMain' },
      writeMarkdown: writeMarkdownMock,
      writeAttachment: writeAttachmentMock
    });
    const classificationResult = {
      type: 'article',
      topics: [],
      tags: [],
      status: 'success' as const
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Articles/local.md');
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } = await import(
      '../../../src/background/application/clipProcessor'
    );
    const result = await processClipPayload(createPayload());

    expect(result).toMatchObject({
      filePath: 'Articles/local.md',
      vaultName: 'Local Routed Vault',
      restVault: 'RemoteName',
      destination: 'vault',
      storageTarget: 'local-folder',
      localFolderName: 'LocalMain'
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
