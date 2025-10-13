import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const getOptionsMock = vi.fn();
const notifySuccessMock = vi.fn();
const notifyFailureMock = vi.fn();
const processClipPayloadMock = vi.fn();
const sendMessageMock = vi.fn();

vi.mock('../../src/background/store', () => ({
  getOptions: getOptionsMock
}));

vi.mock('../../src/background/services/notifications', () => ({
  notifyClipSuccess: notifySuccessMock,
  notifyClipFailure: notifyFailureMock
}));

vi.mock('../../src/background/application/clipProcessor', () => ({
  processClipPayload: processClipPayloadMock
}));

describe('background clipPipeline', () => {
  beforeEach(() => {
    vi.resetModules();
    getOptionsMock.mockReset();
    notifySuccessMock.mockReset();
    notifyFailureMock.mockReset();
    processClipPayloadMock.mockReset();
    sendMessageMock.mockReset();
    sendMessageMock.mockImplementation((_tabId, _message, callback?: () => void) => {
      if (typeof callback === 'function') {
        callback();
      }
    });
    (globalThis as unknown as { chrome?: unknown }).chrome = {
      tabs: {
        sendMessage: sendMessageMock
      },
      runtime: {
        lastError: undefined
      }
    };
  });

  function createMessage(payloadOverrides: Partial<Record<string, unknown>> = {}) {
    return {
      type: 'CLIP_RESULT' as const,
      payload: {
        markdown: '# note',
        title: 'Title',
        type: 'article',
        meta: { url: 'https://example.com' },
        ...payloadOverrides
      }
    };
  }

  it('writes markdown to selected vault and notifies success', async () => {
    processClipPayloadMock.mockResolvedValue({
      filePath: 'Articles/foo.md',
      vaultName: 'Secondary Vault',
      restVault: 'Secondary'
    });

    const { handleClipResult } = await import('../../src/background/pipelines/clipPipeline');
    await handleClipResult(createMessage());

    expect(notifySuccessMock).toHaveBeenCalledWith('Articles/foo.md', 'Secondary Vault');
    expect(notifyFailureMock).not.toHaveBeenCalled();
    expect(processClipPayloadMock).toHaveBeenCalled();
  });

  it('rejects payloads without markdown', async () => {
    const { handleClipResult } = await import('../../src/background/pipelines/clipPipeline');
    await handleClipResult(createMessage({ markdown: undefined }));

    expect(notifyFailureMock).toHaveBeenCalledWith('Invalid clip payload: missing markdown content');
    expect(processClipPayloadMock).not.toHaveBeenCalled();
  });

  it('notifies failure when writing to vault throws', async () => {
    processClipPayloadMock.mockRejectedValue(new Error('network'));
    getOptionsMock.mockResolvedValue({
      rest: { vault: 'FallbackVault' }
    });

    const { handleClipResult } = await import('../../src/background/pipelines/clipPipeline');
    await handleClipResult(createMessage());

    expect(notifyFailureMock).toHaveBeenCalled();
    expect(processClipPayloadMock).toHaveBeenCalled();
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });
});
