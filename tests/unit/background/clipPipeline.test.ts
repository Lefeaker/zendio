import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AppError } from '@shared/errors';
import { ErrorSeverity } from '@shared/errors';
import {
  SHOW_LOCAL_VAULT_PERMISSION_PROMPT,
  SHOW_SUPPORT_PROMPT,
  type ClipResultMessage
} from '@shared/types';
import {
  createAppError,
  createClipResultMessage as createMessage,
  getOptionsMock,
  isPromptSuppressedMock,
  notifyFailureMock,
  notifySuccessMock,
  notifyWarningMock,
  resetClipPipelineHarnessMocks,
  sendMessageMock,
  suppressPromptMock,
  type ClipProcessingHooksWithPermission,
  type ClipProcessingHooksWithProgress
} from './clipTestHarness';

const processClipPayloadMock = vi.fn();

vi.mock('../../../src/background/application/clipProcessor', () => ({
  processClipPayload: processClipPayloadMock
}));

describe('background clipPipeline', () => {
  beforeEach(() => {
    vi.resetModules();
    resetClipPipelineHarnessMocks(processClipPayloadMock);
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
      (_payload, hooks: ClipProcessingHooksWithProgress) => {
        hooks.onProgress({
          value: 82,
          message: {
            key: 'supportProgressWritingNote',
            fallback: 'Writing note'
          }
        });
        return Promise.resolve({
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
        progress: {
          value: 40,
          message: {
            key: 'supportProgressReceivingClipContent',
            fallback: 'Receiving clip content'
          },
          variant: 'progress'
        }
      })
    );
    expect(sendMessageMock).toHaveBeenCalledWith(11, {
      type: SHOW_SUPPORT_PROMPT,
      status: 'progress',
      progress: {
        value: 82,
        message: {
          key: 'supportProgressWritingNote',
          fallback: 'Writing note'
        },
        variant: 'progress'
      }
    });
    expect(sendMessageMock).toHaveBeenLastCalledWith(
      11,
      expect.objectContaining({
        type: SHOW_SUPPORT_PROMPT,
        status: 'success',
        progress: expect.objectContaining({ value: 100, variant: 'success' })
      })
    );
  });

  it('rejects payloads without markdown', async () => {
    const { handleClipResult, dependencies } = await loadPipeline();
    await handleClipResult(createMessage({ markdown: undefined }), undefined, dependencies);

    expect(notifyFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'EXTRACTION_CONTENT_NO_MARKDOWN',
        domain: 'extraction'
      })
    );
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
    expect(notifyWarningMock).toHaveBeenCalledWith(warning);
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

  it('passes descriptor-bearing local-vault failures to downstream consumers without rebuilding user copy', async () => {
    const localVaultError: AppError = {
      code: 'LOCAL_VAULT_WRITE_FAILED',
      domain: 'background',
      message: 'Local vault write failed: Articles/test.md',
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      userMessageDescriptor: {
        key: 'localVaultWriteFailed',
        values: { folderName: 'Main' }
      }
    };
    processClipPayloadMock.mockRejectedValue(localVaultError);
    getOptionsMock.mockResolvedValue({
      rest: { vault: 'FallbackVault' }
    });

    const { handleClipResult, dependencies } = await loadPipeline();
    await handleClipResult(createMessage(), 52, dependencies);

    expect(notifyFailureMock).toHaveBeenCalledWith(localVaultError);
    expect(sendMessageMock).toHaveBeenCalledWith(
      52,
      expect.objectContaining({
        type: SHOW_SUPPORT_PROMPT,
        status: 'failure',
        error: expect.objectContaining({
          code: 'LOCAL_VAULT_WRITE_FAILED',
          userMessageDescriptor: {
            key: 'localVaultWriteFailed',
            values: { folderName: 'Main' }
          }
        })
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

  it('injects a background operation id before handing payloads to the processor', async () => {
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
          url: 'https://example.com/articles/operation-id-test'
        }
      }),
      undefined,
      dependencies
    );

    const processCalls = processClipPayloadMock.mock.calls as Array<[ClipResultMessage['payload']]>;
    const processedPayload = processCalls[0]?.[0];
    expect(processedPayload?.meta?.operationId).toMatch(/^op_[a-z0-9]{6,24}$/);
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
      async (_payload, hooks: ClipProcessingHooksWithPermission) => {
        const reauthResult = await hooks.requestLocalVaultPermission({
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
        type: SHOW_SUPPORT_PROMPT,
        status: 'progress',
        progress: {
          value: 60,
          message: {
            key: 'supportProgressLocalVaultPermissionRequest',
            values: { folderName: 'Blog' },
            fallback: 'Requesting local folder access: Blog'
          },
          variant: 'progress'
        }
      })
    );
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
      async (_payload, hooks: ClipProcessingHooksWithPermission) => {
        const reauthResult = await hooks.requestLocalVaultPermission({
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
      async (_payload, hooks: ClipProcessingHooksWithPermission) => {
        const reauthResult = await hooks.requestLocalVaultPermission({
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
