import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AppError } from '@shared/errors';
import { ErrorSeverity } from '@shared/errors';
import { SHOW_SUPPORT_PROMPT, type ClipResultMessage } from '@shared/types';

const getOptionsMock = vi.fn();
const notifySuccessMock = vi.fn();
const notifyFailureMock = vi.fn();
const notifyWarningMock = vi.fn();
const processClipPayloadMock = vi.fn();
const sendMessageMock = vi.fn();

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

describe('background clipPipeline', () => {
  beforeEach(() => {
    vi.resetModules();
    getOptionsMock.mockReset();
    notifySuccessMock.mockReset();
    notifyFailureMock.mockReset();
    notifyWarningMock.mockReset();
    processClipPayloadMock.mockReset();
    sendMessageMock.mockReset();
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

  function createMessage(payloadOverrides: Partial<ClipResultMessage['payload']> = {}): ClipResultMessage {
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

    expect(notifySuccessMock).toHaveBeenCalledWith('Articles/foo.md', 'Secondary Vault');
    expect(notifyFailureMock).not.toHaveBeenCalled();
    expect(notifyWarningMock).not.toHaveBeenCalled();
    expect(processClipPayloadMock).toHaveBeenCalled();
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

    expect(notifySuccessMock).toHaveBeenCalledWith('Articles/foo.md', 'Secondary Vault');
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

  it('normalizes meta url and domain before processing incomplete payloads', async () => {
    processClipPayloadMock.mockResolvedValue({
      filePath: 'Articles/foo.md',
      vaultName: 'Secondary Vault',
      restVault: 'Secondary',
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

  it('suppresses benign support-prompt send failures', async () => {
    processClipPayloadMock.mockResolvedValue({
      filePath: 'Articles/foo.md',
      vaultName: 'Secondary Vault',
      restVault: 'Secondary',
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

    expect(notifySuccessMock).toHaveBeenCalledWith('Articles/foo.md', 'Secondary Vault');
    expect(sendMessageMock).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        type: SHOW_SUPPORT_PROMPT,
        status: 'success'
      })
    );
  });
});
