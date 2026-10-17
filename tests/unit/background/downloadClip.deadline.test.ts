import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../../src/shared/config';
import type { ClipPayload } from '../../../src/shared/types';
import type { Options } from '../../../src/background/store';
import { registerService, resetGlobalRegistry, TOKENS } from '../../../src/shared/di';
import { createPreviewPlatformServices } from '../../../src/platform/preview/services';
import { chromeDownloadsService } from '../../../src/platform/chrome/downloads';
import {
  processClipPayload,
  clipProcessingFailureResult
} from '../../../src/background/application/clipProcessor';
import { awaitClipSaveResult } from '../../../src/shared/types/clipResult';

let options: Options;
vi.mock('../../../src/background/store', () => ({ getOptions: () => Promise.resolve(options) }));
vi.mock('../../../src/background/services/analyticsEvents', () => ({
  trackUsageEvent: () => Promise.resolve(),
  trackActivationMilestoneIfNeeded: () => Promise.resolve()
}));
vi.mock('../../../src/background/services/usageStats', () => ({
  recordClipUsage: () => Promise.resolve()
}));

function payload(): ClipPayload {
  return {
    type: 'video',
    title: 'Deadline note',
    markdown: '![one](aiob-attachment:one)\n![two](aiob-attachment:two)',
    meta: {
      operationId: 'op_deadline123',
      url: 'https://example.test/video',
      exportDestination: { kind: 'downloads' },
      attachments: ['one', 'two'].map((id) => ({
        id,
        fileName: `${id}.jpg`,
        mimeType: 'image/jpeg',
        content: { encoding: 'base64', data: 'YQ==', byteLength: 1 }
      }))
    }
  };
}

function nativeDownloads(delay = 80_000) {
  const listeners = new Set<() => void>();
  const items = new Map<number, { state: string; filename: string; exists: boolean }>();
  const download = vi.fn(({ filename }: chrome.downloads.DownloadOptions) => {
    const id = items.size + 1;
    const item = { state: 'in_progress', filename: `/downloads/${filename}`, exists: true };
    items.set(id, item);
    setTimeout(() => {
      item.state = 'complete';
      for (const notify of listeners) notify();
    }, delay);
    return Promise.resolve(id);
  });
  const cancel = vi.fn().mockResolvedValue(undefined);
  const search = vi.fn(({ id }: { id: number }) => Promise.resolve([items.get(id)]));
  vi.stubGlobal('chrome', {
    downloads: {
      download,
      cancel,
      search,
      onChanged: {
        addListener: (listener: () => void) => listeners.add(listener),
        removeListener: (listener: () => void) => listeners.delete(listener)
      }
    }
  });
  const platform = createPreviewPlatformServices();
  platform.downloads = chromeDownloadsService;
  registerService(TOKENS.platformServices, () => platform);
  return {
    download,
    cancel,
    search,
    items,
    listeners,
    setDelay: (value: number) => (delay = value)
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  options = {
    ...DEFAULT_OPTIONS,
    classifier: { ...DEFAULT_OPTIONS.classifier, enabled: false },
    templates: { ...DEFAULT_OPTIONS.templates, video: 'Videos/{title}.md' },
    video: {
      ...DEFAULT_OPTIONS.video,
      screenshotAttachment: {
        locationTemplate: 'shots',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat: ''
      }
    }
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetGlobalRegistry();
});

it('returns confirmed progress before the UI deadline and never starts Markdown after the shared budget', async () => {
  const native = nativeDownloads();
  const result = processClipPayload(payload()).catch(clipProcessingFailureResult);
  const reply = awaitClipSaveResult(() => result);
  let observed: Awaited<typeof reply> | undefined;
  void reply.then((value) => {
    observed = value;
  });
  await vi.waitFor(() => expect(native.download).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(80_000);
  expect(native.download).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(40_000);
  const failure = observed;
  expect(failure).toMatchObject({
    success: false,
    outcome: 'unknown',
    failureCategory: 'timeout',
    stage: 'attachments',
    attachmentProgress: { confirmed: [{ id: 'one', download: { id: 1 } }] }
  });
  expect(native.cancel).toHaveBeenCalledExactlyOnceWith(2);
  expect(native.listeners.size).toBe(0);
  // Cancellation may race a real completion; late events cannot turn the failure into success.
  await vi.advanceTimersByTimeAsync(120_000);
  expect(native.items.get(2)?.state).toBe('complete');
  expect(native.download).toHaveBeenCalledTimes(2);
  expect(failure).toMatchObject({ attachmentProgress: { confirmed: [{ id: 'one' }] } });
});

it('gives an explicit continuation a fresh budget and verifies the confirmed file before new writes', async () => {
  const native = nativeDownloads();
  const result = processClipPayload(payload()).catch(clipProcessingFailureResult);
  await vi.waitFor(() => expect(native.download).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(120_000);
  const failure = await result;
  if (!('success' in failure)) throw new Error('Expected the download request to fail');
  expect(failure.attachmentProgress?.confirmed).toHaveLength(1);
  native.setDelay(50_000);
  const continued = payload();
  continued.meta = { ...continued.meta, attachmentProgress: failure.attachmentProgress };
  const resume = processClipPayload(continued);
  await vi.waitFor(() => expect(native.download).toHaveBeenCalledTimes(3));
  await vi.advanceTimersByTimeAsync(100_000);
  await expect(resume).resolves.toMatchObject({ destination: 'downloads' });
  expect(native.download.mock.calls.map(([options]) => options.filename)).toEqual([
    'shots/one.jpg',
    'shots/two.jpg',
    'shots/two.jpg',
    'Deadline note.md'
  ]);
  expect(native.cancel).toHaveBeenCalledExactlyOnceWith(2);
});

it('bounds a stalled continuation inspection without losing or blocking its confirmations', async () => {
  const native = nativeDownloads();
  const first = processClipPayload(payload()).catch(clipProcessingFailureResult);
  await vi.waitFor(() => expect(native.download).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(120_000);
  const previous = await first;
  if (!('success' in previous)) throw new Error('Expected the download request to fail');
  const continued = payload();
  continued.meta = { ...continued.meta, attachmentProgress: previous.attachmentProgress };
  native.search.mockImplementation(() => new Promise(() => {}));
  const previousInspections = native.search.mock.calls.length;
  const result = processClipPayload(continued).catch(clipProcessingFailureResult);
  await vi.waitFor(() => expect(native.search).toHaveBeenCalledTimes(previousInspections + 1));
  await vi.advanceTimersByTimeAsync(120_000);
  await expect(result).resolves.toMatchObject({
    outcome: 'unknown',
    failureCategory: 'timeout',
    attachmentProgress: { confirmed: [{ id: 'one' }] }
  });
  const failure = await result;
  if (!('success' in failure)) throw new Error('Expected the continuation to fail');
  expect(failure.attachmentProgress?.blocked).toBeUndefined();
  expect(native.download).toHaveBeenCalledTimes(2);
});

it('bounds a native creation promise, cancels its late own ID and never starts another file', async () => {
  const native = nativeDownloads();
  let release!: (id: number) => void;
  native.download.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const result = processClipPayload(payload()).catch(clipProcessingFailureResult);
  await vi.waitFor(() => expect(native.download).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(120_000);
  await expect(result).resolves.toMatchObject({
    outcome: 'unknown',
    failureCategory: 'timeout',
    attachmentProgress: { confirmed: [] }
  });
  expect(native.cancel).not.toHaveBeenCalled();
  release(91);
  await vi.advanceTimersByTimeAsync(0);
  expect(native.cancel).toHaveBeenCalledExactlyOnceWith(91);
  expect(native.download).toHaveBeenCalledOnce();
});

it('spends classification time from the same request budget before starting Downloads', async () => {
  options.classifier = { ...DEFAULT_OPTIONS.classifier, enabled: true, timeoutMs: 300_000 };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {}))
  );
  const native = nativeDownloads();
  const result = processClipPayload(payload()).catch(clipProcessingFailureResult);
  await vi.advanceTimersByTimeAsync(120_000);
  await expect(result).resolves.toMatchObject({ failureCategory: 'timeout' });
  expect(native.download).not.toHaveBeenCalled();
});
