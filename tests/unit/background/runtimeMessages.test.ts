import { beforeEach, describe, expect, it, vi } from 'vitest';

const addListenerMock = vi.hoisted(() => vi.fn());
const handleClipResultMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const handleConnectionTestMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ success: true, message: 'ok' }))
);
const handleVaultConnectionTestMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ success: true, message: 'ok' }))
);
const notifyExtractionErrorMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const trackUsageEventMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const handleErrorMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const processClipPayloadMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ filePath: 'Video/example.md' }))
);
const isAppErrorMock = vi.hoisted(() => vi.fn(() => false));
const normalizeToAppErrorMock = vi.hoisted(() =>
  vi.fn((error: unknown) => ({
    message: String(error),
    userMessage: 'normalized user',
    code: 'CONTENT_CLIP_FAILURE'
  }))
);
const dispatchFailedMock = vi.hoisted(() =>
  vi.fn((_message: string, _meta: unknown, options: { cause?: unknown }) => ({
    message: 'dispatch failed',
    cause: options.cause
  }))
);

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
vi.mock('../../../src/background/application/clipProcessor', () => ({
  processClipPayload: processClipPayloadMock
}));
vi.mock('../../../src/shared/errors', () => ({
  errorHandler: { handle: handleErrorMock },
  isAppError: isAppErrorMock,
  normalizeToAppError: normalizeToAppErrorMock,
  notificationErrors: { dispatchFailed: dispatchFailedMock }
}));

describe('runtime message listener', () => {
  let listener:
    | ((
        message: unknown,
        sender: { tabId?: number; frameId?: number; windowId?: number }
      ) => Promise<unknown>)
    | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    processClipPayloadMock.mockResolvedValue({ filePath: 'Video/example.md' });
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
      openOptionsPage: vi.fn(() => Promise.resolve(undefined)),
      getTabContext: vi.fn(
        async (sender: { tabId?: number; frameId?: number; windowId?: number }) => ({
          success: true as const,
          ...(sender.tabId !== undefined ? { tabId: sender.tabId } : {}),
          ...(sender.windowId !== undefined ? { windowId: sender.windowId } : {}),
          ...(sender.frameId !== undefined ? { frameId: sender.frameId } : {})
        })
      ),
      isTabContextActive: vi.fn(async (ownerContext: { tabId?: number }) => ({
        success: true as const,
        active: ownerContext.tabId === 12
      }))
    };
  }

  it('registers listener and returns fallback responses for connection test failures', async () => {
    handleConnectionTestMock.mockRejectedValueOnce(new Error('offline'));
    handleVaultConnectionTestMock.mockRejectedValueOnce('vault down');

    const { registerRuntimeMessageListener } =
      await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(createDependencies());

    expect(addListenerMock).toHaveBeenCalledTimes(1);
    const connection = await listener?.(
      { type: 'TEST_CONNECTION', rest: { baseUrl: 'https://example.com' } },
      {}
    );
    const vault = await listener?.(
      { type: 'TEST_VAULT_CONNECTION', vaultId: 'vault-1', vault: { id: 'vault-1' } },
      {}
    );

    expect(connection).toEqual({ success: false, error: 'offline', message: '连接失败: offline' });
    expect(vault).toEqual({ success: false, error: 'vault down', message: '连接失败: vault down' });
  });

  it('normalizes clip errors and swallows extraction notification dispatch failures', async () => {
    notifyExtractionErrorMock.mockRejectedValueOnce(new Error('notify failed'));
    const { registerRuntimeMessageListener } =
      await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(createDependencies());

    await listener?.({ type: 'CLIP_ERROR', error: 'boom' }, { tabId: 7 });

    expect(normalizeToAppErrorMock).toHaveBeenCalledWith(
      'boom',
      expect.objectContaining({ code: 'CONTENT_CLIP_FAILURE' })
    );
    expect(handleErrorMock).toHaveBeenCalledTimes(2);
    expect(dispatchFailedMock).toHaveBeenCalledWith(
      'normalized user',
      expect.objectContaining({ channel: 'clipper.error' }),
      expect.any(Object)
    );
    const dispatchOptions = dispatchFailedMock.mock.calls[0]?.[2] as
      | { cause?: unknown }
      | undefined;
    expect(dispatchOptions?.cause).toBeInstanceOf(Error);
  });

  it('forwards clip results and allowlisted analytics usage events', async () => {
    const { registerRuntimeMessageListener } =
      await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(createDependencies());

    await listener?.({ type: 'CLIP_RESULT', payload: { markdown: '# hello' } }, { tabId: 12 });
    await listener?.(
      { type: 'TRACK_USAGE_EVENT', event: 'support_like_clicked', params: { variant: 'first' } },
      { tabId: 12 }
    );

    expect(handleClipResultMock).toHaveBeenCalledWith(
      { type: 'CLIP_RESULT', payload: { markdown: '# hello' } },
      12,
      expect.any(Object)
    );
    expect(trackUsageEventMock).toHaveBeenCalledWith('support_like_clicked', { variant: 'first' });
  });

  it('returns sender tab context metadata for content-side owner resolution', async () => {
    const dependencies = createDependencies();
    const { registerRuntimeMessageListener } =
      await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(dependencies);

    await expect(
      listener?.({ type: 'AIIOB_GET_TAB_CONTEXT' }, { tabId: 12, windowId: 4, frameId: 0 })
    ).resolves.toEqual({
      success: true,
      tabId: 12,
      windowId: 4,
      frameId: 0
    });
    expect(dependencies.getTabContext).toHaveBeenCalledWith({
      tabId: 12,
      windowId: 4,
      frameId: 0
    });
  });

  it('returns success with omitted tab fields when sender metadata is unavailable', async () => {
    const dependencies = createDependencies();
    const { registerRuntimeMessageListener } =
      await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(dependencies);

    await expect(listener?.({ type: 'AIIOB_GET_TAB_CONTEXT' }, {})).resolves.toEqual({
      success: true
    });
  });

  it('reports whether a stored session draft owner tab is still active', async () => {
    const dependencies = createDependencies();
    const { registerRuntimeMessageListener } =
      await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(dependencies);

    await expect(
      listener?.(
        {
          type: 'AIIOB_IS_TAB_CONTEXT_ACTIVE',
          ownerContext: { tabId: 12, windowId: 4, frameId: 0 }
        },
        {}
      )
    ).resolves.toEqual({
      success: true,
      active: true
    });
    await expect(
      listener?.(
        {
          type: 'AIIOB_IS_TAB_CONTEXT_ACTIVE',
          ownerContext: { tabId: 99, windowId: 4, frameId: 0 }
        },
        {}
      )
    ).resolves.toEqual({
      success: true,
      active: false
    });
    expect(dependencies.isTabContextActive).toHaveBeenCalledWith({
      tabId: 12,
      windowId: 4,
      frameId: 0
    });
  });

  it('strips unknown clip result payload fields before forwarding to the clip pipeline', async () => {
    const { registerRuntimeMessageListener } =
      await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(createDependencies());

    await listener?.(
      {
        type: 'CLIP_RESULT',
        payload: {
          markdown: '# hello',
          meta: {
            url: 'https://example.com',
            attachments: [
              {
                id: 'shot-1',
                fileName: 'frame.jpg',
                mimeType: 'image/jpeg',
                dataUrl: 'data:image/jpeg;base64,aaa',
                unsafe: true
              }
            ],
            exportDestination: { kind: 'downloads', unsafe: true },
            unsafeMeta: true
          },
          unsafeRoot: true
        }
      },
      { tabId: 12 }
    );

    expect(handleClipResultMock).toHaveBeenCalledWith(
      {
        type: 'CLIP_RESULT',
        payload: {
          markdown: '# hello',
          meta: {
            url: 'https://example.com',
            attachments: [
              {
                id: 'shot-1',
                fileName: 'frame.jpg',
                mimeType: 'image/jpeg',
                dataUrl: 'data:image/jpeg;base64,aaa'
              }
            ],
            exportDestination: { kind: 'downloads' }
          }
        }
      },
      12,
      expect.any(Object)
    );
  });

  it('rejects unknown and unsafe analytics usage events', async () => {
    const { registerRuntimeMessageListener } =
      await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(createDependencies());

    await listener?.(
      { type: 'TRACK_USAGE_EVENT', event: 'arbitrary_event', params: { source: 'toolbar' } },
      { tabId: 12 }
    );
    await listener?.(
      {
        type: 'track',
        event: 'support_link_clicked',
        params: { url: 'https://ko-fi.com/xiannian?user=reader' }
      },
      { tabId: 12 }
    );
    await listener?.(
      { type: 'TRACK_USAGE_EVENT', event: 'support_like_clicked', params: { variant: ['first'] } },
      { tabId: 12 }
    );

    expect(trackUsageEventMock).not.toHaveBeenCalled();
  });

  it('returns clip results for repository video export messages', async () => {
    const { registerRuntimeMessageListener } =
      await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(createDependencies());

    const result = await listener?.(
      {
        type: 'videoClip',
        data: {
          content: '# video',
          title: 'Video title',
          url: 'https://youtube.com/watch?v=1',
          videoUrl: 'https://youtube.com/watch?v=1',
          timestamp: 1,
          platform: 'youtube',
          attachments: [
            {
              id: 'shot-1',
              fileName: 'file-20260509194226985.jpg',
              mimeType: 'image/jpeg',
              dataUrl: 'data:image/jpeg;base64,aaa'
            }
          ],
          exportDestination: { kind: 'downloads' }
        }
      },
      { tabId: 12 }
    );

    expect(result).toEqual({ success: true, filePath: 'Video/example.md' });
    expect(processClipPayloadMock).toHaveBeenCalledWith({
      markdown: '# video',
      title: 'Video title',
      type: 'video',
      meta: {
        url: 'https://youtube.com/watch?v=1',
        sourceUrl: 'https://youtube.com/watch?v=1',
        platform: 'youtube',
        attachments: [
          {
            id: 'shot-1',
            fileName: 'file-20260509194226985.jpg',
            mimeType: 'image/jpeg',
            dataUrl: 'data:image/jpeg;base64,aaa'
          }
        ],
        exportDestination: { kind: 'downloads' }
      }
    });
  });

  it('validates legacy repository clip and reading clip payloads before processing', async () => {
    const { registerRuntimeMessageListener } =
      await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(createDependencies());

    const clipResult = await listener?.(
      {
        type: 'clip',
        data: {
          markdown: '# clip',
          title: 'Clip title',
          meta: { url: 'https://example.com', unsafeMeta: true },
          unsafeRoot: true
        }
      },
      { tabId: 12 }
    );
    const readingResult = await listener?.(
      {
        type: 'readingClip',
        data: {
          content: '# reading',
          title: 'Reading title',
          url: 'https://reader.example.com',
          highlights: [],
          exportMode: 'highlights'
        }
      },
      { tabId: 12 }
    );

    expect(clipResult).toEqual({ success: true, filePath: 'Video/example.md' });
    expect(readingResult).toEqual({ success: true, filePath: 'Video/example.md' });
    expect(processClipPayloadMock).toHaveBeenNthCalledWith(1, {
      markdown: '# clip',
      title: 'Clip title',
      meta: { url: 'https://example.com' }
    });
    expect(processClipPayloadMock).toHaveBeenNthCalledWith(2, {
      markdown: '# reading',
      title: 'Reading title',
      type: 'clipper',
      meta: {
        url: 'https://reader.example.com',
        readerMode: true,
        exportMode: 'highlights'
      }
    });
  });

  it('rejects malformed clip payloads through existing error responses', async () => {
    const { registerRuntimeMessageListener } =
      await import('../../../src/background/listeners/runtimeMessages');
    registerRuntimeMessageListener(createDependencies());

    await listener?.(
      {
        type: 'CLIP_RESULT',
        payload: {
          markdown: '# hello',
          meta: { attachments: [{ id: 'missing-required-fields' }] }
        }
      },
      { tabId: 12 }
    );
    const repositoryResult = await listener?.(
      {
        type: 'clip',
        data: {
          markdown: '# clip',
          meta: { exportDestination: { kind: 'external' } }
        }
      },
      { tabId: 12 }
    );

    expect(handleClipResultMock).not.toHaveBeenCalled();
    expect(processClipPayloadMock).not.toHaveBeenCalled();
    expect(notifyExtractionErrorMock).toHaveBeenCalledWith('Invalid clip payload received.');
    expect(repositoryResult).toEqual({
      success: false,
      error: 'Invalid clip payload received.'
    });
  });

  it('opens the options page and reports failures or unknown messages safely', async () => {
    const dependencies = createDependencies();
    const { registerRuntimeMessageListener } =
      await import('../../../src/background/listeners/runtimeMessages');
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
