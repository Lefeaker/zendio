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
type TrackUsageEventMock = (eventName: string, params?: Record<string, unknown>) => Promise<void>;
type TrackUsageEventCall = Parameters<TrackUsageEventMock>;
const trackUsageEventMock = vi.fn<TrackUsageEventMock>();
const trackActivationMilestoneIfNeededMock = vi.fn(() => Promise.resolve(undefined));
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

vi.mock('../../../src/background/services/analyticsEvents', () => ({
  trackUsageEvent: trackUsageEventMock,
  trackActivationMilestoneIfNeeded: trackActivationMilestoneIfNeededMock
}));

vi.mock('../../../src/shared/di', () => ({
  getService: getServiceMock
}));

const FORBIDDEN_ANALYTICS_KEYS = new Set([
  'classification_fallback_reason',
  'classification_status',
  'classification_type',
  'createdAt',
  'duration_ms',
  'error_code',
  'fallback_reason',
  'filePath',
  'localFolderName',
  'markdown',
  'messages',
  'model',
  'notePath',
  'restVault',
  'title',
  'url',
  'vaultName'
]);

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
    trackUsageEventMock.mockReset();
    trackActivationMilestoneIfNeededMock.mockReset();
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
    trackUsageEventMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.doUnmock('../../../src/i18n/catalog/runtimeFallbackMessages');
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

  async function expectDownloadedBlob(
    callIndex: number,
    expectedFilename: string,
    expectedMimeType: string,
    expectedText: string
  ): Promise<void> {
    const options = downloadMock.mock.calls[callIndex]?.[0] as
      | {
          filename: string;
          mimeType?: string;
          blob?: Blob;
          url?: string;
        }
      | undefined;

    expect(options).toMatchObject({
      filename: expectedFilename,
      mimeType: expectedMimeType
    });
    expect(options?.blob).toBeInstanceOf(Blob);
    expect(options?.url).toBeUndefined();
    await expect(options?.blob?.text()).resolves.toBe(expectedText);
  }

  function expectAnalyticsEvent(
    call: TrackUsageEventCall | undefined,
    expectedEvent: string,
    expectedParams: Record<string, unknown>,
    allowedKeys: string[]
  ): void {
    expect(call).toBeDefined();
    const [eventName, params = {}] = call ?? [];
    expect(eventName).toBe(expectedEvent);
    expect(params).toMatchObject(expectedParams);
    expect(Object.keys(params).sort()).toEqual([...allowedKeys].sort());
    Object.keys(params).forEach((key) => {
      expect(FORBIDDEN_ANALYTICS_KEYS.has(key)).toBe(false);
    });
  }

  function expectNoSensitiveValues(
    params: Record<string, unknown> | undefined,
    fragments: string[]
  ): void {
    const serialized = JSON.stringify(params ?? {});
    fragments.forEach((fragment) => {
      expect(serialized).not.toContain(fragment);
    });
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

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
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
      status: 'success' as const
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

  it('emits privacy-safe stage and ai chat analytics for successful vault saves', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    selectVaultMock.mockReturnValue({
      vault: { name: 'Private Vault' },
      restConfig: {
        baseUrl: 'https://vault',
        vault: 'RemoteVault',
        apiKey: 'key',
        localFolderId: 'folder-main',
        localFolderName: 'LocalPrivate'
      },
      context: {}
    });
    createWriteSessionMock.mockResolvedValue({
      target: { storageTarget: 'local-folder', localFolderName: 'LocalPrivate' },
      writeMarkdown: writeMarkdownMock,
      writeAttachment: writeAttachmentMock
    });
    classifyClipMock.mockResolvedValue({
      type: 'ai_chat',
      ai_platform: 'copilot',
      topics: [],
      tags: [],
      status: 'success' as const
    });
    resolvePathMock.mockReturnValue('Private/Top Secret Chat.md');
    writeMarkdownMock.mockResolvedValue(undefined);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    await processClipPayload(
      createPayload({
        markdown: 'assistant secret reply',
        title: 'Top Secret Chat',
        type: 'ai_chat',
        meta: {
          url: 'https://chatgpt.com/c/secret-thread',
          model: 'gpt-secret-model',
          platform: 'copilot',
          messageCount: 7,
          operationId: 'op_abc123def'
        }
      })
    );

    expect(trackUsageEventMock.mock.calls.map(([eventName]) => eventName)).toEqual([
      'ai_chat_detected',
      'background_stage_completed',
      'background_stage_completed',
      'background_stage_completed',
      'background_stage_completed',
      'clip_save_completed',
      'ai_chat_exported'
    ]);

    expectAnalyticsEvent(
      trackUsageEventMock.mock.calls[0],
      'ai_chat_detected',
      {
        platform: 'other',
        message_count_bucket: 'six_to_ten'
      },
      ['message_count_bucket', 'platform']
    );

    const stageCalls = trackUsageEventMock.mock.calls.filter(
      ([eventName]) => eventName === 'background_stage_completed'
    );
    expect(stageCalls).toHaveLength(4);
    expectAnalyticsEvent(
      stageCalls[0],
      'background_stage_completed',
      {
        operation_id: 'op_abc123def',
        stage: 'classify',
        duration_bucket: expect.any(String)
      },
      ['duration_bucket', 'operation_id', 'stage']
    );
    expectAnalyticsEvent(
      stageCalls[1],
      'background_stage_completed',
      {
        operation_id: 'op_abc123def',
        stage: 'route',
        duration_bucket: expect.any(String)
      },
      ['duration_bucket', 'operation_id', 'stage']
    );
    expectAnalyticsEvent(
      stageCalls[2],
      'background_stage_completed',
      {
        operation_id: 'op_abc123def',
        stage: 'write_markdown',
        duration_bucket: expect.any(String)
      },
      ['duration_bucket', 'operation_id', 'stage']
    );
    expectAnalyticsEvent(
      stageCalls[3],
      'background_stage_completed',
      {
        operation_id: 'op_abc123def',
        stage: 'record_usage',
        duration_bucket: expect.any(String)
      },
      ['duration_bucket', 'operation_id', 'stage']
    );

    expectAnalyticsEvent(
      trackUsageEventMock.mock.calls[5],
      'clip_save_completed',
      {
        operation_id: 'op_abc123def',
        storage_target: 'local_folder',
        duration_bucket: expect.any(String)
      },
      ['duration_bucket', 'operation_id', 'storage_target']
    );
    expect(trackActivationMilestoneIfNeededMock).toHaveBeenCalledWith('first_clip_saved');
    expectAnalyticsEvent(
      trackUsageEventMock.mock.calls[6],
      'ai_chat_exported',
      {
        platform: 'other',
        message_count_bucket: 'six_to_ten',
        duration_bucket: expect.any(String)
      },
      ['duration_bucket', 'message_count_bucket', 'platform']
    );

    trackUsageEventMock.mock.calls.forEach(([, params]) => {
      expectNoSensitiveValues(params as Record<string, unknown> | undefined, [
        'Top Secret Chat',
        'assistant secret reply',
        'https://chatgpt.com/c/secret-thread',
        'gpt-secret-model',
        'Private Vault',
        'RemoteVault',
        'LocalPrivate'
      ]);
    });
  });

  it('emits privacy-safe analytics for downloads saves with attachment writes', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    classifyClipMock.mockResolvedValue({
      type: 'video',
      topics: [],
      tags: [],
      status: 'success' as const
    });
    resolvePathMock.mockReturnValue('Private/downloads-secret.md');
    downloadMock.mockResolvedValue(12);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    await processClipPayload(
      createPayload({
        markdown: 'private clip markdown',
        title: 'Downloads Secret',
        type: 'video',
        meta: {
          url: 'https://example.com/private',
          exportDestination: { kind: 'downloads' },
          operationId: 'op_download7',
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
      })
    );

    await expectDownloadedBlob(0, 'frame-1.jpg', 'image/jpeg', 'aaa');

    expect(trackUsageEventMock.mock.calls.map(([eventName]) => eventName)).toEqual([
      'background_stage_completed',
      'background_stage_completed',
      'background_stage_completed',
      'background_stage_completed',
      'background_stage_completed',
      'clip_save_completed'
    ]);

    const stageCalls = trackUsageEventMock.mock.calls.filter(
      ([eventName]) => eventName === 'background_stage_completed'
    );
    expect(stageCalls).toHaveLength(5);
    expectAnalyticsEvent(
      stageCalls[2],
      'background_stage_completed',
      {
        operation_id: 'op_download7',
        stage: 'write_attachments',
        duration_bucket: expect.any(String)
      },
      ['duration_bucket', 'operation_id', 'stage']
    );
    expectAnalyticsEvent(
      trackUsageEventMock.mock.calls[5],
      'clip_save_completed',
      {
        operation_id: 'op_download7',
        storage_target: 'downloads',
        duration_bucket: expect.any(String)
      },
      ['duration_bucket', 'operation_id', 'storage_target']
    );

    trackUsageEventMock.mock.calls.forEach(([, params]) => {
      expectNoSensitiveValues(params, [
        'Downloads Secret',
        'private clip markdown',
        'https://example.com/private',
        'downloads-secret.md'
      ]);
    });
  });

  it('emits clip_save_failed with safe params and rethrows download failures', async () => {
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
    resolvePathMock.mockReturnValue('Private/failure-note.md');
    const downloadError = new Error('download failed');
    downloadMock.mockRejectedValue(downloadError);

    const { processClipPayload, readClipProcessingFailureCategory } =
      await import('../../../src/background/application/clipProcessor');
    let caught: unknown;
    try {
      await processClipPayload(
        createPayload({
          markdown: 'private failing markdown',
          title: 'Failure Secret',
          meta: {
            url: 'https://example.com/failure',
            exportDestination: { kind: 'downloads' },
            operationId: 'op_fail1234'
          }
        })
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(downloadError);
    expect(readClipProcessingFailureCategory(caught)).toBe('write');
    expect(Object.keys(caught as object)).not.toContain('failureCategory');

    const failedCall = trackUsageEventMock.mock.calls.at(-1);
    expectAnalyticsEvent(
      failedCall,
      'clip_save_failed',
      {
        operation_id: 'op_fail1234',
        storage_target: 'downloads',
        failure_category: 'write'
      },
      ['failure_category', 'operation_id', 'storage_target']
    );
    expectNoSensitiveValues(failedCall?.[1], [
      'Failure Secret',
      'private failing markdown',
      'https://example.com/failure',
      'failure-note.md'
    ]);
  });

  it('does not let analytics send failures change successful processing', async () => {
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
    classifyClipMock.mockResolvedValue({
      type: 'article',
      topics: [],
      tags: [],
      status: 'success' as const
    });
    resolvePathMock.mockReturnValue('Articles/resilient.md');
    writeMarkdownMock.mockResolvedValue(undefined);
    recordUsageMock.mockResolvedValue(undefined);
    trackUsageEventMock.mockRejectedValue(new Error('analytics unavailable'));

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    await expect(processClipPayload(createPayload())).resolves.toMatchObject({
      destination: 'vault',
      storageTarget: 'rest-api'
    });

    expect(trackUsageEventMock).toHaveBeenCalled();
    expect(writeMarkdownMock).toHaveBeenCalled();
    expect(recordUsageMock).toHaveBeenCalled();
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

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    const result = await processClipPayload(createPayload());

    // Verify result includes classificationWarning
    expect(result.classificationWarning).toEqual(errorDetail);

    // Verify result conforms to Schema
    const parseResult = ClipProcessingResultSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
  });
});
