import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyClipMock,
  createPayload,
  downloadMock,
  inspectDownloadMock,
  getOptionsMock,
  resetClipProcessorHarnessMocks,
  resolvePathMock,
  restoreClipProcessorHarnessMocks,
  templateOptions,
  selectVaultMock,
  writeAttachmentMock,
  writeMarkdownMock
} from './clipTestHarness';
import type { ClipPayload } from '../../../src/shared/types/clip';

describe('attachment continuation through the clip processor', () => {
  beforeEach(() => {
    vi.resetModules();
    resetClipProcessorHarnessMocks();
    getOptionsMock.mockResolvedValue({ templates: templateOptions, domainMappings: {}, rest: {} });
    classifyClipMock.mockResolvedValue({ type: 'video', topics: [], tags: [], status: 'success' });
    resolvePathMock.mockReturnValue('Video/note.md');
  });
  afterEach(restoreClipProcessorHarnessMocks);

  it.each(['attachment', 'note'] as const)(
    'continues after %s uncertainty without repeating confirmed attachments',
    async (failedPhase) => {
      const files = new Map<string, string>();
      const ids = new Map<number, string>();
      const writes: string[] = [];
      let fail = true;
      downloadMock.mockImplementation(async (options) => {
        writes.push(options.filename);
        if (fail && options.filename === (failedPhase === 'attachment' ? 'note/b.jpg' : 'note.md'))
          throw new Error('opaque write reply lost');
        const actual = options.filename.replace('a.jpg', 'a (1).jpg');
        files.set(actual, options.blob ? await options.blob.text() : (options.content ?? ''));
        const id = ids.size + 1;
        ids.set(id, actual);
        return id;
      });
      inspectDownloadMock.mockImplementation((id) =>
        Promise.resolve({
          state: 'complete',
          filename: `/downloads/${ids.get(Number(id)) ?? ''}`,
          exists: true
        })
      );
      const payload = createPayload({
        type: 'video',
        markdown: '![A](aiob-attachment:a)\n![B](aiob-attachment:b)',
        meta: {
          operationId: 'op_attachment1',
          exportDestination: { kind: 'downloads' },
          attachments: ['a', 'b'].map((id) => ({
            id,
            fileName: `${id}.jpg`,
            mimeType: 'image/jpeg',
            content: {
              encoding: 'base64' as const,
              data: id === 'a' ? 'YWFh' : 'YmJi',
              byteLength: 3
            }
          }))
        }
      });
      const { processClipPayload, clipProcessingFailureResult } =
        await import('../../../src/background/application/clipProcessor');
      const failure = await processClipPayload(payload).then(() => {
        throw new Error('Expected write uncertainty');
      }, clipProcessingFailureResult);
      expect(failure.outcome).toBe('unknown');
      expect(files.get('note/a (1).jpg')).toBe('aaa');
      expect(writes).toEqual(
        failedPhase === 'attachment'
          ? ['note/a.jpg', 'note/b.jpg']
          : ['note/a.jpg', 'note/b.jpg', 'note.md']
      );
      expect(failure.attachmentProgress).toMatchObject({
        operationId: 'op_attachment1',
        total: 2,
        phase: failedPhase === 'attachment' ? 'attachments' : 'note'
      });
      expect(failure.attachmentProgress?.confirmed).toHaveLength(
        failedPhase === 'attachment' ? 1 : 2
      );
      fail = false;
      await processClipPayload({
        ...payload,
        meta: { ...payload.meta, attachmentProgress: failure.attachmentProgress }
      });
      expect(writes.filter((path) => path === 'note/a.jpg')).toHaveLength(1);
      expect(writes.filter((path) => path === 'note/b.jpg')).toHaveLength(
        failedPhase === 'attachment' ? 2 : 1
      );
      expect(files.size).toBe(3);
      expect(files.get('note/b.jpg')).toBe('bbb');
      expect(files.get('note.md')).toBe('![A](note/a%20%281%29.jpg)\n![B](note/b.jpg)');
    }
  );

  it.each([
    'bytes',
    'order',
    'target',
    'path',
    'template',
    'operation',
    'missing-download'
  ] as const)(
    'refuses old confirmations after %s changes before any further write',
    async (change) => {
      const payload = attachmentPayload();
      downloadMock
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockRejectedValueOnce(new Error('note reply lost'));
      inspectDownloadMock.mockImplementation((id) =>
        Promise.resolve({
          state: 'complete',
          filename: `/downloads/note/${id === 1 ? 'a' : 'b'}.jpg`,
          exists: true
        })
      );
      const { processClipPayload, clipProcessingFailureResult } =
        await import('../../../src/background/application/clipProcessor');
      const failure = await processClipPayload(payload).then(() => {
        throw new Error('Expected note uncertainty');
      }, clipProcessingFailureResult);
      expect(failure.attachmentProgress?.confirmed).toHaveLength(2);
      const meta = payload.meta;
      if (!meta || !meta.attachments || !failure.attachmentProgress)
        throw new Error('Missing recovery fixture');
      meta.attachmentProgress = failure.attachmentProgress;
      if (change === 'bytes')
        meta.attachments[0] = {
          id: 'a',
          fileName: 'a.jpg',
          mimeType: 'image/jpeg',
          content: { encoding: 'base64', data: 'Y2Nj', byteLength: 3 }
        };
      if (change === 'order') meta.attachments.reverse();
      if (change === 'operation') meta.operationId = 'op_changed1';
      if (change === 'path') resolvePathMock.mockReturnValue('Other/changed.md');
      if (change === 'target') {
        meta.exportDestination = { kind: 'vault' };
        selectVaultMock.mockReturnValue({
          vault: null,
          restConfig: { baseUrl: 'https://target', vault: 'Changed', apiKey: 'key' }
        });
      }
      if (change === 'template')
        getOptionsMock.mockResolvedValue({
          templates: templateOptions,
          domainMappings: {},
          rest: {},
          video: {
            screenshotAttachment: {
              locationTemplate: 'changed',
              fileNameTemplate: '${originalAttachmentFileName}',
              markdownUrlFormat: ''
            }
          }
        });
      if (change === 'missing-download')
        inspectDownloadMock.mockResolvedValue({
          state: 'complete',
          filename: '/downloads/note/a.jpg',
          exists: false
        });
      const rejected = await processClipPayload(payload).then(() => {
        throw new Error('Unexpected continuation');
      }, clipProcessingFailureResult);
      expect(rejected).toMatchObject({ outcome: 'unknown', attachmentProgress: { blocked: true } });
      expect(rejected.attachmentProgress?.confirmed).toHaveLength(2);
      expect(downloadMock).toHaveBeenCalledTimes(3);
      expect(writeAttachmentMock).not.toHaveBeenCalled();
      expect(writeMarkdownMock).not.toHaveBeenCalled();
    }
  );

  it('reuses historical REST attachment confirmations without claiming readback', async () => {
    const payload = attachmentPayload();
    if (!payload.meta) throw new Error('Missing payload metadata');
    payload.meta.exportDestination = { kind: 'vault' };
    selectVaultMock.mockReturnValue({
      vault: null,
      restConfig: { baseUrl: 'https://target', vault: 'Vault', apiKey: 'key' }
    });
    writeAttachmentMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('second attachment uncertain'))
      .mockResolvedValue(undefined);
    writeMarkdownMock.mockResolvedValue(undefined);
    const { processClipPayload, clipProcessingFailureResult } =
      await import('../../../src/background/application/clipProcessor');
    const failure = await processClipPayload(payload).then(() => {
      throw new Error('Expected attachment uncertainty');
    }, clipProcessingFailureResult);
    expect(failure.attachmentProgress).toMatchObject({
      storageTarget: 'rest-api',
      phase: 'attachments'
    });
    expect(failure.attachmentProgress?.confirmed).toHaveLength(1);
    payload.meta.attachmentProgress = failure.attachmentProgress;
    await processClipPayload(payload);
    expect(writeAttachmentMock).toHaveBeenCalledTimes(3);
    expect(
      writeAttachmentMock.mock.calls.map((call) => (typeof call[0] === 'string' ? call[0] : ''))
    ).toEqual(['Video/assets/note/a.jpg', 'Video/assets/note/b.jpg', 'Video/assets/note/b.jpg']);
    expect(writeMarkdownMock).toHaveBeenCalledWith(
      'Video/note.md',
      '![A](assets/note/a.jpg)\n![B](assets/note/b.jpg)'
    );
    expect(inspectDownloadMock).not.toHaveBeenCalled();
  });
});

function attachmentPayload(): ClipPayload {
  return {
    type: 'video',
    title: 'Note',
    markdown: '![A](aiob-attachment:a)\n![B](aiob-attachment:b)',
    meta: {
      operationId: 'op_attachment1',
      exportDestination: { kind: 'downloads' },
      attachments: ['a', 'b'].map((id) => ({
        id,
        fileName: `${id}.jpg`,
        mimeType: 'image/jpeg',
        content: { encoding: 'base64', data: id === 'a' ? 'YWFh' : 'YmJi', byteLength: 3 }
      }))
    }
  };
}
