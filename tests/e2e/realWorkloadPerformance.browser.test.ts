import { expect, test } from '@playwright/test';
import path from 'node:path';
import { configureSink } from './utils/exportTitleSinks';
import {
  bilibiliFixtureHtml,
  expandVideoPanel,
  findCurrentTabId,
  startVideoMode
} from './utils/videoListenerScopeHarness';
import { readVideoScreenshotCacheIndexedDbSummary } from './utils/videoScreenshotCacheIndexedDb';
import {
  advanceVideoFrame,
  installEncodingProbe,
  installVideoFrames,
  readEncodingProbe
} from './performance/videoWorkload';
import {
  distribution,
  downloadIds,
  dragParagraph,
  foreground,
  launchWorkloadBrowser,
  longArticle,
  openControlledPage,
  readCompletedDownloads,
  readerDraftRecords,
  observeReaderDraft,
  sampleRendererMemory,
  saveEvidence
} from './performance/workloadEvidence';

test('cold process startup and first usable video control, ten fresh profiles', async ({
  browserName
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const samples = [];
  for (let index = 0; index < 10; index += 1) {
    const session = await launchWorkloadBrowser(testInfo, `cold-${index}`);
    try {
      const started = performance.now();
      const page = await openControlledPage(
        session.context,
        `https://www.bilibili.com/video/BV1perfCold${index}/`,
        bilibiliFixtureHtml()
      );
      await page.locator('[data-aiob-video-control-bar-button="true"]').click();
      const input = page.locator('[data-aiob-video-control-bar-note-input="true"]');
      await input.fill(`cold-${index}`);
      await expect(input).toHaveValue(`cold-${index}`);
      samples.push({
        index,
        browserAndWorkerReadyMs: session.browserAndWorkerReadyMs,
        firstNavigationToUsableControlMs: performance.now() - started,
        foreground: await foreground(page),
        browser: session.context.browser()?.version(),
        extensionId: session.extensionId
      });
    } finally {
      await session.close();
    }
  }
  await saveEvidence(testInfo, {
    boundaries: {
      browserAndWorkerReadyMs:
        'launchPersistentContext invocation to service-worker target observed; includes automation startup, not OS filesystem-cache-cold',
      firstNavigationToUsableControlMs:
        'new controlled tab/navigation through registered native content startup to clicking video control and successfully filling its input; options seed outside timer'
    },
    profiles:
      'ten fresh isolated profiles and ten separate browser/extension processes; OS cache remains warm',
    summaries: {
      browserAndWorker: distribution(samples.map((row) => row.browserAndWorkerReadyMs)),
      firstNavigationToUsableControl: distribution(
        samples.map((row) => row.firstNavigationToUsableControlMs)
      )
    },
    samples
  });
});

test('long article, one hundred real highlight gestures and full export', async ({
  browserName
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const session = await launchWorkloadBrowser(testInfo, 'reader');
  const sink = await configureSink(session.extensionPage, 'downloads', session.downloads);
  const html = longArticle('Performance Long Reader');
  const samples: Array<{
    highlightCount: number;
    readyMs: number;
    durableMs: number;
    annotationCommittedMs: number;
  }> = [];
  let pendingSample: {
    highlightCount: number;
    startedAtMs: number;
    readyMs?: number;
    highlightId?: string | null;
    durableMs?: number;
  } | null = null;
  try {
    const page = await openControlledPage(
      session.context,
      'https://example.com/performance-long-reader',
      html
    );
    const stopMemory = await sampleRendererMemory(page);
    const readHighlights = observeReaderDraft(session.extensionPage, page.url());
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
    });
    try {
      for (let index = 0; index < 100; index += 1) {
        const started = await dragParagraph(page, index);
        pendingSample = { highlightCount: index + 1, startedAtMs: started };
        if (index === 0)
          await page.locator('[data-stitch-surface="clipper"] [data-action-id="reader"]').click();
        const items = page.locator('[data-role="highlight-item"]');
        await expect(items).toHaveCount(index + 1);
        const input = items.last().locator('[data-highlight-input]');
        await expect(input).toBeEditable();
        const readyMs = performance.now() - started;
        pendingSample.readyMs = readyMs;
        const highlightId = await input.getAttribute('data-highlight-input');
        pendingSample.highlightId = highlightId;
        expect(highlightId).toBeTruthy();
        await expect
          .poll(
            async () => (await readHighlights()).some((highlight) => highlight.id === highlightId),
            { intervals: [20] }
          )
          .toBe(true);
        const durableMs = performance.now() - started;
        pendingSample.durableMs = durableMs;
        await input.fill(`Measured annotation ${index}`);
        await expect(input).toHaveValue(`Measured annotation ${index}`);
        const annotationStarted = performance.now();
        await input.press('Enter');
        await expect
          .poll(
            async () =>
              (await readHighlights()).find((highlight) => highlight.id === highlightId)?.comment,
            { intervals: [20] }
          )
          .toBe(`Measured annotation ${index}`);
        samples.push({
          highlightCount: index + 1,
          readyMs,
          durableMs,
          annotationCommittedMs: performance.now() - annotationStarted
        });
        pendingSample = null;
      }
      await foreground(page);
      const previous = await downloadIds(session.extensionPage);
      const started = performance.now();
      await page.locator('[data-role="export-btn"]').click();
      const files = await readCompletedDownloads(session.extensionPage, previous, 1);
      const markdown = files[0].bytes.toString('utf8');
      expect(markdown).toContain('Evidence paragraph 399');
      for (let index = 0; index < 100; index += 1)
        expect(markdown).toContain(`Measured annotation ${index}`);
      const exportCompletedMs = performance.now() - started;
      await expect(page.locator('[data-role="highlight-item"]')).toHaveCount(0);
      await saveEvidence(testInfo, {
        browser: session.context.browser()?.version(),
        extensionId: session.extensionId,
        workload: {
          htmlBytes: Buffer.byteLength(html),
          paragraphs: 400,
          highlights: 100,
          annotations: 100,
          exportMode: 'full',
          destination: 'native Downloads'
        },
        boundaries: {
          readyMs:
            'real pointer drag start to captured highlight with editable input; scroll before timer, first sample includes Reader action click; annotation edit/commit outside timer',
          durableMs:
            'same drag start to this highlight ID in production durable draft; existing latest-item retention limit remains active; next gesture waits for this boundary and annotation commit',
          annotationCommittedMs: 'Enter to matching annotation in production durable draft',
          exportCompletedMs:
            'export click to downloads state complete plus filesystem read and all 100 annotation / final source paragraph assertions'
        },
        summaries: {
          initialReader: distribution(samples.slice(0, 1).map((row) => row.readyMs)),
          subsequentHighlights: distribution(samples.slice(1).map((row) => row.readyMs)),
          durableHighlights: distribution(samples.map((row) => row.durableMs)),
          annotationCommit: distribution(samples.map((row) => row.annotationCommittedMs)),
          byHighlightCount: [0, 20, 40, 60, 80].map((offset) => ({
            from: offset + 1,
            to: offset + 20,
            ...distribution(samples.slice(offset, offset + 20).map((row) => row.readyMs))
          }))
        },
        samples,
        exportCompletedMs,
        files: files.map(({ bytes, ...file }) => ({
          ...file,
          bytes: bytes.length
        })),
        memory: await stopMemory()
      });
    } catch (error) {
      await page.screenshot({ path: testInfo.outputPath('reader-failure.png') });
      await saveEvidence(testInfo, {
        outcome: 'failed',
        error: error instanceof Error ? error.message : String(error),
        samples,
        pendingSample,
        failureObservedAtMs: performance.now(),
        errors,
        memory: await stopMemory(),
        drafts: await readerDraftRecords(session.extensionPage, page.url()),
        draftIndex: await session.extensionPage.evaluate(
          async () =>
            (await chrome.storage.local.get<Record<string, unknown>>('aiob.sessionDraft.index.v1'))[
              'aiob.sessionDraft.index.v1'
            ]
        ),
        ui: await page.locator('[data-role="highlight-item"]').evaluateAll((items) =>
          items.map((item) => ({
            id: item.getAttribute('data-highlight-id'),
            text: item.textContent
          }))
        )
      });
      throw error;
    }
  } finally {
    await sink.close();
    await session.close();
  }
});

test('twenty native 1080p screenshot captures, JPEG encoding and attachment export', async ({
  browserName
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const session = await launchWorkloadBrowser(testInfo, 'screenshots');
  const sink = await configureSink(session.extensionPage, 'downloads', session.downloads);
  try {
    const page = await openControlledPage(
      session.context,
      'https://www.bilibili.com/video/BV1perfScreenshots/',
      bilibiliFixtureHtml()
    );
    await installVideoFrames(page);
    const tabId = await findCurrentTabId(session.extensionPage, page.url());
    await installEncodingProbe(session.extensionPage, tabId);
    await startVideoMode(session.extensionPage, tabId);
    await expandVideoPanel(page);
    const stopMemory = await sampleRendererMemory(page);
    const samples = [];
    try {
      for (let index = 0; index < 20; index += 1) {
        await advanceVideoFrame(page, index);
        const started = performance.now();
        await page.locator('[data-role="add-btn"]').click();
        const item = page.locator('[data-role="capture-item"]').last();
        await expect(page.locator('[data-role="capture-item"]')).toHaveCount(index + 1);
        const input = item.locator('[data-capture-input]');
        await expect(input).toBeEditable();
        const interactiveMs = performance.now() - started;
        await expect
          .poll(
            async () =>
              (await readVideoScreenshotCacheIndexedDbSummary(session.extensionPage))
                .cacheEntryCount,
            { intervals: [20] }
          )
          .toBe(index + 1);
        const screenshotDurableMs = performance.now() - started;
        await input.fill(`Measured screenshot ${index}`);
        await input.press('Enter');
        const toggle = item.locator('[data-action-id="video:toggle-screenshot"]');
        await toggle.click();
        await expect(toggle).toHaveAttribute('data-screenshot-state', 'on');
        samples.push({ captureCount: index + 1, interactiveMs, screenshotDurableMs });
      }
      const previous = await downloadIds(session.extensionPage);
      await foreground(page);
      const started = performance.now();
      await page.locator('[data-role="finish-btn"]').click();
      const files = await readCompletedDownloads(session.extensionPage, previous, 21);
      const markdownFile = files.find((file) => file.filename.endsWith('.md'));
      if (!markdownFile) throw new Error('No exported Markdown');
      const markdown = markdownFile.bytes.toString('utf8');
      const images = files.filter((file) => file.filename.endsWith('.jpg'));
      expect(images).toHaveLength(20);
      expect(new Set(images.map((file) => file.sha256)).size).toBe(20);
      for (const file of images) {
        expect(file.bytes.subarray(0, 2).toString('hex')).toBe('ffd8');
        expect(file.bytes.subarray(-2).toString('hex')).toBe('ffd9');
        expect(markdown).toContain(encodeURIComponent(path.basename(file.filename)));
      }
      for (let index = 0; index < 20; index += 1)
        expect(markdown).toContain(`Measured screenshot ${index}`);
      const exportCompletedMs = performance.now() - started;
      const encodings = await readEncodingProbe(session.extensionPage, tabId);
      expect(encodings.length).toBeGreaterThanOrEqual(20);
      expect(encodings.every((entry) => entry.bytes > 0)).toBe(true);
      await saveEvidence(testInfo, {
        browser: session.context.browser()?.version(),
        extensionId: session.extensionId,
        workload: {
          sourceWidth: 1920,
          sourceHeight: 1080,
          source:
            'deterministic high-entropy canvas MediaStream; real browser drawImage/resize/toBlob, no network decoder',
          captures: 20,
          destination: 'native Downloads'
        },
        boundaries: {
          interactiveMs: 'Add button click to editable capture input',
          screenshotDurableMs:
            'same Add click to native screenshot cache entry observable through existing IDB reader',
          exportCompletedMs:
            'Finish click to all 21 native Downloads complete, files read, JPEG markers and Markdown references checked',
          encodingDurationMs:
            'pass-through native toBlob call to native callback in content isolated world; includes browser encoding scheduling'
        },
        summaries: {
          interactive: distribution(samples.map((row) => row.interactiveMs)),
          screenshotDurable: distribution(samples.map((row) => row.screenshotDurableMs)),
          individualEncoding: distribution(encodings.map((row) => row.durationMs))
        },
        samples,
        encodings,
        exportCompletedMs,
        files: files.map(({ bytes, ...file }) => ({
          ...file,
          bytes: bytes.length
        })),
        memory: await stopMemory()
      });
    } catch (error) {
      await stopMemory();
      throw error;
    }
  } finally {
    await sink.close();
    await session.close();
  }
});

test('four retained tabs, twenty sequential full-article native Downloads', async ({
  browserName
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const session = await launchWorkloadBrowser(testInfo, 'multi-tab');
  const sink = await configureSink(session.extensionPage, 'downloads', session.downloads);
  try {
    const pages = [];
    for (let index = 0; index < 4; index += 1)
      pages.push(
        await openControlledPage(
          session.context,
          `https://example.com/performance-tab-${index}`,
          longArticle(`Performance Tab ${index}`)
        )
      );
    const samples = [];
    for (let index = 0; index < 20; index += 1) {
      const tab = index % pages.length;
      const page = pages[tab];
      const marker = `Measured cross-tab save ${index}`;
      await page.locator('h1').evaluate((element, text) => {
        element.textContent = text;
        document.title = text;
      }, marker);
      const visible = await foreground(page);
      const tabId = await findCurrentTabId(session.extensionPage, page.url());
      const previous = await downloadIds(session.extensionPage);
      const started = performance.now();
      await session.extensionPage.evaluate(
        (id) => chrome.tabs.sendMessage(id, { action: 'clipFull' }),
        tabId
      );
      const files = await readCompletedDownloads(session.extensionPage, previous, 1);
      expect(files[0].bytes.toString('utf8')).toContain(marker);
      expect(files[0].bytes.toString('utf8')).toContain('Evidence paragraph 399');
      samples.push({
        index,
        tab,
        foreground: visible,
        completedMs: performance.now() - started,
        filename: files[0].filename,
        bytes: files[0].bytes.length,
        sha256: files[0].sha256
      });
    }
    expect(new Set(samples.map((row) => row.filename)).size).toBe(20);
    await saveEvidence(testInfo, {
      browser: session.context.browser()?.version(),
      extensionId: session.extensionId,
      workload: { tabs: 4, paragraphsPerTab: 400, saves: 20, destination: 'native Downloads' },
      boundary:
        'production clipFull command dispatch (same content command as toolbar/menu) to download complete plus filesystem read containing this save marker and final paragraph; focus/marker setup outside timer',
      summary: distribution(samples.map((row) => row.completedMs)),
      samples
    });
  } finally {
    await sink.close();
    await session.close();
  }
});
