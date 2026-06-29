import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  classifyClipMock,
  createPayload,
  createWriteSessionMock,
  downloadMock,
  expectDownloadedBlob,
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

describe('clipProcessor downloads', () => {
  beforeEach(() => {
    vi.resetModules();
    resetClipProcessorHarnessMocks();
  });

  afterEach(() => {
    restoreClipProcessorHarnessMocks();
  });

  it('sources downloads progress descriptor fallbacks from default runtime messages', async () => {
    const actualFallbacks = await vi.importActual<
      typeof import('../../../src/i18n/catalog/runtimeFallbackMessages')
    >('../../../src/i18n/catalog/runtimeFallbackMessages');
    vi.doMock('../../../src/i18n/catalog/runtimeFallbackMessages', () => ({
      ...actualFallbacks,
      RUNTIME_FALLBACK_MESSAGES: {
        ...actualFallbacks.RUNTIME_FALLBACK_MESSAGES,
        supportProgressReadingSettings: 'Reading settings sentinel',
        supportProgressSavingDownloads: 'Saving downloads sentinel',
        supportProgressRecordingResult: 'Recording result sentinel'
      }
    }));

    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    classifyClipMock.mockResolvedValue({
      type: 'article',
      topics: [],
      tags: [],
      status: 'success' as const
    });
    resolvePathMock.mockReturnValue('Articles/downloaded-note.md');
    downloadMock.mockResolvedValue(12);
    recordUsageMock.mockResolvedValue(undefined);

    const progressUpdates: Array<{
      value: number;
      message?: { key: string; fallback: string };
    }> = [];

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    await processClipPayload(
      createPayload({
        meta: {
          url: 'https://example.com',
          exportDestination: { kind: 'downloads' }
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
          value: 74,
          message: {
            key: 'supportProgressSavingDownloads',
            fallback: 'Saving downloads sentinel'
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
      status: 'success'
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Articles/downloaded-note.md');
    downloadMock.mockResolvedValue(12);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
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

  it('falls back to downloads for article clips when no writable vault target is configured', async () => {
    const restConfig = { baseUrl: 'https://default', vault: '', apiKey: '' };
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: restConfig,
      vaultRouter: { vaults: [] }
    });
    selectVaultMock.mockReturnValue({
      vault: null,
      restConfig,
      context: {}
    });
    const classificationResult = {
      type: 'article',
      topics: [],
      tags: [],
      status: 'success' as const
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Articles/unconfigured-note.md');
    downloadMock.mockResolvedValue(12);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    const result = await processClipPayload(createPayload());

    expect(selectVaultMock).toHaveBeenCalled();
    expect(createWriteSessionMock).not.toHaveBeenCalled();
    expect(writeMarkdownMock).not.toHaveBeenCalled();
    expect(downloadMock).toHaveBeenCalledWith({
      filename: 'unconfigured-note.md',
      content: '# note',
      mimeType: 'text/markdown;charset=utf-8'
    });
    expect(result).toEqual({
      filePath: 'unconfigured-note.md',
      restVault: '',
      destination: 'downloads',
      storageTarget: 'downloads',
      classification: classificationResult
    });
  });

  it.each([
    ['../escape.md', 'escape.md'],
    ['folder/../escape.md', 'escape.md'],
    ['/absolute.md', 'absolute.md'],
    ['.', 'note.md'],
    ['..', 'note.md'],
    ['folder/.hidden.md', '.hidden.md']
  ])('normalizes unsafe download note path %s to %s', async (resolvedPath, expectedFilename) => {
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
    resolvePathMock.mockReturnValue(resolvedPath);
    downloadMock.mockResolvedValue(12);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    const result = await processClipPayload(
      createPayload({
        meta: {
          url: 'https://example.com',
          exportDestination: { kind: 'downloads' }
        }
      })
    );

    expect(downloadMock).toHaveBeenCalledWith({
      filename: expectedFilename,
      content: '# note',
      mimeType: 'text/markdown;charset=utf-8'
    });
    expect(result.filePath).toBe(expectedFilename);
  });

  it('downloads multiple video screenshots into a note-named folder and indexes them from markdown', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' },
      video: {
        screenshotAttachment: {
          locationTemplate: 'attachments/video/${noteFileName}',
          fileNameTemplate: '${originalAttachmentFileName}',
          markdownUrlFormat: ''
        }
      }
    });
    const classificationResult = {
      type: 'video',
      topics: [],
      tags: [],
      status: 'success'
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Video/video-note.md');
    downloadMock.mockResolvedValue(12);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    await processClipPayload(
      createPayload({
        type: 'video',
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
              content: {
                encoding: 'base64',
                data: 'YWFh',
                byteLength: 3
              }
            },
            {
              id: 'shot-2',
              fileName: 'file-20260509194227986.jpg',
              mimeType: 'image/jpeg',
              content: {
                encoding: 'base64',
                data: 'YmJi',
                byteLength: 3
              }
            }
          ]
        }
      })
    );

    await expectDownloadedBlob(
      0,
      'attachments/video/video-note/file-20260509194226985.jpg',
      'image/jpeg',
      'aaa'
    );
    await expectDownloadedBlob(
      1,
      'attachments/video/video-note/file-20260509194227986.jpg',
      'image/jpeg',
      'bbb'
    );
    expect(downloadMock).toHaveBeenNthCalledWith(3, {
      filename: 'video-note.md',
      content:
        '# video\n![Screenshot](attachments/video/video-note/file-20260509194226985.jpg)\n![Screenshot](attachments/video/video-note/file-20260509194227986.jpg)',
      mimeType: 'text/markdown;charset=utf-8'
    });
  });

  it('normalizes attachment filenames under a safe note-folder stem for downloads', async () => {
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
    resolvePathMock.mockReturnValue('folder/.hidden.md');
    downloadMock.mockResolvedValue(12);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
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
              fileName: '../escape.jpg',
              mimeType: 'image/jpeg',
              content: {
                encoding: 'base64',
                data: 'YWFh',
                byteLength: 3
              }
            },
            {
              id: 'shot-2',
              fileName: '..',
              mimeType: 'image/jpeg',
              content: {
                encoding: 'base64',
                data: 'YmJi',
                byteLength: 3
              }
            }
          ]
        }
      })
    );

    await expectDownloadedBlob(0, '.hidden/escape.jpg', 'image/jpeg', 'aaa');
    await expectDownloadedBlob(1, '.hidden/attachment.jpg', 'image/jpeg', 'bbb');
    expect(downloadMock).toHaveBeenNthCalledWith(3, {
      filename: '.hidden.md',
      content: '# video\n![Screenshot](.hidden/escape.jpg)\n![Screenshot](.hidden/attachment.jpg)',
      mimeType: 'text/markdown;charset=utf-8'
    });
  });

  it('falls back to legacy-safe downloads attachments when a custom video template is malformed', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' },
      video: {
        screenshotAttachment: {
          locationTemplate: 'attachments/video/${noteFileName}',
          fileNameTemplate: "file-${date:{format:'YYYYMMDD'}}.jpg",
          markdownUrlFormat:
            'obsidian://vault/${generatedAttachmentFilePath}?file=${generatedAttachmentFileName}'
        }
      }
    });
    const classificationResult = {
      type: 'video',
      topics: [],
      tags: [],
      status: 'success' as const
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('folder/.hidden.md');
    downloadMock.mockResolvedValue(12);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    await processClipPayload(
      createPayload({
        type: 'video',
        markdown:
          '# video\n![Screenshot](aiob-attachment:shot-1)\n![Screenshot](aiob-attachment:shot-2)',
        meta: {
          url: 'https://youtube.com/watch?v=1',
          exportDestination: { kind: 'downloads' },
          attachments: [
            {
              id: 'shot-1',
              fileName: '../escape.jpg',
              mimeType: 'image/jpeg',
              content: {
                encoding: 'base64',
                data: 'YWFh',
                byteLength: 3
              }
            },
            {
              id: 'shot-2',
              fileName: '..',
              mimeType: 'image/jpeg',
              content: {
                encoding: 'base64',
                data: 'YmJi',
                byteLength: 3
              }
            }
          ]
        }
      })
    );

    await expectDownloadedBlob(0, '.hidden/escape.jpg', 'image/jpeg', 'aaa');
    await expectDownloadedBlob(1, '.hidden/attachment.jpg', 'image/jpeg', 'bbb');
    expect(downloadMock).toHaveBeenNthCalledWith(3, {
      filename: '.hidden.md',
      content: '# video\n![Screenshot](.hidden/escape.jpg)\n![Screenshot](.hidden/attachment.jpg)',
      mimeType: 'text/markdown;charset=utf-8'
    });
  });

  it('writes video screenshots to the Obsidian custom attachment location', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' },
      video: {
        screenshotAttachment: {
          locationTemplate: './attachments/${noteFileName}',
          fileNameTemplate: '${originalAttachmentFileName}',
          markdownUrlFormat: ''
        }
      }
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

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    await processClipPayload(
      createPayload({
        type: 'video',
        markdown: '# video\n![Screenshot](aiob-attachment:shot-1)',
        meta: {
          url: 'https://youtube.com/watch?v=1',
          attachments: [
            {
              id: 'shot-1',
              fileName: 'file-20260509194226985.jpg',
              mimeType: 'image/jpeg',
              content: {
                encoding: 'base64',
                data: 'YWFh',
                byteLength: 3
              }
            }
          ]
        }
      })
    );

    expect(writeAttachmentMock).toHaveBeenCalledTimes(1);
    expect(writeAttachmentMock.mock.calls[0]?.[0]).toBe(
      'Reading/公众号/2026/2026-05-05/attachments/test/file-20260509194226985.jpg'
    );
    expect(writeAttachmentMock.mock.calls[0]?.[2]).toBe('image/jpeg');
    expect(writeAttachmentMock.mock.calls[0]?.[1]).toBeInstanceOf(Blob);
    await expect((writeAttachmentMock.mock.calls[0]?.[1] as Blob).text()).resolves.toBe('aaa');
    expect(writeMarkdownMock).toHaveBeenCalledWith(
      'Reading/公众号/2026/2026-05-05/test.md',
      '# video\n![Screenshot](attachments/test/file-20260509194226985.jpg)'
    );
  });
});
