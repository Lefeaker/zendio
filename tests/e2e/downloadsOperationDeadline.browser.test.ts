import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, type Worker } from '@playwright/test';
import type { Options } from '../../src/background/store';
import type { ClipPayload, ClipResultResponse } from '../../src/shared/types';
import { configureSink, test } from './utils/exportTitleSinks';

type DeadlineProbe = {
  starts: Array<{ id: number; filename: string; at: number }>;
  cancellations: number[];
  stopClockSteps(): void;
  expire(): void;
  releaseId(): void;
};
declare global {
  // eslint-disable-next-line no-var
  var __downloadsDeadlineProbe: DeadlineProbe | undefined;
}

function clip(): ClipPayload {
  return {
    title: 'Downloads deadline',
    type: 'video',
    markdown: '# Deadline\n![one](aiob-attachment:one)\n![two](aiob-attachment:two)',
    meta: {
      operationId: 'op_downloaddeadline',
      url: 'https://example.test/download-deadline',
      exportDestination: { kind: 'downloads' },
      attachments: ['one', 'two'].map((id) => ({
        id,
        fileName: `${id}.jpg`,
        mimeType: 'image/jpeg',
        content: { encoding: 'base64', data: 'YWFh', byteLength: 3 }
      }))
    }
  };
}

/** Native files are real. Only wall-clock accounting and native ID delivery are controlled. */
async function installFault(worker: Worker, holdId: boolean) {
  await worker.evaluate((holdId) => {
    const nativeDownload = chrome.downloads.download.bind(chrome.downloads);
    const nativeSearch = chrome.downloads.search.bind(chrome.downloads);
    const nativeCancel = chrome.downloads.cancel.bind(chrome.downloads);
    const nativeNow = Date.now;
    const nativeSetTimeout = globalThis.setTimeout;
    const nativeClearTimeout = globalThis.clearTimeout;
    let offset = 0;
    let stepClock = !holdId;
    let releaseId = () => {};
    const completed = new Set<number>();
    const deadlines: Array<{ timer: ReturnType<typeof nativeSetTimeout>; fire(): void }> = [];
    const probe: DeadlineProbe = {
      starts: [],
      cancellations: [],
      stopClockSteps: () => {
        stepClock = false;
      },
      expire() {
        offset += 120_001;
        for (const deadline of deadlines.splice(0)) {
          nativeClearTimeout(deadline.timer);
          deadline.fire();
        }
      },
      releaseId: () => releaseId()
    };
    globalThis.__downloadsDeadlineProbe = probe;
    Date.now = () => nativeNow() + offset;
    Object.defineProperty(globalThis, 'setTimeout', {
      configurable: true,
      value: (...[handler, delay, ...args]: Parameters<typeof nativeSetTimeout>) => {
        const timer = nativeSetTimeout(handler, delay, ...args);
        if (
          typeof handler === 'function' &&
          delay !== undefined &&
          delay > 110_000 &&
          delay <= 120_000
        )
          deadlines.push({ timer, fire: () => handler(...args) });
        return timer;
      }
    });
    Object.defineProperty(chrome.downloads, 'download', {
      configurable: true,
      value: async (options: chrome.downloads.DownloadOptions) => {
        const at = Date.now();
        const id = await nativeDownload(options);
        probe.starts.push({ id, filename: options.filename ?? '', at });
        if (holdId)
          await new Promise<void>((resolve) => {
            releaseId = resolve;
          });
        return id;
      }
    });
    Object.defineProperty(chrome.downloads, 'search', {
      configurable: true,
      value: async (query: chrome.downloads.DownloadQuery) => {
        const items = await nativeSearch(query);
        for (const item of items) {
          if (stepClock && item.state === 'complete' && !completed.has(item.id)) {
            completed.add(item.id);
            offset += 80_000;
          }
        }
        return items;
      }
    });
    Object.defineProperty(chrome.downloads, 'cancel', {
      configurable: true,
      value: (id: number) => {
        probe.cancellations.push(id);
        return nativeCancel(id);
      }
    });
  }, holdId);
}

test('one Downloads budget preserves native attachments, stops Markdown and permits explicit continuation', async ({
  extensionPage,
  context
}, testInfo) => {
  const directory = testInfo.outputPath('downloads');
  const sink = await configureSink(extensionPage, 'downloads', directory);
  try {
    await extensionPage.evaluate(async () => {
      const { options } = await chrome.storage.sync.get<{ options: Options }>('options');
      await chrome.storage.sync.set({
        options: {
          ...options,
          video: {
            ...options.video,
            screenshotAttachment: {
              locationTemplate: 'shots',
              fileNameTemplate: '${originalAttachmentFileName}',
              markdownUrlFormat: ''
            }
          }
        }
      });
    });
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('Missing installed extension worker');
    await installFault(worker, false);
    const first = await extensionPage.evaluate(
      (payload) =>
        chrome.runtime.sendMessage<
          { type: 'CLIP_RESULT'; payload: ClipPayload },
          ClipResultResponse
        >({ type: 'CLIP_RESULT', payload }),
      clip()
    );
    expect(first).toMatchObject({
      success: false,
      outcome: 'unknown',
      failureCategory: 'timeout',
      stage: 'attachments',
      attachmentProgress: { confirmed: [{ id: 'one' }] }
    });
    if (first.success || !('attachmentProgress' in first))
      throw new Error('Expected the timed-out download request to include attachment progress');
    const before = await worker.evaluate(() => ({
      starts: globalThis.__downloadsDeadlineProbe?.starts,
      cancellations: globalThis.__downloadsDeadlineProbe?.cancellations
    }));
    expect(before.starts?.map((item) => item.filename)).toEqual(['shots/one.jpg', 'shots/two.jpg']);
    expect(before.cancellations).toEqual([before.starts?.[1]?.id]);
    expect(await fs.readdir(directory)).toEqual(['shots']);
    expect(await fs.readdir(path.join(directory, 'shots'))).toEqual(['one.jpg', 'two.jpg']);
    expect(await fs.readFile(path.join(directory, 'shots/one.jpg'), 'utf8')).toBe('aaa');
    expect(await fs.readFile(path.join(directory, 'shots/two.jpg'), 'utf8')).toBe('aaa');
    // The second file really completed before cancellation; unknown must not claim absence.
    await worker.evaluate(() => globalThis.__downloadsDeadlineProbe?.stopClockSteps());
    const continued = clip();
    continued.meta = {
      ...continued.meta,
      attachmentProgress: first.attachmentProgress
    };
    const second = await extensionPage.evaluate(
      (payload) =>
        chrome.runtime.sendMessage<
          { type: 'CLIP_RESULT'; payload: ClipPayload },
          ClipResultResponse
        >({ type: 'CLIP_RESULT', payload }),
      continued
    );
    expect(second.success).toBe(true);
    if (!second.success) throw new Error('Continuation did not save');
    expect(second.filePath.startsWith(`${directory}${path.sep}`)).toBe(true);
    const markdown = await fs.readFile(second.filePath, 'utf8');
    expect(markdown).toContain('shots/one.jpg');
    expect(markdown).toContain('shots/two%20%281%29.jpg');
    expect(await fs.readdir(path.join(directory, 'shots'))).toEqual([
      'one.jpg',
      'two (1).jpg',
      'two.jpg'
    ]);
    await testInfo.attach('native-deadline-evidence', {
      body: JSON.stringify({ first, second, before }, null, 2),
      contentType: 'application/json'
    });
  } finally {
    await sink.close();
  }
});

test('a native ID delivered after timeout is cancelled without starting the next file', async ({
  extensionPage,
  context
}, testInfo) => {
  const directory = testInfo.outputPath('downloads');
  const sink = await configureSink(extensionPage, 'downloads', directory);
  try {
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('Missing installed extension worker');
    await installFault(worker, true);
    const result = extensionPage.evaluate(
      (payload) =>
        chrome.runtime.sendMessage<
          { type: 'CLIP_RESULT'; payload: ClipPayload },
          ClipResultResponse
        >({ type: 'CLIP_RESULT', payload }),
      clip()
    );
    await expect
      .poll(() => worker.evaluate(() => globalThis.__downloadsDeadlineProbe?.starts.length))
      .toBe(1);
    const [started] = await worker.evaluate(
      () => globalThis.__downloadsDeadlineProbe?.starts ?? []
    );
    if (!started) throw new Error('Native download did not start');
    await expect
      .poll(() =>
        extensionPage.evaluate(
          async (id) => (await chrome.downloads.search({ id }))[0]?.state,
          started.id
        )
      )
      .toBe('complete');
    const [item] = await extensionPage.evaluate(
      (id) => chrome.downloads.search({ id }),
      started.id
    );
    if (!item) throw new Error('Native download missing');
    expect(item.filename.startsWith(`${directory}${path.sep}`)).toBe(true);
    expect(await fs.readFile(item.filename, 'utf8')).toBe('aaa');
    await worker.evaluate(() => globalThis.__downloadsDeadlineProbe?.expire());
    const failure = await result;
    expect(failure).toMatchObject({
      success: false,
      outcome: 'unknown',
      failureCategory: 'timeout',
      attachmentProgress: { confirmed: [] }
    });
    await worker.evaluate(() => globalThis.__downloadsDeadlineProbe?.releaseId());
    await expect
      .poll(() => worker.evaluate(() => globalThis.__downloadsDeadlineProbe?.cancellations))
      .toEqual([started.id]);
    expect(await worker.evaluate(() => globalThis.__downloadsDeadlineProbe?.starts.length)).toBe(1);
    expect(await fs.readFile(item.filename, 'utf8')).toBe('aaa');
    await testInfo.attach('late-native-id-evidence', {
      body: JSON.stringify({ failure, item, started }, null, 2),
      contentType: 'application/json'
    });
  } finally {
    await sink.close();
  }
});
