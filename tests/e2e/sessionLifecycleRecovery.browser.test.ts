import { expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import {
  testWithExtension as test,
  createOptionsFixture,
  seedOptions,
  injectContentRuntime,
  openFixtureWithRuntime,
  openVideoPanelFromControlBar,
  expandVideoPanel,
  findCurrentTabId,
  youtubeFixtureHtml,
  YOUTUBE_URL
} from './utils/videoListenerScopeHarness';
import {
  durableNote,
  interceptRecoveryReply,
  openRecoveryReader,
  recoveryDrafts,
  releaseRecoveryReply
} from './utils/sessionRecoveryHarness';

test.beforeEach(async ({ extensionPage, context }, testInfo) => {
  const downloads = testInfo.outputPath('downloads');
  await mkdir(downloads, { recursive: true });
  const cdp = await context.newCDPSession(extensionPage);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await cdp.detach();
  await seedOptions(
    extensionPage,
    createOptionsFixture({ selectionTriggerMode: 'modifier', selectionModifierKeys: ['shift'] })
  );
  await extensionPage.evaluate(() => chrome.storage.sync.set({ language: 'en' }));
});

test('starts the configured selection runtime at DOMContentLoaded while an image is still loading', async ({
  page,
  context,
  extensionPage
}) => {
  const url = 'https://session-readiness.test/article';
  let releaseImage = () => {};
  const held = new Promise<void>((resolve) => {
    releaseImage = resolve;
  });
  await context.route('https://session-readiness.test/slow.png', async (route) => {
    await held;
    await route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=',
        'base64'
      )
    });
  });
  await context.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><body><p id="text">The article is readable before its last image completes.</p><img src="/slow.png"></body></html>'
    })
  );
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#text')).toBeVisible();
    const automatic = await page
      .waitForFunction(
        () => document.documentElement.dataset.aiobContentRuntime === 'true',
        undefined,
        { timeout: 1500 }
      )
      .then(
        () => true,
        () => false
      );
    const loadFinished = await page.evaluate(() => document.readyState === 'complete');
    const tabId = await findCurrentTabId(extensionPage, url);
    const start = Date.now();
    const injection = injectContentRuntime(extensionPage, tabId);
    const explicitBeforeLoad = await Promise.race([
      injection.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500))
    ]);
    console.log(
      JSON.stringify({
        automatic,
        loadFinished,
        explicitBeforeLoad,
        explicitMs: Date.now() - start
      })
    );
    const paragraph = await page.locator('#text').boundingBox();
    if (!paragraph) throw new Error('Article paragraph missing');
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.keyboard.down('Shift');
    await page.mouse.move(paragraph.x + 2, paragraph.y + paragraph.height / 2);
    await page.mouse.down();
    await page.mouse.move(paragraph.x + paragraph.width - 2, paragraph.y + paragraph.height / 2);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.locator('[data-action-id="reader"]').click();
    await expect(page.locator('[data-highlight-input]')).toHaveCount(1);
    expect(await page.evaluate(() => document.readyState)).not.toBe('complete');
    await page.locator('[data-action-id="reader:cancel"]').click();
    await expect(page.locator('#aiob-reader-panel')).toHaveCount(0);
    releaseImage();
    await injection;
    expect(loadFinished).toBe(false);
    expect(automatic, 'configured selection must not wait for window.load').toBe(true);
  } finally {
    releaseImage();
  }
});

test('stops future automatic injection when selection triggering is disabled', async ({
  page,
  extensionPage
}) => {
  await expect
    .poll(() =>
      extensionPage.evaluate(
        async () =>
          (
            await chrome.scripting.getRegisteredContentScripts({
              ids: ['zendio-selection-trigger']
            })
          ).length
      )
    )
    .toBe(1);
  await extensionPage.evaluate(
    (options) => chrome.storage.sync.set({ options }),
    createOptionsFixture({ selectionTriggerMode: 'disabled', selectionModifierKeys: [] })
  );
  await expect
    .poll(() =>
      extensionPage.evaluate(
        async () =>
          (
            await chrome.scripting.getRegisteredContentScripts({
              ids: ['zendio-selection-trigger']
            })
          ).length
      )
    )
    .toBe(0);
  const url = 'https://session-readiness.test/disabled';
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<p>Automatic selection is disabled here.</p>'
    })
  );
  await page.goto(url, { waitUntil: 'load' });
  expect(
    await page.evaluate(() => document.documentElement.dataset.aiobContentRuntime)
  ).toBeUndefined();
});

test('real extension reload freezes the old panel and restores its note after page reload', async ({
  page,
  context,
  extensionPage
}) => {
  const url = 'https://session-recovery.test/reload';
  const tabId = await openRecoveryReader(page, extensionPage, url);
  await durableNote(page, extensionPage, 'Keep my original note across extension reload');
  const before = (await recoveryDrafts(extensionPage, url))[0];
  if (!before?.record.lease) throw new Error('Leased Reader draft missing');
  expect(before.record.lease?.leaseId).toMatch(/^doc1:/);
  expect(before.record.lease.leaseExpiresAt).toBeGreaterThan(Date.now());
  const extensionUrl = extensionPage.url();
  const control = await context.newPage();
  await control.goto('chrome://extensions');
  await control.getByRole('button', { name: 'Developer mode', exact: true }).click();
  await extensionPage
    .evaluate(() => {
      chrome.runtime.reload();
    })
    .catch(() => undefined);
  await expect
    .poll(async () => {
      try {
        await control.goto(extensionUrl);
        return await control.evaluate(() => (chrome.runtime.id ? 'ready' : 'runtime-id-missing'));
      } catch (error) {
        return String(error);
      }
    })
    .toBe('ready');
  await page.locator('[data-highlight-input]').first().click();
  await expect(page.locator('#aiob-reader-panel')).toHaveAttribute(
    'data-session-recovery',
    'reload'
  );
  await expect(page.locator('[data-session-status]')).toContainText(/reload this page/i);
  await expect(page.locator('[data-action-id="reader:finish"]')).toBeDisabled();
  await expect(page.locator('[data-highlight-input]').first()).toHaveValue(
    'Keep my original note across extension reload'
  );
  await expect(page.locator('[data-highlight-input]').first()).toHaveJSProperty('readOnly', true);
  await injectContentRuntime(control, tabId);
  await expect(page.locator('#aiob-reader-panel')).toHaveCount(1);
  expect((await recoveryDrafts(control, url))[0]?.record.revision).toBe(before.record.revision);
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    page.locator('[data-action-id="reader:cancel"]').click()
  ]);
  await injectContentRuntime(control, tabId);
  await expect(page.locator('[data-highlight-input]').first()).toHaveValue(
    'Keep my original note across extension reload',
    { timeout: 15_000 }
  );
  await expect(page.locator('#aiob-reader-panel')).toHaveCount(1);
  const recovered = (await recoveryDrafts(control, url))[0];
  if (!recovered) throw new Error('Recovered Reader draft missing');
  expect(recovered.key).toBe(before.key);
  expect(recovered.record.lease?.leaseId).not.toBe(before.record.lease?.leaseId);
  await durableNote(page, control, 'Editing works after reconnect');
  await page.locator('[data-action-id="reader:cancel"]').click();
  await expect(page.locator('#aiob-reader-panel')).toHaveCount(0);
  await expect.poll(async () => (await recoveryDrafts(control, url)).length).toBe(0);
  await control.close();
});

test('actual Finish retries a lost committed removal reply without downloading twice', async ({
  page,
  extensionPage
}) => {
  const url = 'https://session-recovery.test/terminal';
  const tabId = await openRecoveryReader(page, extensionPage, url);
  await durableNote(page, extensionPage, 'Export this note exactly once');
  const destination = page.locator('#aiob-reader-panel .export-destination-row');
  await destination.locator('summary').click();
  await destination.locator('[data-destination-id="downloads"]').click();
  await interceptRecoveryReply(extensionPage, tabId, 'removeExact', 'lose');
  await page.locator('[data-action-id="reader:finish"]').click();
  await expect
    .poll(async () =>
      extensionPage.evaluate(async () => (await chrome.downloads.search({}))[0]?.state)
    )
    .toBe('complete');
  const artifact = await extensionPage.evaluate(
    async () => (await chrome.downloads.search({}))[0]?.filename
  );
  if (!artifact) throw new Error('Completed download missing');
  expect(await readFile(artifact, 'utf8')).toContain('Export this note exactly once');
  await expect(page.locator('#aiob-reader-panel')).toHaveAttribute(
    'data-session-recovery',
    'retry'
  );
  await expect.poll(async () => (await recoveryDrafts(extensionPage, url)).length).toBe(0);
  if (await page.locator('#aiob-support-prompt').count()) {
    await page.locator('#aiob-support-prompt').click({ position: { x: 3, y: 3 } });
    await expect(page.locator('#aiob-support-prompt')).toHaveCount(0);
  }
  await page.locator('[data-action-id="reader:finish"]').click();
  await expect(page.locator('#aiob-reader-panel')).toHaveCount(0);
  const downloads = await extensionPage.evaluate(() => chrome.downloads.search({}));
  expect(downloads).toHaveLength(1);
});

test('a delayed real renewal reply cannot roll back a note typed while it is in flight', async ({
  page,
  extensionPage
}) => {
  const url = 'https://session-recovery.test/renewal';
  const tabId = await openRecoveryReader(page, extensionPage, url);
  await durableNote(page, extensionPage, 'Before delayed renewal');
  await interceptRecoveryReply(extensionPage, tabId, 'renewLease', 'delay');
  await expect(page.locator('html')).toHaveAttribute('data-recovery-fault', 'renewLease', {
    timeout: 15_000
  });
  await page.locator('[data-highlight-input]').first().fill('User edit during delayed renewal');
  await releaseRecoveryReply(extensionPage, tabId);
  await expect
    .poll(async () => JSON.stringify(await recoveryDrafts(extensionPage, url)))
    .toContain('User edit during delayed renewal');
  await expect(page.locator('[data-highlight-input]').first()).toHaveValue(
    'User edit during delayed renewal'
  );
  await page.locator('[data-action-id="reader:cancel"]').click();
  await expect(page.locator('#aiob-reader-panel')).toHaveCount(0);
});

test('Video Finish resumes terminal cleanup without a second real export', async ({
  context,
  extensionPage
}) => {
  const url = `${YOUTUBE_URL}&recovery=terminal`;
  const { page, tabId } = await openFixtureWithRuntime(
    context,
    extensionPage,
    url,
    youtubeFixtureHtml()
  );
  await openVideoPanelFromControlBar(page, 'Video note survives terminal retry', {
    captureScreenshotEnabled: false
  });
  await expandVideoPanel(page);
  await expect
    .poll(async () => JSON.stringify(await recoveryDrafts(extensionPage, url)))
    .toContain('Video note survives terminal retry');
  const destination = page.locator('#aiob-video-panel .export-destination-row');
  await destination.locator('summary').click();
  await destination.locator('[data-destination-id="downloads"]').click();
  await interceptRecoveryReply(extensionPage, tabId, 'removeExact', 'lose');
  await page.locator('[data-action-id="video:finish"]').click();
  await expect(page.locator('#aiob-video-panel')).toHaveAttribute('data-session-recovery', 'retry');
  await expect.poll(async () => (await recoveryDrafts(extensionPage, url)).length).toBe(0);
  if (await page.locator('#aiob-support-prompt').count()) {
    await page.locator('#aiob-support-prompt').click({ position: { x: 3, y: 3 } });
  }
  await page.locator('[data-action-id="video:finish"]').click();
  await expect(page.locator('#aiob-video-panel')).toHaveCount(0);
  await expect
    .poll(async () =>
      extensionPage.evaluate(async () => (await chrome.downloads.search({}))[0]?.state)
    )
    .toBe('complete');
  const downloads = await extensionPage.evaluate(() => chrome.downloads.search({}));
  expect(downloads).toHaveLength(1);
  const exportedFile = downloads[0]?.filename;
  if (!exportedFile) throw new Error('Video export missing');
  expect(await readFile(exportedFile, 'utf8')).toContain('Video note survives terminal retry');
});
