import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  classifyClipMock,
  createPayload,
  createWriteSessionMock,
  downloadMock,
  expectAnalyticsEvent,
  expectDownloadedBlob,
  expectNoSensitiveValues,
  getOptionsMock,
  recordUsageMock,
  resetClipProcessorHarnessMocks,
  resolvePathMock,
  restoreClipProcessorHarnessMocks,
  selectVaultMock,
  templateOptions,
  trackActivationMilestoneIfNeededMock,
  trackUsageEventMock,
  writeAttachmentMock,
  writeMarkdownMock
} from './clipTestHarness';

describe('clipProcessor analytics', () => {
  beforeEach(() => {
    vi.resetModules();
    resetClipProcessorHarnessMocks();
  });

  afterEach(() => {
    restoreClipProcessorHarnessMocks();
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
        duration_bucket: expect.any(String),
        attachment_count_bucket: 'zero'
      },
      ['attachment_count_bucket', 'duration_bucket', 'operation_id', 'storage_target']
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
        duration_bucket: expect.any(String),
        attachment_count_bucket: 'one'
      },
      ['attachment_count_bucket', 'duration_bucket', 'operation_id', 'storage_target']
    );

    trackUsageEventMock.mock.calls.forEach(([, params]) => {
      expectNoSensitiveValues(params, [
        'Downloads Secret',
        'private clip markdown',
        'https://example.com/private',
        'downloads-secret.md',
        'frame-1.jpg'
      ]);
    });
  });

  it('emits privacy-safe analytics for vault saves with attachment writes', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    selectVaultMock.mockReturnValue({
      vault: { name: 'Private Vault' },
      restConfig: { baseUrl: 'https://vault', vault: 'RemoteVault', apiKey: 'key' },
      context: {}
    });
    classifyClipMock.mockResolvedValue({
      type: 'video',
      topics: [],
      tags: [],
      status: 'success' as const
    });
    resolvePathMock.mockReturnValue('Private/vault-secret.md');
    writeMarkdownMock.mockResolvedValue(undefined);
    writeAttachmentMock.mockResolvedValue(undefined);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    await processClipPayload(
      createPayload({
        markdown: 'private vault markdown',
        title: 'Vault Secret',
        type: 'video',
        meta: {
          url: 'https://example.com/vault-secret',
          operationId: 'op_vault777',
          attachments: [
            {
              id: 'shot-vault-1',
              fileName: 'vault-frame-1.jpg',
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
        operation_id: 'op_vault777',
        stage: 'write_attachments',
        duration_bucket: expect.any(String)
      },
      ['duration_bucket', 'operation_id', 'stage']
    );
    expectAnalyticsEvent(
      trackUsageEventMock.mock.calls[5],
      'clip_save_completed',
      {
        operation_id: 'op_vault777',
        storage_target: 'rest_api',
        duration_bucket: expect.any(String),
        attachment_count_bucket: 'one'
      },
      ['attachment_count_bucket', 'duration_bucket', 'operation_id', 'storage_target']
    );

    trackUsageEventMock.mock.calls.forEach(([, params]) => {
      expectNoSensitiveValues(params, [
        'Vault Secret',
        'private vault markdown',
        'https://example.com/vault-secret',
        'Private Vault',
        'RemoteVault',
        'vault-secret.md',
        'vault-frame-1.jpg'
      ]);
    });
  });

  it('does not let analytics send failures change successful processing', async () => {
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
});
