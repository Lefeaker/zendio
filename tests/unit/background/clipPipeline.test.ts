import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AppError } from '@shared/errors';
import { ErrorSeverity } from '@shared/errors';
import {
  SHOW_LOCAL_VAULT_PERMISSION_PROMPT,
  SHOW_SUPPORT_PROMPT,
  type ClipResultMessage
} from '@shared/types';
import type {
  ClipProcessingHooks,
  ClipProcessingResult
} from '../../../src/background/application/clipProcessor';

const getOptionsMock = vi.fn();
const notifySuccessMock = vi.fn();
const notifyFailureMock = vi.fn();
const notifyWarningMock = vi.fn();
const processClipPayloadMock = vi.fn();
const sendMessageMock = vi.fn();
const isPromptSuppressedMock = vi.fn();
const suppressPromptMock = vi.fn();

vi.mock('../../../src/background/store', () => ({
  getOptions: getOptionsMock
}));

vi.mock('../../../src/background/services/notifications', () => ({
  notifyClipSuccess: notifySuccessMock,
  notifyClipFailure: notifyFailureMock,
  notifyClipWarning: notifyWarningMock
}));

vi.mock('../../../src/background/application/clipProcessor', () => ({
  processClipPayload: processClipPayloadMock
}));

vi.mock('../../../src/background/services/localVaultPermissionPrompts', () => ({
  isLocalVaultPermissionPromptSuppressed: isPromptSuppressedMock,
  suppressLocalVaultPermissionPrompt: suppressPromptMock
}));

describe('background clipPipeline', () => {
  beforeEach(() => {
    vi.resetModules();
    getOptionsMock.mockReset();
    notifySuccessMock.mockReset();
    notifyFailureMock.mockReset();
    notifyWarningMock.mockReset();
    processClipPayloadMock.mockReset();
    sendMessageMock.mockReset();
    isPromptSuppressedMock.mockReset();
    suppressPromptMock.mockReset();
    isPromptSuppressedMock.mockResolvedValue(false);
    suppressPromptMock.mockResolvedValue(undefined);
    sendMessageMock.mockResolvedValue(undefined);
    notifySuccessMock.mockResolvedValue(undefined);
    notifyFailureMock.mockResolvedValue(undefined);
    notifyWarningMock.mockResolvedValue(undefined);
  });

  async function loadPipeline() {
    const module = await import('../../../src/background/pipelines/clipPipeline');
    return {
      handleClipResult: module.handleClipResult,
      dependencies: module.createClipPipelineDependencies({
        sendMessage: sendMessageMock
      })
    };
  }

  function createMessage(
    payloadOverrides: Partial<ClipResultMessage['payload']> = {}
  ): ClipResultMessage {
    return {
      type: 'CLIP_RESULT' as const,
      payload: {
        markdown: '# note',
        title: 'Title',
        type: 'article',
        meta: { url: 'https://example.com/articles/1' },
        ...payloadOverrides
      }
    };
  }

  function createAppError(overrides: Partial<AppError> = {}): AppError {
    return {
      code: 'TEST_WARNING',
      domain: 'content',
      message: 'Classifier degraded',
      userMessage: 'Classifier degraded',
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      ...overrides
    };
  }

  it('writes markdown to selected vault and notifies success', async () => {
    processClipPayloadMock.mockResolvedValue({
      filePath: 'Articles/foo.md',
      vaultName: 'Secondary Vault',
      restVault: 'Secondary',
      destination: 'vault',
      storageTarget: 'rest-api',
      classification: {
        status: 'success' as const,
        fallbackReason: undefined,
        errorDetail: undefined,
        topics: [],
        tags: []
      }
    });

    const { handleClipResult, dependencies } = await loadPipeline();
    await handleClipResult(createMessage(), undefined, dependencies);

    expect(notifySuccessMock).toHaveBeenCalledWith('Articles/foo.md', {
      vaultName: 'Secondary Vault',
      storageTarget: 'rest-api',
      localFolderName: undefined,
      fallbackReason: undefined
    });
    expect(notifyFailureMock).not.toHaveBeenCalled();
    expect(notifyWarningMock).not.toHaveBeenCalled();
    expect(processClipPayloadMock).toHaveBeenCalled();
  });

  it('emits progress updates while processing clip results', async () => {
    processClipPayloadMock.mockImplementation(
      async (
        _payload: ClipResultMessage['payload'],
        hooks: ClipProcessingHooks
      ): Promise<ClipProcessingResult> => {
        hooks.onProgress?.({ value: 82, label: '正在写入笔记' });
        return {
          filePath: 'Articles/foo.md',
          vaultName: 'Secondary Vault',
          restVault: 'Secondary',
          destination: 'vault',
          storageTarget: 'rest-api',
          classification: {
            status: 'success' as const,
            fallbackReason: undefined,
            errorDetail: undefined,
            topics: [],
            tags: []
          }
        };
      }
    );

    const { handleClipResult, dependencies } = await loadPipeline();
    await handleClipResult(createMessage(), 11, dependencies);

    expect(sendMessageMock).toHaveBeenNthCalledWith(
      1,
      11,
      expect.objectContaining({
        type: SHOW_SUPPORT_PROMPT,
        status: 'progress',
        progress: expect.objectContaining({
          value: 40,
          label: '正在接收剪藏内容'
        }) as unknown
      })
    );
    expect(sendMessageMock).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        type: SHOW_SUPPORT_PROMPT,
        status: 'progress',
        progress: expect.objectContaining({
          value: 82,
          label: '正在写入笔记'
        }) as unknown
      })
    );
    expect(sendMessageMock).toHaveBeenLastCalledWith(
      11,
      expect.objectContaining({
        type: SHOW_SUPPORT_PROMPT,
        status: 'success',
        progress: expect.objectContaining({ value: 100, variant: 'success' }) as unknown
      })
    );
  });

  it('rejects payloads without markdown', async () => {
    const { handleClipResult, dependencies } = await loadPipeline();
    await handleClipResult(createMessage({ markdown: undefined }), undefined, dependencies);

    expect(notifyFailureMock).toHaveBeenCalledWith('内容解析失败，请刷新页面或稍后重试。');
    expect(processClipPayloadMock).not.toHaveBeenCalled();
  });

  it('notifies failure when writing to vault throws and falls back to configured vault name', async () => {
    processClipPayloadMock.mockRejectedValue(new Error('network'));
    getOptionsMock.mockResolvedValue({
      rest: { vault: 'FallbackVault' }
    });

    const { handleClipResult, dependencies } = await loadPipeline();
    await handleClipResult(createMessage(), 42, dependencies);

    expect(notifyFailureMock).toHaveBeenCalled();
    expect(processClipPayloadMock).toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        type: SHOW_SUPPORT_PROMPT,
        status: 'failure',
        vaultName: 'FallbackVault'
      })
    );
  });

  it('emits warning notification and support prompt when classification degrades', async () => {
    const warning = createAppError();
    processClipPayloadMock.mockResolvedValue({
      filePath: 'Articles/foo.md',
      vaultName: 'Secondary Vault',
      restVault: 'Secondary',
      destination: 'vault',
      storageTarget: 'rest-api',
      classificationWarning: warning,
      classification: {
        status: 'fallback' as const,
        fallbackReason: 'error' as const,
        errorDetail: warning,
        topics: [],
        tags: []
      }
    });

    const { handleClipResult, dependencies } = await loadPipeline();
    await handleClipResult(createMessage(), 7, dependencies);

    expect(notifySuccessMock).toHaveBeenCalledWith('Articles/foo.md', {
      vaultName: 'Secondary Vault',
      storageTarget: 'rest-api',
      localFolderName: undefined,
      fallbackReason: undefined
    });
    expect(notifyWarningMock).toHaveBeenCalledWith('Classifier degraded');
    expect(sendMessageMock).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: SHOW_SUPPORT_PROMPT,
        status: 'warning',
        vaultName: 'Secondary Vault',
        errorMessage: 'Classifier degraded'
      })
    );
  });

  it('passes local-folder fallback details to the success notification', async () => {
    processClipPayloadMock.mockResolvedValue({
      filePath: 'Articles/foo.md',
      vaultName: 'Secondary Vault',
      restVault: 'Secondary',
      destination: 'vault',
      storageTarget: 'rest-api',
      localFolderName: 'LocalVault',
      fallbackReason: 'folder-missing',
      classification: {
        status: 'success' as const,
        fallbackReason: undefined,
        errorDetail: undefined,
        topics: [],
        tags: []
      }
    });

    const { handleClipResult, dependencies } = await loadPipeline();
    await handleClipResult(createMessage(), undefined, dependencies);

    expect(notifySuccessMock).toHaveBeenCalledWith('Articles/foo.md', {
      vaultName: 'Secondary Vault',
      storageTarget: 'rest-api',
      localFolderName: 'LocalVault',
      fallbackReason: 'folder-missing'
    });
  });

  it('normalizes meta url and domain before processing incomplete payloads', async () => {
    processClipPayloadMock.mockResolvedValue({
      filePath: 'Articles/foo.md',
      vaultName: 'Secondary Vault',
      restVault: 'Secondary',
      destination: 'vault',
      storageTarget: 'rest-api',
      classification: {
        status: 'success' as const,
        fallbackReason: undefined,
        errorDetail: undefined,
        topics: [],
        tags: []
      }
    });

    const { handleClipResult, dependencies } = await loadPipeline();
    await handleClipResult(
      createMessage({
        meta: {
          url: '',
          resolvedUrl: 'https://resolved.example.com/path',
          sourceUrl: 'https://source.example.com/path',
          domain: ''
        }
      }),
      undefined,
      dependencies
    );

    const processCalls = processClipPayloadMock.mock.calls as Array<[ClipResultMessage['payload']]>;
    const processedPayload = processCalls[0]?.[0];
    expect(processedPayload?.meta?.url).toBe('https://resolved.example.com/path');
    expect(processedPayload?.meta?.domain).toBe('resolved.example.com');
  });

  it('swallows notification dispatch failures without breaking successful processing', async () => {
    processClipPayloadMock.mockResolvedValue({
      filePath: 'Articles/foo.md',
      vaultName: 'Secondary Vault',
      restVault: 'Secondary',
      destination: 'vault',
      storageTarget: 'rest-api',
      classification: {
        status: 'success' as const,
        fallbackReason: undefined,
        errorDetail: undefined,
        topics: [],
        tags: []
      }
    });
    notifySuccessMock.mockRejectedValueOnce(new Error('notifications unavailable'));

    const { handleClipResult, dependencies } = await loadPipeline();
    await expect(handleClipResult(createMessage(), 99, dependencies)).resolves.toBeUndefined();

    expect(processClipPayloadMock).toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith(
      99,
      expect.objectContaining({
        type: SHOW_SUPPORT_PROMPT,
        status: 'success'
      })
    );
  });

  it('requests current-page local vault permission when processing asks for reauthorization', async () => {
    sendMessageMock.mockImplementation(async (_tabId, message) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: unknown }).type === SHOW_LOCAL_VAULT_PERMISSION_PROMPT
      ) {
        return { action: 'granted', permissionState: 'granted' };
      }
      return undefined;
    });
    processClipPayloadMock.mockImplementation(
      async (
        _payload: ClipResultMessage['payload'],
        hooks: ClipProcessingHooks
      ): Promise<ClipProcessingResult> => {
        const requestLocalVaultPermission = hooks.requestLocalVaultPermission;
        if (!requestLocalVaultPermission) {
          throw new Error('Expected local vault permission hook.');
        }
        const reauthResult = await requestLocalVaultPermission({
          folderId: 'folder-main',
          folderName: 'Blog',
          vaultName: 'blog'
        });
        expect(reauthResult).toEqual({ action: 'granted', permissionState: 'granted' });
        return {
          filePath: 'Articles/foo.md',
          vaultName: 'blog',
          restVault: 'blog',
          destination: 'vault',
          storageTarget: 'local-folder',
          localFolderName: 'Blog',
          classification: {
            status: 'success' as const,
            fallbackReason: undefined,
            errorDetail: undefined,
            topics: [],
            tags: []
          }
        };
      }
    );

    const { handleClipResult, dependencies } = await loadPipeline();
    await handleClipResult(createMessage(), 23, dependencies);

    expect(sendMessageMock).toHaveBeenCalledWith(
      23,
      expect.objectContaining({
        type: SHOW_LOCAL_VAULT_PERMISSION_PROMPT,
        folderId: 'folder-main',
        folderName: 'Blog',
        vaultName: 'blog'
      })
    );
    expect(suppressPromptMock).not.toHaveBeenCalled();
    expect(notifySuccessMock).toHaveBeenCalledWith(
      'Articles/foo.md',
      expect.objectContaining({ storageTarget: 'local-folder', localFolderName: 'Blog' })
    );
  });

  it('persists the user choice to stop asking for a local vault permission prompt', async () => {
    sendMessageMock.mockImplementation(async (_tabId, message) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: unknown }).type === SHOW_LOCAL_VAULT_PERMISSION_PROMPT
      ) {
        return { action: 'use-rest', persistRest: true, permissionState: 'denied' };
      }
      return undefined;
    });
    processClipPayloadMock.mockImplementation(
      async (
        _payload: ClipResultMessage['payload'],
        hooks: ClipProcessingHooks
      ): Promise<ClipProcessingResult> => {
        const requestLocalVaultPermission = hooks.requestLocalVaultPermission;
        if (!requestLocalVaultPermission) {
          throw new Error('Expected local vault permission hook.');
        }
        const reauthResult = await requestLocalVaultPermission({
          folderId: 'folder-main',
          folderName: 'Blog',
          vaultName: 'blog'
        });
        expect(reauthResult).toEqual({
          action: 'use-rest',
          persistRest: true,
          permissionState: 'denied'
        });
        return {
          filePath: 'Articles/foo.md',
          vaultName: 'blog',
          restVault: 'blog',
          destination: 'vault',
          storageTarget: 'rest-api',
          localFolderName: 'Blog',
          fallbackReason: 'permission-denied',
          classification: {
            status: 'success' as const,
            fallbackReason: undefined,
            errorDetail: undefined,
            topics: [],
            tags: []
          }
        };
      }
    );

    const { handleClipResult, dependencies } = await loadPipeline();
    await handleClipResult(createMessage(), 23, dependencies);

    expect(suppressPromptMock).toHaveBeenCalledWith('folder-main');
  });

  it('does not ask again when a local vault permission prompt is suppressed for the folder', async () => {
    isPromptSuppressedMock.mockResolvedValue(true);
    processClipPayloadMock.mockImplementation(
      async (
        _payload: ClipResultMessage['payload'],
        hooks: ClipProcessingHooks
      ): Promise<ClipProcessingResult> => {
        const requestLocalVaultPermission = hooks.requestLocalVaultPermission;
        if (!requestLocalVaultPermission) {
          throw new Error('Expected local vault permission hook.');
        }
        const reauthResult = await requestLocalVaultPermission({
          folderId: 'folder-main',
          folderName: 'Blog',
          vaultName: 'blog'
        });
        expect(reauthResult).toEqual({ action: 'use-rest', persistRest: true });
        return {
          filePath: 'Articles/foo.md',
          vaultName: 'blog',
          restVault: 'blog',
          destination: 'vault',
          storageTarget: 'rest-api',
          localFolderName: 'Blog',
          fallbackReason: 'permission-denied',
          classification: {
            status: 'success' as const,
            fallbackReason: undefined,
            errorDetail: undefined,
            topics: [],
            tags: []
          }
        };
      }
    );

    const { handleClipResult, dependencies } = await loadPipeline();
    await handleClipResult(createMessage(), 23, dependencies);

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      23,
      expect.objectContaining({ type: SHOW_LOCAL_VAULT_PERMISSION_PROMPT })
    );
  });

  it('suppresses benign support-prompt send failures', async () => {
    processClipPayloadMock.mockResolvedValue({
      filePath: 'Articles/foo.md',
      vaultName: 'Secondary Vault',
      restVault: 'Secondary',
      destination: 'vault',
      storageTarget: 'rest-api',
      classification: {
        status: 'success' as const,
        fallbackReason: undefined,
        errorDetail: undefined,
        topics: [],
        tags: []
      }
    });
    sendMessageMock.mockRejectedValueOnce(new Error('Receiving end does not exist.'));

    const { handleClipResult, dependencies } = await loadPipeline();
    await expect(handleClipResult(createMessage(), 5, dependencies)).resolves.toBeUndefined();

    expect(notifySuccessMock).toHaveBeenCalledWith('Articles/foo.md', {
      vaultName: 'Secondary Vault',
      storageTarget: 'rest-api',
      localFolderName: undefined,
      fallbackReason: undefined
    });
    expect(sendMessageMock).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        type: SHOW_SUPPORT_PROMPT,
        status: 'success'
      })
    );
  });
});
