import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadPreparedClip } from '../../../src/background/application/downloadClip';
import type { PreparedClipAttachments } from '../../../src/background/application/videoScreenshotAttachmentPlanner';
import type { DownloadStatus } from '../../../src/platform/interfaces/downloads';
import { createPreviewPlatformServices } from '../../../src/platform/preview/services';
import {
  classifyClipMock,
  createClipResultMessage,
  downloadMock,
  getOptionsMock,
  inspectDownloadMock,
  notifySuccessMock,
  onDownloadChangedMock,
  recordUsageMock,
  resetClipProcessorHarnessMocks,
  resolvePathMock,
  templateOptions
} from './clipTestHarness';

const sourceMarkdown = '![Screenshot](aiob-attachment:shot)';
const prepared: PreparedClipAttachments = {
  markdown: '![Screenshot](shot.jpg)',
  attachments: [
    {
      id: 'shot',
      fileName: 'shot.jpg',
      mimeType: 'image/jpeg',
      content: { kind: 'base64', binary: { encoding: 'base64', data: 'YWFh', byteLength: 3 } },
      outputPath: 'shot.jpg',
      markdownPath: 'shot.jpg',
      markdownUrl: 'shot.jpg'
    }
  ]
};

function nativeDownloads(initialState: DownloadStatus['state'] = 'complete') {
  const items = new Map<number, DownloadStatus>();
  const listeners = new Set<() => void>();
  const blobs: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    if (!(blob instanceof Blob)) throw new Error('Expected a download Blob');
    blobs.push(blob);
    return `blob:download-${blobs.length}`;
  });
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const download = vi.fn((options: { filename: string; url: string }) => {
    const id = items.size + 1;
    items.set(id, {
      state: initialState,
      filename: `/downloads/${options.filename.replace(/\.(\w+)$/u, ' (1).$1')}`
    });
    return Promise.resolve<number | undefined>(id);
  });
  const search = vi.fn(({ id }: { id: number }) => {
    const item = items.get(id);
    return Promise.resolve(item ? [item] : []);
  });
  const api = {
    download,
    search,
    cancel: vi.fn(() => Promise.resolve()),
    onChanged: {
      addListener: vi.fn((listener: () => void) => listeners.add(listener)),
      removeListener: vi.fn((listener: () => void) => listeners.delete(listener))
    }
  };
  return {
    api,
    blobs,
    revoke,
    complete(id: number) {
      const item = items.get(id);
      if (!item) throw new Error('Expected the native download to have started');
      item.state = 'complete';
      for (const listener of listeners) listener();
    }
  };
}

describe.each(['chrome', 'firefox'])('%s application download completion owner', (platform) => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    resetClipProcessorHarnessMocks();
    notifySuccessMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function loadService() {
    return platform === 'chrome'
      ? (await import('../../../src/platform/chrome/downloads')).chromeDownloadsService
      : (await import('../../../src/platform/firefox/downloads')).firefoxDownloadsService;
  }

  it('returns the native ID and confirmed filename from the adapter', async () => {
    const native = nativeDownloads();
    vi.stubGlobal(platform === 'chrome' ? 'chrome' : 'browser', { downloads: native.api });
    const downloads = await loadService();
    await expect(downloads.download({ filename: 'note.md', content: '# note' })).resolves.toEqual({
      state: 'complete',
      id: 1,
      filename: '/downloads/note (1).md'
    });
    expect(native.revoke).toHaveBeenCalledExactlyOnceWith('blob:download-1');
  });

  it('observes each new file once and uses the confirmed native names for links and results', async () => {
    const native = nativeDownloads();
    vi.stubGlobal(platform === 'chrome' ? 'chrome' : 'browser', { downloads: native.api });
    const result = await downloadPreparedClip({
      downloads: await loadService(),
      filePath: 'note.md',
      sourceMarkdown,
      prepared,
      completeStage: (_stage, action) => action()
    });
    expect(result).toEqual({
      filePath: '/downloads/note (1).md',
      downloadId: 2,
      downloadIds: [1, 2]
    });
    await expect(native.blobs[1]?.text()).resolves.toBe('![Screenshot](shot%20%281%29.jpg)');
    expect(native.api.onChanged.addListener).toHaveBeenCalledTimes(2);
    expect(native.api.onChanged.removeListener).toHaveBeenCalledTimes(2);
    expect(native.api.search).toHaveBeenCalledTimes(2);
    expect(native.revoke).toHaveBeenCalledTimes(2);
  });

  it.each(['missing item', 'interrupted', 'missing ID', 'create rejected', 'inspection rejected'])(
    'releases the resource and stops before Markdown when an attachment is %s',
    async (failure) => {
      const native = nativeDownloads(failure === 'interrupted' ? 'interrupted' : 'complete');
      if (failure === 'missing item') native.api.search.mockResolvedValue([]);
      if (failure === 'missing ID') native.api.download.mockResolvedValueOnce(undefined);
      if (failure === 'create rejected') {
        native.api.download.mockRejectedValueOnce(new Error('Download creation failed'));
      }
      if (failure === 'inspection rejected') {
        native.api.search.mockRejectedValueOnce(new Error('Download inspection failed'));
      }
      vi.stubGlobal(platform === 'chrome' ? 'chrome' : 'browser', { downloads: native.api });
      await expect(
        downloadPreparedClip({
          downloads: await loadService(),
          filePath: 'note.md',
          sourceMarkdown,
          prepared,
          completeStage: (_stage, action) => action()
        })
      ).rejects.toThrow(/Download/u);
      expect(native.api.download).toHaveBeenCalledTimes(1);
      expect(native.revoke).toHaveBeenCalledExactlyOnceWith('blob:download-1');
      expect(native.api.onChanged.removeListener).toHaveBeenCalledTimes(
        native.api.onChanged.addListener.mock.calls.length
      );
    }
  );

  it('keeps a timed-out result unknown after a late completion and starts no following file', async () => {
    const native = nativeDownloads('in_progress');
    vi.stubGlobal(platform === 'chrome' ? 'chrome' : 'browser', { downloads: native.api });
    const pending = downloadPreparedClip({
      downloads: await loadService(),
      filePath: 'note.md',
      sourceMarkdown,
      prepared,
      completeStage: (_stage, action) => action()
    });
    await Promise.all([
      expect(pending).rejects.toMatchObject({ message: 'REQUEST_TIMEOUT', timedOut: true }),
      vi.advanceTimersByTimeAsync(120_000)
    ]);
    native.complete(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(native.api.cancel).toHaveBeenCalledExactlyOnceWith(1);
    expect(native.api.download).toHaveBeenCalledTimes(1);
    expect(native.revoke).toHaveBeenCalledExactlyOnceWith('blob:download-1');
    expect(native.api.onChanged.removeListener).toHaveBeenCalledTimes(1);
  });

  it('keeps the production handler acknowledgement pending until native completion', async () => {
    const native = nativeDownloads('in_progress');
    vi.stubGlobal(platform === 'chrome' ? 'chrome' : 'browser', { downloads: native.api });
    const downloads = await loadService();
    downloadMock.mockImplementation(downloads.download.bind(downloads));
    if (!downloads.inspect || !downloads.onChanged) throw new Error('Missing native observer');
    inspectDownloadMock.mockImplementation(downloads.inspect.bind(downloads));
    onDownloadChangedMock.mockImplementation(downloads.onChanged.bind(downloads));
    getOptionsMock.mockResolvedValue({ templates: templateOptions, domainMappings: {}, rest: {} });
    classifyClipMock.mockResolvedValue({
      type: 'article',
      topics: [],
      tags: [],
      status: 'success'
    });
    resolvePathMock.mockReturnValue('note.md');
    const { handleClipResult } = await import('../../../src/background/pipelines/clipPipeline');
    let acknowledged = false;
    const pending = handleClipResult(
      createClipResultMessage({ meta: { exportDestination: { kind: 'downloads' } } }),
      undefined,
      { sendSupportPrompt: vi.fn().mockResolvedValue(undefined) }
    ).then((result) => {
      acknowledged = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(30_001);
    expect(native.api.download).toHaveBeenCalledTimes(1);
    expect(acknowledged).toBe(false);
    expect(native.revoke).not.toHaveBeenCalled();
    expect(notifySuccessMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
    native.complete(1);
    await expect(pending).resolves.toEqual({
      success: true,
      outcome: 'saved',
      filePath: '/downloads/note (1).md'
    });
    expect(native.revoke).toHaveBeenCalledExactlyOnceWith('blob:download-1');
  });

  it.each(['missing native ID', 'simulated preview'])(
    'does not acknowledge a saved file for %s',
    async (failure) => {
      const native = nativeDownloads();
      native.api.download.mockResolvedValueOnce(undefined);
      vi.stubGlobal(platform === 'chrome' ? 'chrome' : 'browser', { downloads: native.api });
      const downloads =
        failure === 'simulated preview'
          ? createPreviewPlatformServices().downloads
          : await loadService();
      downloadMock.mockImplementation(downloads.download.bind(downloads));
      getOptionsMock.mockResolvedValue({
        templates: templateOptions,
        domainMappings: {},
        rest: {}
      });
      classifyClipMock.mockResolvedValue({
        type: 'article',
        topics: [],
        tags: [],
        status: 'success'
      });
      resolvePathMock.mockReturnValue('note.md');
      const { handleClipResult } = await import('../../../src/background/pipelines/clipPipeline');
      await expect(
        handleClipResult(
          createClipResultMessage({ meta: { exportDestination: { kind: 'downloads' } } }),
          undefined,
          { sendSupportPrompt: vi.fn().mockResolvedValue(undefined) }
        )
      ).resolves.toEqual({
        success: false,
        outcome: 'unknown',
        code: 'CLIP_RESULT_UNKNOWN',
        failureCategory: 'write',
        stage: 'note',
        message: { key: 'saveResultUnknown' }
      });
      expect(notifySuccessMock).not.toHaveBeenCalled();
      expect(recordUsageMock).not.toHaveBeenCalled();
      expect(native.api.onChanged.addListener).not.toHaveBeenCalled();
    }
  );
});
