import { beforeEach, describe, expect, it, vi } from 'vitest';

const addListenerMock = vi.hoisted(() => vi.fn());
const handleClipResultMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const handleConnectionTestMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ success: true, message: 'ok' })));
const handleVaultConnectionTestMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ success: true, message: 'ok' })));
const notifyExtractionErrorMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const trackUsageEventMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const handleErrorMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const isAppErrorMock = vi.hoisted(() => vi.fn(() => false));
const normalizeToAppErrorMock = vi.hoisted(() => vi.fn((error: unknown) => ({ message: String(error), userMessage: 'normalized user', code: 'CONTENT_CLIP_FAILURE' })));
const dispatchFailedMock = vi.hoisted(() => vi.fn((_message: string, _meta: unknown, options: { cause?: unknown }) => ({ message: 'dispatch failed', cause: options.cause })));

vi.mock('../../../src/background/pipelines/clipPipeline', () => ({
  handleClipResult: handleClipResultMock
}));
vi.mock('../../../src/background/pipelines/connectionTest', () => ({
  handleConnectionTest: handleConnectionTestMock,
  handleVaultConnectionTest: handleVaultConnectionTestMock
}));
vi.mock('../../../src/background/services/notifications', () => ({
  notifyExtractionError: notifyExtractionErrorMock
}));
vi.mock('../../../src/background/services/analyticsEvents', () => ({
  trackUsageEvent: trackUsageEventMock
}));
vi.mock('../../../src/shared/errors', () => ({
  errorHandler: { handle: handleErrorMock },
  isAppError: isAppErrorMock,
  normalizeToAppError: normalizeToAppErrorMock,
  notificationErrors: { dispatchFailed: dispatchFailedMock }
}));

describe('runtime message listener', () => {
  let listener: ((message: unknown, sender: { tabId?: number }) => Promise<unknown>) | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    listener = undefined;
    addListenerMock.mockImplementation((cb: typeof listener) => {
      listener = cb;
      return () => undefined;
    });
  });

  function createDependencies() {
    return {
      messaging: { addListener: addListenerMock },
      clipPipeline: { sendSupportPrompt: vi.fn(() => Promise.resolve(undefined)) },
      openOptionsPage: vi.fn(() => Promise.resolve(undefined))
    };
  }

  it('registers listener and returns fallback responses for connection test failures', async () => {
    handleConnectionTestMock.mockRejectedValueOnce(new Error('offline'));
    handleVaultConnectionTestMock.mockRejectedValueOnce('vault down');

    const { registerRuntimeMessageListener } = await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(createDependencies());

    expect(addListenerMock).toHaveBeenCalledTimes(1);
    const connection = await listener?.({ type: 'TEST_CONNECTION', rest: { baseUrl: 'https://example.com' } }, {});
    const vault = await listener?.({ type: 'TEST_VAULT_CONNECTION', vaultId: 'vault-1', vault: { id: 'vault-1' } }, {});

    expect(connection).toEqual({ success: false, error: 'offline', message: '连接失败: offline' });
    expect(vault).toEqual({ success: false, error: 'vault down', message: '连接失败: vault down' });
  });

  it('normalizes clip errors and swallows extraction notification dispatch failures', async () => {
    notifyExtractionErrorMock.mockRejectedValueOnce(new Error('notify failed'));
    const { registerRuntimeMessageListener } = await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(createDependencies());

    await listener?.({ type: 'CLIP_ERROR', error: 'boom' }, { tabId: 7 });

    expect(normalizeToAppErrorMock).toHaveBeenCalledWith('boom', expect.objectContaining({ code: 'CONTENT_CLIP_FAILURE' }));
    expect(handleErrorMock).toHaveBeenCalledTimes(2);
    expect(dispatchFailedMock).toHaveBeenCalledWith('normalized user', expect.objectContaining({ channel: 'clipper.error' }), expect.any(Object));
    const dispatchOptions = dispatchFailedMock.mock.calls[0]?.[2] as { cause?: unknown } | undefined;
    expect(dispatchOptions?.cause).toBeInstanceOf(Error);
  });

  it('forwards clip results and analytics usage events', async () => {
    const { registerRuntimeMessageListener } = await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(createDependencies());

    await listener?.({ type: 'CLIP_RESULT', payload: { markdown: '# hello' } }, { tabId: 12 });
    await listener?.({ type: 'TRACK_USAGE_EVENT', event: 'video_started', params: { source: 'menu' } }, { tabId: 12 });

    expect(handleClipResultMock).toHaveBeenCalledWith(
      { type: 'CLIP_RESULT', payload: { markdown: '# hello' } },
      12,
      expect.objectContaining({ sendSupportPrompt: expect.any(Function) })
    );
    expect(trackUsageEventMock).toHaveBeenCalledWith('video_started', { source: 'menu' });
  });

  it('opens the options page and reports failures or unknown messages safely', async () => {
    const dependencies = createDependencies();
    const { registerRuntimeMessageListener } = await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(dependencies);

    const success = await listener?.({ type: 'openOptionsPage', section: 'reader' }, {});
    expect(dependencies.openOptionsPage).toHaveBeenCalledWith('reader');
    expect(success).toEqual({ success: true });

    dependencies.openOptionsPage.mockRejectedValueOnce(new Error('tab failed'));
    const failure = await listener?.({ type: 'openOptionsPage' }, {});
    expect(failure).toEqual({ success: false, error: 'tab failed' });

    await expect(listener?.({ type: 'openOptionsPage', section: 42 }, {})).resolves.toBeUndefined();
    await expect(listener?.({ type: 'unknown' }, {})).resolves.toBeUndefined();
  });
});
