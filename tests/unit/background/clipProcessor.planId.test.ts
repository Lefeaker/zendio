import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  classifyClipMock,
  downloadMock,
  getOptionsMock,
  inspectDownloadMock,
  resetClipProcessorHarnessMocks,
  resolvePathMock,
  restoreClipProcessorHarnessMocks,
  templateOptions,
  writeAttachmentMock,
  writeMarkdownMock
} from './clipTestHarness';
import type { ClipPayload } from '../../../src/shared/types/clip';
import { ClipAttachmentProgressSchema } from '../../../src/shared/types/clipResult';
import { prepareVideoClipAttachments } from '../../../src/background/application/videoScreenshotAttachmentPlanner';

function legacyProgress(payload: ClipPayload) {
  const planId = createHash('sha256')
    .update(
      JSON.stringify({
        markdown: payload.markdown,
        title: payload.title,
        type: payload.type,
        sourceUrl: payload.meta?.url,
        operationId: payload.meta?.operationId,
        target: { storageTarget: 'downloads' },
        filePath: 'note.md',
        prepared: prepareVideoClipAttachments({
          payload,
          notePath: 'note.md',
          destination: 'downloads'
        })
      })
    )
    .digest('hex');
  return ClipAttachmentProgressSchema.parse({
    operationId: 'op_attachment1',
    planId,
    storageTarget: 'downloads',
    total: 1,
    phase: 'note',
    confirmed: [{ id: 'a', outputPath: 'a.jpg', download: { id: 1, filename: '/downloads/a.jpg' } }]
  });
}

function attachmentPayload(): ClipPayload {
  return {
    type: 'video',
    title: 'Note',
    markdown: '![A](aiob-attachment:a)',
    meta: {
      operationId: 'op_attachment1',
      exportDestination: { kind: 'downloads' },
      attachments: [
        {
          id: 'a',
          fileName: 'a.jpg',
          mimeType: 'image/jpeg',
          content: { encoding: 'base64', data: 'YWFh', byteLength: 3 }
        }
      ]
    }
  };
}

describe('asynchronous attachment plan preflight', () => {
  beforeEach(() => {
    vi.resetModules();
    resetClipProcessorHarnessMocks();
    getOptionsMock.mockResolvedValue({ templates: templateOptions, domainMappings: {}, rest: {} });
    classifyClipMock.mockResolvedValue({ type: 'video', topics: [], tags: [], status: 'success' });
    resolvePathMock.mockReturnValue('Video/note.md');
    downloadMock.mockResolvedValue(1);
  });
  afterEach(restoreClipProcessorHarnessMocks);

  it('waits for native digest completion before any attachment or note write', async () => {
    const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      await held;
      return nativeDigest(...args);
    });
    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    const pending = processClipPayload(attachmentPayload());
    try {
      await vi.waitFor(() => expect(digest).toHaveBeenCalledTimes(1));
      expect(downloadMock).not.toHaveBeenCalled();
      expect(writeAttachmentMock).not.toHaveBeenCalled();
      expect(writeMarkdownMock).not.toHaveBeenCalled();
    } finally {
      release();
      await pending;
    }
    expect(downloadMock).toHaveBeenCalledTimes(2);
  });

  it('upgrades verified legacy progress and does not repeat confirmed attachments or legacy hashing', async () => {
    const payload = attachmentPayload();
    const progress = legacyProgress(payload);
    const original = structuredClone(progress);
    payload.meta = { ...payload.meta, attachmentProgress: progress };
    inspectDownloadMock.mockResolvedValue({
      state: 'complete',
      filename: '/downloads/a.jpg',
      exists: true
    });
    downloadMock.mockRejectedValue(new Error('note reply lost'));
    const digest = vi.spyOn(crypto.subtle, 'digest');
    const { processClipPayload, clipProcessingFailureResult } =
      await import('../../../src/background/application/clipProcessor');
    const upgraded = await processClipPayload(payload).catch(clipProcessingFailureResult);
    if (!('attachmentProgress' in upgraded) || !upgraded.attachmentProgress)
      throw new Error('Expected preserved progress');
    expect(upgraded.attachmentProgress.planId).not.toBe(progress.planId);
    expect(ClipAttachmentProgressSchema.safeParse(upgraded.attachmentProgress).success).toBe(true);
    expect(upgraded.attachmentProgress.confirmed).toEqual(progress.confirmed);
    expect(progress).toEqual(original);
    expect(digest).toHaveBeenCalledTimes(3);
    expect(downloadMock.mock.calls.map(([options]) => options.filename)).toEqual(['note.md']);

    digest.mockClear();
    payload.meta.attachmentProgress = upgraded.attachmentProgress;
    await processClipPayload(payload).catch(clipProcessingFailureResult);
    expect(digest).toHaveBeenCalledTimes(2);
    expect(downloadMock.mock.calls.map(([options]) => options.filename)).toEqual([
      'note.md',
      'note.md'
    ]);
  });

  it('rejects mismatched legacy content without erasing its confirmations', async () => {
    const payload = attachmentPayload();
    const progress = legacyProgress(payload);
    payload.meta = { ...payload.meta, attachmentProgress: progress };
    payload.title = 'Changed';
    const { processClipPayload, clipProcessingFailureResult } =
      await import('../../../src/background/application/clipProcessor');
    const failure = await processClipPayload(payload).catch(clipProcessingFailureResult);
    expect(failure).toMatchObject({
      outcome: 'unknown',
      stage: 'prepare',
      attachmentProgress: { ...progress, blocked: true }
    });
    expect(progress.blocked).toBeUndefined();
    expect(downloadMock).not.toHaveBeenCalled();
    expect(writeAttachmentMock).not.toHaveBeenCalled();
    expect(writeMarkdownMock).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'fails before writes on digest rejection, preserving history=%s',
    async (withHistory) => {
      const payload = attachmentPayload();
      const progress = withHistory ? legacyProgress(payload) : undefined;
      payload.meta = { ...payload.meta, attachmentProgress: progress };
      vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('native digest failed'));
      const { processClipPayload, clipProcessingFailureResult } =
        await import('../../../src/background/application/clipProcessor');
      const failure = await processClipPayload(payload).catch(clipProcessingFailureResult);
      expect(failure).toMatchObject({
        outcome: withHistory ? 'unknown' : 'failed',
        stage: 'prepare'
      });
      if (!('success' in failure)) throw new Error('Expected preparation failure');
      expect(failure.attachmentProgress).toEqual(progress);
      expect(downloadMock).not.toHaveBeenCalled();
      expect(writeAttachmentMock).not.toHaveBeenCalled();
      expect(writeMarkdownMock).not.toHaveBeenCalled();
    }
  );

  it.each([2, 3])(
    'preserves the old plan when native digest %s rejects during continuation',
    async (failedDigest) => {
      const payload = attachmentPayload();
      const progress = legacyProgress(payload);
      payload.meta = { ...payload.meta, attachmentProgress: progress };
      const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
      let calls = 0;
      vi.spyOn(crypto.subtle, 'digest').mockImplementation((...args) => {
        calls += 1;
        return calls === failedDigest
          ? Promise.reject(new Error('native digest failed'))
          : nativeDigest(...args);
      });
      const { processClipPayload, clipProcessingFailureResult } =
        await import('../../../src/background/application/clipProcessor');
      const failure = await processClipPayload(payload).catch(clipProcessingFailureResult);
      expect(failure).toMatchObject({
        outcome: 'unknown',
        stage: 'prepare',
        attachmentProgress: progress
      });
      expect(calls).toBe(failedDigest);
      expect(downloadMock).not.toHaveBeenCalled();
      expect(writeAttachmentMock).not.toHaveBeenCalled();
      expect(writeMarkdownMock).not.toHaveBeenCalled();
    }
  );
});
