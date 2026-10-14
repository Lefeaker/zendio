import { chromium, expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import path from 'node:path';
import { EXTENSION_PATH, createOptionsFixture } from '../utils/videoListenerScopeHarness';
import type { ReaderSessionDraftEnvelope } from '../../../src/shared/sessionDrafts/types';

export { EXTENSION_PATH };

export function distribution(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    n: sorted.length,
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1] ?? null,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null,
    maxMs: sorted.at(-1) ?? null,
    estimator: 'nearest rank; small-sample descriptive estimate, not a tail-latency guarantee'
  };
}

export async function artifactIdentity() {
  const files: Array<{ path: string; bytes: number; sha256: string }> = [];
  async function visit(relative = ''): Promise<void> {
    for (const entry of await readdir(path.join(EXTENSION_PATH, relative), {
      withFileTypes: true
    })) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) {
        const bytes = await readFile(path.join(EXTENSION_PATH, name));
        files.push({
          path: name,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex')
        });
      }
    }
  }
  await visit();
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    extensionPath: EXTENSION_PATH,
    sha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
    files
  };
}

export async function saveEvidence(testInfo: TestInfo, data: object): Promise<void> {
  const file = testInfo.outputPath('workload-samples.json');
  const repo = path.resolve(EXTENSION_PATH, '../..');
  const inputPaths = [
    'package-lock.json',
    path.relative(repo, testInfo.file),
    'tests/e2e/performance/workloadEvidence.ts',
    'tests/e2e/performance/videoWorkload.ts',
    'tests/e2e/performance/playwright.config.ts',
    'tests/e2e/utils/exportTitleSinks.ts',
    'tests/e2e/utils/videoListenerScopeHarness.ts',
    'tests/e2e/utils/videoScreenshotCacheIndexedDb.ts',
    'tests/e2e/fixtures/bilibili-comments-shadow.ts',
    'tests/utils/videoControlBarGeometry.ts'
  ];
  const inputs = await Promise.all(
    inputPaths.map(async (name) => ({
      path: name,
      sha256: createHash('sha256')
        .update(await readFile(path.join(repo, name)))
        .digest('hex')
    }))
  );
  await writeFile(
    file,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        environment: {
          platform: platform(),
          release: release(),
          arch: arch(),
          cpu: cpus()[0]?.model,
          logicalCpus: cpus().length,
          physicalMemoryBytes: totalmem(),
          node: process.version
        },
        artifact: await artifactIdentity(),
        inputs,
        browserExecutable: chromium.executablePath(),
        clock: 'Node performance.now; includes Playwright transport and observation overhead',
        scope:
          'Isolated installed Chromium extension; controlled HTML/media, no live website/network/video decoder benchmark',
        ...data
      },
      null,
      2
    )
  );
  await testInfo.attach('workload-samples.json', { path: file, contentType: 'application/json' });
}

export async function launchWorkloadBrowser(testInfo: TestInfo, name: string) {
  const profile = testInfo.outputPath(`profile-${name}`);
  const downloads = testInfo.outputPath(`downloads-${name}`);
  await mkdir(path.join(profile, 'Default'), { recursive: true });
  await mkdir(downloads, { recursive: true });
  await writeFile(
    path.join(profile, 'Default', 'Preferences'),
    JSON.stringify({
      download: { default_directory: downloads, prompt_for_download: false }
    })
  );
  const started = performance.now();
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    acceptDownloads: false,
    viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`]
  });
  const background = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const browserAndWorkerReadyMs = performance.now() - started;
  const extensionId = background.url().split('/')[2];
  if (!extensionId) throw new Error('Missing installed extension identity');
  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options/index.html`);
  await extensionPage.evaluate(
    async (options) => {
      await chrome.storage.sync.set({ options });
    },
    createOptionsFixture({ selectionTriggerMode: 'direct' }, { exportMode: 'full' })
  );
  return {
    context,
    extensionPage,
    downloads,
    extensionId,
    browserAndWorkerReadyMs,
    async close() {
      try {
        const removed = await extensionPage.evaluate(() => {
          const state = globalThis as typeof globalThis & { __workloadStopDownloads?: () => void };
          if (!state.__workloadStopDownloads) return 0;
          state.__workloadStopDownloads();
          delete state.__workloadStopDownloads;
          return 2;
        });
        if (removed)
          await testInfo.attach('download-observer-cleanup.json', {
            body: JSON.stringify({
              removedEventListeners: removed,
              scope:
                'isolated extension control page; explicitly removed before context/profile teardown'
            }),
            contentType: 'application/json'
          });
      } finally {
        await context.close();
        await rm(profile, { recursive: true, force: true });
      }
    }
  };
}

export async function foreground(page: Page) {
  await page.bringToFront();
  const state = await page.evaluate(() => ({
    visibility: document.visibilityState,
    focused: document.hasFocus()
  }));
  expect(state).toEqual({ visibility: 'visible', focused: true });
  return state;
}

export async function openControlledPage(context: BrowserContext, url: string, html: string) {
  await context.route(url, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
  );
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-aiob-content-runtime', 'true');
  await foreground(page);
  return page;
}

export function longArticle(title: string, paragraphs = 400) {
  return `<!doctype html><html><head><title>${title}</title><style>
    body { margin: 24px; width: 740px; font: 16px/1.5 sans-serif; }
    .selection { display: inline-block; white-space: nowrap; }
    </style></head><body><article><h1>${title}</h1>${Array.from(
      { length: paragraphs },
      (_, index) =>
        `<p><span class="selection" id="selection-${index}">Evidence paragraph ${index} measured content.</span><br>${'Long article source evidence with a stable reproducible workload. '.repeat(5)}</p>`
    ).join('')}</article></body></html>`;
}

export async function dragParagraph(page: Page, index: number) {
  const target = page.locator(`#selection-${index}`);
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('Missing selection geometry');
  const started = performance.now();
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  return started;
}

export async function downloadIds(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const state = globalThis as typeof globalThis & {
      __workloadDownloads?: Record<number, string>;
      __workloadStopDownloads?: () => void;
    };
    if (!state.__workloadDownloads) {
      const downloads: Record<number, string> = {};
      state.__workloadDownloads = downloads;
      const created = (item: chrome.downloads.DownloadItem) => {
        downloads[item.id] = item.state;
      };
      const changed = (change: chrome.downloads.DownloadDelta) => {
        if (change.state?.current) downloads[change.id] = change.state.current;
      };
      chrome.downloads.onCreated.addListener(created);
      chrome.downloads.onChanged.addListener(changed);
      state.__workloadStopDownloads = () => {
        chrome.downloads.onCreated.removeListener(created);
        chrome.downloads.onChanged.removeListener(changed);
        if (
          chrome.downloads.onCreated.hasListener(created) ||
          chrome.downloads.onChanged.hasListener(changed)
        )
          throw new Error('Download observer listeners remained registered');
        delete state.__workloadDownloads;
      };
    }
    return (await chrome.downloads.search({})).map((item) => item.id);
  });
}

export async function readerDraftRecords(page: Page, url: string) {
  return page.evaluate(async (pageUrl) => {
    const stored = await chrome.storage.local.get<Record<string, ReaderSessionDraftEnvelope>>(null);
    return Object.entries(stored)
      .filter(
        ([key, entry]) =>
          key.startsWith('aiob.sessionDraft.v1.reader.') &&
          entry?.mode === 'reader' &&
          entry.pageUrl === pageUrl
      )
      .map(([key, record]) => ({ key, record }));
  }, url);
}

export function observeReaderDraft(page: Page, url: string) {
  let activeKey: string | undefined;
  return async () => {
    const records = (await readerDraftRecords(page, url)).filter(
      ({ record }) => record.status === 'active'
    );
    if (!records.length && !activeKey) return [];
    expect(records, 'one active production Reader draft').toHaveLength(1);
    activeKey ??= records[0].key;
    expect(records[0].key, 'same active draft throughout the retained-page scenario').toBe(
      activeKey
    );
    return records[0].record.payload?.highlights ?? [];
  };
}

export async function readCompletedDownloads(page: Page, previousIds: number[], count: number) {
  // Poll the small completion-event projection, not DownloadItem.url: attachments
  // use large data URLs, and copying all of them on each poll distorts this workload.
  // The extension control page is backgrounded during the user action. Keep the
  // polling clock in Node; browser setTimeout polling is subject to tab throttling.
  await expect
    .poll(
      () =>
        page.evaluate((previous) => {
          const states =
            (globalThis as typeof globalThis & { __workloadDownloads?: Record<number, string> })
              .__workloadDownloads ?? {};
          return Object.entries(states).filter(
            ([id, state]) => !previous.includes(Number(id)) && state === 'complete'
          ).length;
        }, previousIds),
      { intervals: [20], timeout: 60000 }
    )
    .toBe(count);
  const records = await page.evaluate(
    async (previous) =>
      (await chrome.downloads.search({}))
        .filter((item) => !previous.includes(item.id))
        .map((item) => ({
          id: item.id,
          filename: item.filename,
          fileSize: item.fileSize,
          state: item.state,
          error: item.error,
          startTime: item.startTime,
          endTime: item.endTime
        })),
    previousIds
  );
  expect(records).toHaveLength(count);
  return Promise.all(
    records.map(async (item) => {
      expect(item.error).toBeUndefined();
      expect(item.state).toBe('complete');
      const bytes = await readFile(item.filename);
      expect(bytes.length).toBe(item.fileSize);
      return {
        filename: item.filename,
        bytes,
        startTime: item.startTime,
        endTime: item.endTime,
        nativeDurationMs: item.endTime
          ? Date.parse(item.endTime) - Date.parse(item.startTime)
          : null,
        sha256: createHash('sha256').update(bytes).digest('hex')
      };
    })
  );
}

export async function sampleRendererMemory(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const samples: Array<{
    elapsedMs: number;
    jsHeapUsedBytes: number;
    nodes: number;
    taskDurationSeconds: number;
  }> = [];
  const started = performance.now();
  let pending: Promise<void> | undefined;
  async function sample() {
    const result = await cdp.send('Performance.getMetrics');
    const metrics = new Map(result.metrics.map((metric) => [metric.name, metric.value]));
    samples.push({
      elapsedMs: performance.now() - started,
      jsHeapUsedBytes: metrics.get('JSHeapUsedSize') ?? 0,
      nodes: metrics.get('Nodes') ?? 0,
      taskDurationSeconds: metrics.get('TaskDuration') ?? 0
    });
  }
  await sample();
  const timer = setInterval(() => {
    if (!pending)
      pending = sample().finally(() => {
        pending = undefined;
      });
  }, 100);
  const stop = async () => {
    clearInterval(timer);
    await pending;
    await sample();
    await cdp.detach();
    return {
      scope:
        'CDP target renderer JS heap, 100ms sampled lower bound of peak; excludes browser/service-worker/native/ArrayBuffer/GPU memory; no forced GC',
      sampledPeakJsHeapUsedBytes: Math.max(...samples.map((entry) => entry.jsHeapUsedBytes)),
      samples
    };
  };
  let stopped: ReturnType<typeof stop> | undefined;
  return () => (stopped ??= stop());
}
