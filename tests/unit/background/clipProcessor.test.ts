import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ClipProcessingResultSchema } from '@shared/schemas';
import {
  classifyClipMock,
  createPayload,
  createWriteSessionMock,
  getOptionsMock,
  recordUsageMock,
  resetClipProcessorHarnessMocks,
  resolvePathMock,
  restoreClipProcessorHarnessMocks,
  selectVaultMock,
  templateOptions,
  writeAttachmentMock,
  writeMarkdownMock
} from './clipTestHarness';

describe('clipProcessor', () => {
  beforeEach(() => {
    vi.resetModules();
    resetClipProcessorHarnessMocks();
  });

  afterEach(() => {
    restoreClipProcessorHarnessMocks();
  });

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
      status: 'success'
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Articles/foo.md');
    writeMarkdownMock.mockResolvedValue(undefined);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
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

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
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

  it('sources vault progress descriptor fallbacks from default runtime messages', async () => {
    const actualFallbacks = await vi.importActual<
      typeof import('../../../src/i18n/catalog/runtimeFallbackMessages')
    >('../../../src/i18n/catalog/runtimeFallbackMessages');
    vi.doMock('../../../src/i18n/catalog/runtimeFallbackMessages', () => ({
      ...actualFallbacks,
      RUNTIME_FALLBACK_MESSAGES: {
        ...actualFallbacks.RUNTIME_FALLBACK_MESSAGES,
        supportProgressReadingSettings: 'Reading settings sentinel',
        supportProgressSelectingVault: 'Selecting vault sentinel',
        supportProgressWritingAttachments: 'Writing attachments sentinel',
        supportProgressWritingNote: 'Writing note sentinel',
        supportProgressRecordingResult: 'Recording result sentinel'
      }
    }));

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
    classifyClipMock.mockResolvedValue({
      type: 'video',
      topics: [],
      tags: [],
      status: 'success' as const
    });
    resolvePathMock.mockReturnValue('Videos/example.md');
    writeMarkdownMock.mockResolvedValue(undefined);
    writeAttachmentMock.mockResolvedValue(undefined);
    recordUsageMock.mockResolvedValue(undefined);

    const progressUpdates: Array<{
      value: number;
      message?: { key: string; fallback: string };
    }> = [];

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    await processClipPayload(
      createPayload({
        type: 'video',
        meta: {
          url: 'https://example.com/video',
          attachments: [
            {
              id: 'shot-1',
              fileName: 'frame-1.jpg',
              mimeType: 'image/jpeg',
              content: {
                encoding: 'base64',
                data: 'YWFh',
                byteLength: 3
              }
            }
          ]
        }
      }),
      {
        onProgress: (progress) => {
          let message:
            | {
                key: string;
                fallback: string;
              }
            | undefined;
          if (progress.message) {
            if (typeof progress.message.fallback !== 'string') {
              throw new Error('expected progress message fallback to be present');
            }
            message = {
              key: progress.message.key,
              fallback: progress.message.fallback
            };
          }
          progressUpdates.push({
            value: progress.value,
            message
          });
        }
      }
    );

    expect(progressUpdates).toEqual(
      expect.arrayContaining([
        {
          value: 48,
          message: {
            key: 'supportProgressReadingSettings',
            fallback: 'Reading settings sentinel'
          }
        },
        {
          value: 56,
          message: {
            key: 'supportProgressSelectingVault',
            fallback: 'Selecting vault sentinel'
          }
        },
        {
          value: 68,
          message: {
            key: 'supportProgressWritingAttachments',
            fallback: 'Writing attachments sentinel'
          }
        },
        {
          value: 82,
          message: {
            key: 'supportProgressWritingNote',
            fallback: 'Writing note sentinel'
          }
        },
        {
          value: 94,
          message: {
            key: 'supportProgressRecordingResult',
            fallback: 'Recording result sentinel'
          }
        }
      ])
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

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
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
});
