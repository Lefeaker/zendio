import type { VideoSessionDraftPayloadShape } from '../../src/content/video/sessionDrafts';
import { readSessionExportAttempt } from '../../src/shared/sessionDrafts/exportAttempt';
import { LEARNING_PROGRESS_KEY } from '../../src/shared/learningProgress';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
  installVideoScreenshotProbe,
  readVideoScreenshotProbe,
  releasePendingVideoScreenshotBlobs,
  submitControlBarNote
} from './utils/videoListenerScopeHarness';
import {
  durableNote,
  interceptRecoveryReply,
  openRecoveryReader,
  recoveryDrafts,
  releaseRecoveryReply
} from './utils/sessionRecoveryHarness';

test.beforeEach(async ({ extensionPage, context }) => {
  const cdp = await context.newCDPSession(extensionPage);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' });
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

test('shows the selected text before a delayed draft reply and removes all highlights on cancel', async ({
  page,
  extensionPage
}) => {
  const url = 'https://session-readiness.test/delayed-reader-draft';
  const text = 'This selected paragraph must appear before draft recovery responds.';
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<html><head><title>Reader startup</title></head><body><p id="selection">${text}</p></body></html>`
    })
  );
  await page.goto(url);
  const tabId = await findCurrentTabId(extensionPage, url);
  await injectContentRuntime(extensionPage, tabId);
  await page.evaluate(() => {
    const paragraph = document.getElementById('selection');
    if (!paragraph) throw new Error('Selection fixture missing');
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await extensionPage.evaluate(async (id) => {
    await chrome.tabs.sendMessage(id, { action: 'clipSelection' });
  }, tabId);
  await expect(page.locator('[data-action-id="reader"]')).toBeVisible();
  await interceptRecoveryReply(extensionPage, tabId, 'selectAndClaim', 'delay');
  try {
    await page.locator('[data-action-id="reader"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-recovery-fault', 'selectAndClaim');
    await expect(page.locator('[data-highlight-input]')).toHaveCount(1);
    await expect(page.locator('mark.aiob-reader-highlight')).toHaveText(text);
    await expect(page.locator('.session-counter')).toHaveText('Collected 1 highlights');
    await expect(page.locator('[data-highlight-input]')).toHaveAttribute('readonly', '');
    await page.locator('[data-action-id="reader:cancel"]').click();
    await expect(page.locator('#aiob-reader-panel')).toHaveAttribute(
      'data-session-recovery',
      'busy'
    );
    await releaseRecoveryReply(extensionPage, tabId);
    await expect(page.locator('#aiob-reader-panel')).toHaveCount(0);
    await expect(page.locator('mark.aiob-reader-highlight')).toHaveCount(0);
    await expect(page.locator('#selection')).toHaveText(text);
    expect(await recoveryDrafts(extensionPage, url)).toHaveLength(0);
    await page.reload();
    await injectContentRuntime(extensionPage, tabId);
    await expect(page.locator('#aiob-reader-panel')).toHaveCount(0);
    await expect(page.locator('mark.aiob-reader-highlight')).toHaveCount(0);
  } finally {
    await releaseRecoveryReply(extensionPage, tabId);
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
}, testInfo) => {
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
  await expect(page.locator('[data-action-id="reader:finish"]')).toHaveCSS('opacity', '0.5');
  await expect(page.locator('[data-session-status]')).toHaveCSS('white-space', 'normal');
  expect(
    await page
      .locator('[data-session-status]')
      .evaluate(
        (element) =>
          element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight
      )
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('recovery-visible.png') });
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

test('completed Downloads returns the Reader ACK while native notification never replies', async ({
  page,
  context,
  extensionPage
}) => {
  const url = 'https://session-recovery.test/hanging-notification';
  await openRecoveryReader(page, extensionPage, url);
  await durableNote(page, extensionPage, 'The notification cannot hold this completed file');
  const destination = page.locator('#aiob-reader-panel .export-destination-row');
  await destination.locator('summary').click();
  await destination.locator('[data-destination-id="downloads"]').click();
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('Extension background worker missing');
  await worker.evaluate(() => {
    Object.defineProperty(chrome.notifications, 'create', {
      configurable: true,
      value: () => {
        void chrome.storage.local.set({ testNotificationNeverReplied: true });
      }
    });
  });
  await page.locator('[data-action-id="reader:finish"]').click();
  await expect
    .poll(() =>
      extensionPage.evaluate(
        async () =>
          (await chrome.storage.local.get('testNotificationNeverReplied'))
            .testNotificationNeverReplied
      )
    )
    .toBe(true);
  await expect(page.locator('#aiob-reader-panel')).toHaveCount(0);
  const downloads = await extensionPage.evaluate(() => chrome.downloads.search({}));
  expect(downloads).toHaveLength(1);
  expect(downloads[0]?.state).toBe('complete');
  const file = downloads[0]?.filename;
  if (!file) throw new Error('Completed notification-independent output missing');
  expect(await readFile(file, 'utf8')).toContain(
    'The notification cannot hold this completed file'
  );
  await expect.poll(async () => (await recoveryDrafts(extensionPage, url)).length).toBe(0);
});

test('a lost Reader save ACK survives reload and never rewrites on ordinary Finish', async ({
  page,
  extensionPage
}) => {
  const url = 'https://session-recovery.test/unknown-export';
  const tabId = await openRecoveryReader(page, extensionPage, url);
  await durableNote(page, extensionPage, 'Original exported note');
  const destination = page.locator('#aiob-reader-panel .export-destination-row');
  await destination.locator('summary').click();
  await destination.locator('[data-destination-id="downloads"]').click();
  await interceptRecoveryReply(extensionPage, tabId, 'CLIP_RESULT', 'lose');
  await page.locator('[data-action-id="reader:finish"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-recovery-fault', 'CLIP_RESULT');
  await expect(page.locator('[data-session-export-notice="reader"]')).toContainText('unknown');
  const downloads = await extensionPage.evaluate(() => chrome.downloads.search({}));
  expect(downloads).toHaveLength(1);
  expect(downloads[0]?.state).toBe('complete');
  const file = downloads[0]?.filename;
  if (!file) throw new Error('Completed Reader output missing');
  expect(await readFile(file, 'utf8')).toContain('Original exported note');
  expect(JSON.stringify(await recoveryDrafts(extensionPage, url))).toContain('"outcome":"unknown"');
  const readerPayload = (await recoveryDrafts(extensionPage, url))[0]?.record.payload;
  const readerAttempt =
    readerPayload && 'exportAttempt' in readerPayload
      ? readSessionExportAttempt(readerPayload.exportAttempt)
      : undefined;
  if (!readerAttempt) throw new Error('Durable Reader attempt missing');
  await expect
    .poll(() =>
      extensionPage.evaluate(
        async (key) => JSON.stringify((await chrome.storage.local.get(key))[key]),
        LEARNING_PROGRESS_KEY
      )
    )
    .toContain(readerAttempt.operationId);
  await page.reload();
  await injectContentRuntime(extensionPage, tabId);
  await expect(page.locator('[data-session-export-notice="reader"]')).toContainText('unknown', {
    timeout: 15_000
  });
  await page.locator('[data-action-id="reader:finish"]').click();
  expect(await extensionPage.evaluate(() => chrome.downloads.search({}))).toHaveLength(1);
  await durableNote(page, extensionPage, 'A newer edit must survive confirming the old file');
  await page.locator('[data-export-recovery="confirm-saved"]').click();
  await expect(page.locator('[data-highlight-input]').first()).toHaveValue(
    'A newer edit must survive confirming the old file'
  );
  await expect(page.locator('[data-session-export-notice="reader"]')).toContainText('changed');
  expect(await extensionPage.evaluate(() => chrome.downloads.search({}))).toHaveLength(1);
  await page.locator('[data-action-id="reader:finish"]').click();
  await expect(page.locator('#aiob-reader-panel')).toHaveCount(0);
  const finalDownloads = await extensionPage.evaluate(() => chrome.downloads.search({}));
  expect(finalDownloads).toHaveLength(2);
  const newer = finalDownloads.find((item) => item.id !== downloads[0]?.id);
  if (!newer?.filename) throw new Error('New Reader version missing');
  expect(await readFile(newer.filename, 'utf8')).toContain(
    'A newer edit must survive confirming the old file'
  );
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

test('Video recovers a lost save ACK without a second file after explicit confirmation', async ({
  context,
  extensionPage
}) => {
  const url = `${YOUTUBE_URL}&recovery=unknown-export`;
  const { page, tabId } = await openFixtureWithRuntime(
    context,
    extensionPage,
    url,
    youtubeFixtureHtml()
  );
  await openVideoPanelFromControlBar(page, 'Video output exists before its reply is lost', {
    captureScreenshotEnabled: false
  });
  await expandVideoPanel(page);
  const destination = page.locator('#aiob-video-panel .export-destination-row');
  await destination.locator('summary').click();
  await destination.locator('[data-destination-id="downloads"]').click();
  await interceptRecoveryReply(extensionPage, tabId, 'videoClip', 'lose');
  await page.locator('[data-action-id="video:finish"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-recovery-fault', 'videoClip');
  await expect(page.locator('[data-session-export-notice="video"]')).toContainText('unknown');
  const downloads = await extensionPage.evaluate(() => chrome.downloads.search({}));
  expect(downloads).toHaveLength(1);
  const file = downloads[0]?.filename;
  if (!file) throw new Error('Video output missing');
  expect(await readFile(file, 'utf8')).toContain('Video output exists before its reply is lost');
  const videoPayload = (await recoveryDrafts(extensionPage, url))[0]?.record.payload;
  const videoAttempt =
    videoPayload && 'exportAttempt' in videoPayload
      ? readSessionExportAttempt(videoPayload.exportAttempt)
      : undefined;
  if (!videoAttempt) throw new Error('Durable Video attempt missing');
  await expect
    .poll(() =>
      extensionPage.evaluate(
        async (key) => JSON.stringify((await chrome.storage.local.get(key))[key]),
        LEARNING_PROGRESS_KEY
      )
    )
    .toContain(videoAttempt.operationId);
  if (await page.locator('#aiob-support-prompt').count()) {
    await page.locator('#aiob-support-prompt').click({ position: { x: 3, y: 3 } });
    await expect(page.locator('#aiob-support-prompt')).toHaveCount(0);
  }
  await page.reload();
  await injectContentRuntime(extensionPage, tabId);
  await expect(page.locator('[data-session-export-notice="video"]')).toContainText('unknown', {
    timeout: 15_000
  });
  await expandVideoPanel(page);
  await page.locator('[data-action-id="video:finish"]').click();
  expect(await extensionPage.evaluate(() => chrome.downloads.search({}))).toHaveLength(1);
  await page.locator('[data-export-recovery="confirm-saved"]').click();
  await expect(page.locator('#aiob-video-panel')).toHaveCount(0);
  expect(await extensionPage.evaluate(() => chrome.downloads.search({}))).toHaveLength(1);
  await expect.poll(async () => (await recoveryDrafts(extensionPage, url)).length).toBe(0);
});

for (const [language, label] of [
  ['de', 'Geprüft, erneut speichern'],
  ['zh-CN', '已核对，重新保存']
] as const) {
  test(`unknown export recovery controls remain usable in ${language}`, async ({
    page,
    extensionPage
  }, testInfo) => {
    await extensionPage.evaluate(
      (locale) => chrome.storage.sync.set({ language: locale }),
      language
    );
    const url = `https://session-recovery.test/unknown-layout-${language}`;
    const tabId = await openRecoveryReader(page, extensionPage, url);
    const destination = page.locator('#aiob-reader-panel .export-destination-row');
    await destination.locator('summary').click();
    await destination.locator('[data-destination-id="downloads"]').click();
    await interceptRecoveryReply(extensionPage, tabId, 'CLIP_RESULT', 'lose');
    await page.locator('[data-action-id="reader:finish"]').click();
    const notice = page.locator('[data-session-export-notice="reader"]');
    await expect(notice.locator('[data-export-recovery="save-again"]')).toHaveText(label);
    if (await page.locator('#aiob-support-prompt').count()) {
      await page.locator('#aiob-support-prompt').click({ position: { x: 3, y: 3 } });
      await expect(page.locator('#aiob-support-prompt')).toHaveCount(0);
    }
    expect(
      await notice.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          element.scrollWidth <= element.clientWidth &&
          [...element.querySelectorAll('button')].every((button) => {
            const rect = button.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right && rect.height >= 28;
          })
        );
      })
    ).toBe(true);
    await testInfo.attach('unknown-recovery-layout', {
      body: await page.screenshot(),
      contentType: 'image/png'
    });
    await notice.locator('[data-export-recovery="confirm-saved"]').click();
    await expect(page.locator('#aiob-reader-panel')).toHaveCount(0);
    expect(await extensionPage.evaluate(() => chrome.downloads.search({}))).toHaveLength(1);
  });
}

async function setAttachmentRecoveryClock(
  context: BrowserContext,
  extensionPage: Page,
  tabId: number,
  instant: number
) {
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('Background worker missing');
  await worker.evaluate((now) => {
    globalThis.Date = new Proxy(Date, {
      construct(target, args, newTarget) {
        return Reflect.construct(target, args.length ? args : [now], newTarget) as Date;
      }
    });
    Date.now = () => now;
  }, instant);
  await extensionPage.evaluate(
    async ({ id, now }) => {
      await chrome.scripting.executeScript({
        target: { tabId: id },
        func: (value) => {
          Date.now = () => value;
        },
        args: [now]
      });
    },
    { id: tabId, now: instant }
  );
}

async function openTwoAttachmentRecoveryVideo(
  context: BrowserContext,
  extensionPage: Page,
  faultAt: number,
  clock?: number
) {
  const url = `${YOUTUBE_URL}&recovery=two-attachments`;
  const { page, tabId } = await openFixtureWithRuntime(
    context,
    extensionPage,
    url,
    youtubeFixtureHtml()
  );
  await installVideoScreenshotProbe(extensionPage, tabId);
  if (clock !== undefined) await setAttachmentRecoveryClock(context, extensionPage, tabId, clock);
  await openVideoPanelFromControlBar(page, 'First attachment note', {
    captureScreenshotEnabled: true
  });
  await expect
    .poll(async () => (await readVideoScreenshotProbe(extensionPage, tabId)).pendingBlobCallbacks)
    .toBe(1);
  await releasePendingVideoScreenshotBlobs(extensionPage, tabId, 'success');
  await expandVideoPanel(page);
  await expect(page.locator('[data-action-id="video:toggle-screenshot"]').first()).toHaveAttribute(
    'data-screenshot-state',
    'on'
  );
  await extensionPage.evaluate(async (id) => {
    await chrome.scripting.executeScript({
      target: { tabId: id },
      func: () => {
        const video = document.querySelector('video');
        if (video) video.currentTime = 84;
      }
    });
  }, tabId);
  await submitControlBarNote(page, 'Second attachment note', { captureScreenshotEnabled: true });
  await expect
    .poll(async () => (await readVideoScreenshotProbe(extensionPage, tabId)).pendingBlobCallbacks)
    .toBe(1);
  await releasePendingVideoScreenshotBlobs(extensionPage, tabId, 'success');
  await expandVideoPanel(page);
  await expect(page.locator('[data-role="capture-item"]')).toHaveCount(2);
  await expect(page.locator('[data-action-id="video:toggle-screenshot"]').last()).toHaveAttribute(
    'data-screenshot-state',
    'on'
  );
  const destination = page.locator('#aiob-video-panel .export-destination-row');
  await destination.locator('summary').click();
  await destination.locator('[data-destination-id="downloads"]').click();
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('Background worker missing');
  await worker.evaluate((failAt) => {
    const original = chrome.downloads.download.bind(chrome.downloads);
    const attempts: string[] = [];
    Object.defineProperty(chrome.downloads, 'download', {
      configurable: true,
      value: async (options: chrome.downloads.DownloadOptions) => {
        attempts.push(options.filename ?? '');
        await chrome.storage.local.set({ testAttachmentWriteAttempts: attempts });
        if (attempts.length === failAt) {
          await chrome.storage.local.set({ testAttachmentFaultFired: true });
          throw new Error('Fixture lost an attachment/note write reply');
        }
        return original(options);
      }
    });
  }, faultAt);
  return { page, tabId, url };
}

async function attachmentWriteAttempts(extensionPage: Page): Promise<string[]> {
  return extensionPage.evaluate(async () => {
    const value: unknown = (await chrome.storage.local.get('testAttachmentWriteAttempts'))
      .testAttachmentWriteAttempts;
    if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string'))
      throw new Error('Write attempt instrumentation missing');
    return value;
  });
}

for (const scenario of [
  'second-attachment',
  'note',
  'edit',
  'destination-plan',
  'missing-file',
  'reload',
  'reopen',
  'reload-legacy',
  'reload-missing-cache',
  'reload-destination-plan',
  'clock-boundary',
  'lost-continuation-ack'
] as const) {
  test(`attachment recovery: ${scenario} preserves real files and requires explicit continuation`, async ({
    context,
    extensionPage
  }, testInfo) => {
    const language = scenario === 'second-attachment' ? 'de' : scenario === 'note' ? 'zh-CN' : 'en';
    await extensionPage.evaluate(
      (locale) => chrome.storage.sync.set({ language: locale }),
      language
    );
    const faultAt = scenario === 'note' ? 3 : 2;
    const exportStartedAt = new Date(2026, 9, 15, 23, 59, 59).getTime();
    const originalPage = await openTwoAttachmentRecoveryVideo(
      context,
      extensionPage,
      faultAt,
      scenario === 'clock-boundary' ? exportStartedAt : undefined
    );
    let { page, tabId } = originalPage;
    const { url } = originalPage;
    if (scenario === 'clock-boundary') {
      await extensionPage.evaluate((options) => chrome.storage.sync.set({ options }), {
        ...createOptionsFixture(),
        templates: { video: 'Video/time-boundary_{yyyy}-{mm}-{dd}_{HHmmss}_{slug}.md' }
      });
      await expect(page.locator('#aiob-video-panel .export-destination-row')).toContainText(
        'time-boundary_'
      );
    }
    await page.locator('[data-action-id="video:finish"]').click();
    let notice = page.locator('[data-session-export-notice="video"]');
    try {
      await expect(notice.locator('[data-attachment-progress]')).toContainText(
        scenario === 'note' ? '2/2' : '1/2'
      );
    } catch (error) {
      console.log(
        'attachment-recovery-initial-diagnostic',
        JSON.stringify({
          scenario,
          native: await extensionPage.evaluate(async () => ({
            fault: await chrome.storage.local.get([
              'testAttachmentWriteAttempts',
              'testAttachmentFaultFired'
            ]),
            downloads: (await chrome.downloads.search({})).map(
              ({ id, state, filename, exists }) => ({ id, state, filename, exists })
            )
          })),
          drafts: await recoveryDrafts(extensionPage, url)
        })
      );
      throw error;
    }
    expect(
      await extensionPage.evaluate(
        async () =>
          (await chrome.storage.local.get('testAttachmentFaultFired')).testAttachmentFaultFired
      )
    ).toBe(true);
    if (language !== 'en') {
      await expect(notice.locator('[data-export-recovery="continue"]')).toHaveText(
        language === 'de' ? 'Geprüft, restliches Speichern fortsetzen' : '已核对，继续剩余保存'
      );
      expect(
        await notice.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            element.scrollWidth <= element.clientWidth &&
            [...element.querySelectorAll('button')].every((button) => {
              const rect = button.getBoundingClientRect();
              return rect.left >= bounds.left && rect.right <= bounds.right && rect.height >= 28;
            })
          );
        })
      ).toBe(true);
      await testInfo.attach(`attachment-recovery-${language}`, {
        body: await page.screenshot(),
        contentType: 'image/png'
      });
    }
    const [originalDraft] = await recoveryDrafts(extensionPage, url);
    if (!originalDraft) throw new Error('Original draft missing');
    const payload = await extensionPage.evaluate(async (key) => {
      const records =
        await chrome.storage.local.get<Record<string, { payload: VideoSessionDraftPayloadShape }>>(
          key
        );
      return records[key]?.payload;
    }, originalDraft.key);
    const attempt =
      payload && 'exportAttempt' in payload
        ? readSessionExportAttempt(payload.exportAttempt)
        : undefined;
    if (!attempt?.attachmentProgress) throw new Error('Durable attachment progress missing');
    expect(attempt.attachmentProgress.confirmed).toHaveLength(faultAt - 1);
    const firstDownloads = await extensionPage.evaluate(() => chrome.downloads.search({}));
    expect(firstDownloads).toHaveLength(faultAt - 1);
    const firstFile = firstDownloads[0];
    if (!firstFile) throw new Error('First confirmed file missing');
    expect(await readFile(firstFile.filename)).toEqual(Buffer.from([255, 216, 255, 217]));
    if (await page.locator('#aiob-support-prompt').count())
      await page.locator('#aiob-support-prompt').click({ position: { x: 3, y: 3 } });
    await page.locator('[data-action-id="video:finish"]').click();
    expect(await attachmentWriteAttempts(extensionPage)).toHaveLength(faultAt);

    if (scenario === 'clock-boundary') {
      expect(attempt.startedAt).toBe(exportStartedAt);
      expect(firstFile.filename).toContain('2026-10-15_235959_');
      await setAttachmentRecoveryClock(context, extensionPage, tabId, exportStartedAt + 2000);
    }

    if (scenario === 'edit') {
      await page.locator('[data-capture-input]').first().fill('Newer content must remain');
      await expect
        .poll(async () => JSON.stringify(await recoveryDrafts(extensionPage, url)))
        .toContain('Newer content must remain');
    } else if (scenario === 'destination-plan') {
      await extensionPage.evaluate((options) => chrome.storage.sync.set({ options }), {
        ...createOptionsFixture(),
        templates: { video: 'Changed/changed.md' }
      });
      await expect(page.locator('#aiob-video-panel .export-destination-row')).toContainText(
        'changed.md'
      );
    } else if (scenario === 'missing-file') {
      await extensionPage.evaluate((id) => chrome.downloads.removeFile(id), firstFile.id);
      await expect
        .poll(() =>
          extensionPage.evaluate(
            async (id) => (await chrome.downloads.search({ id }))[0]?.exists,
            firstFile.id
          )
        )
        .toBe(false);
    } else if (scenario.startsWith('reload') || scenario === 'reopen') {
      if (scenario === 'reload-legacy') {
        const [draft] = await recoveryDrafts(extensionPage, url);
        if (!draft) throw new Error('Original draft missing');
        await extensionPage.evaluate(async (key) => {
          const records =
            await chrome.storage.local.get<
              Record<string, { payload: VideoSessionDraftPayloadShape }>
            >(key);
          const record = records[key];
          if (!record) throw new Error('Original draft missing');
          if (record.payload.exportAttempt) delete record.payload.exportAttempt.rebuild;
          await chrome.storage.local.set({ [key]: record });
        }, draft.key);
      } else if (scenario === 'reload-missing-cache') {
        if (!payload) throw new Error('Original video payload missing');
        const refs = payload.captures.flatMap((capture) =>
          capture.kind === 'timestamp' && capture.screenshotRef ? [capture.screenshotRef] : []
        );
        expect(refs).toHaveLength(2);
        await extensionPage.evaluate(async (refs) => {
          const request = { type: 'AIIOB_VIDEO_SCREENSHOT_CACHE', operation: 'removeMany', refs };
          const result = await chrome.runtime.sendMessage<typeof request, { success: boolean }>(
            request
          );
          if (!result.success) throw new Error('Cache fixture removal failed');
        }, refs);
      } else if (scenario === 'reload-destination-plan') {
        await extensionPage.evaluate((options) => chrome.storage.sync.set({ options }), {
          ...createOptionsFixture(),
          templates: { video: 'Changed/changed.md' }
        });
      }
      if (scenario === 'reopen') {
        await page.close();
        page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        tabId = await findCurrentTabId(extensionPage, url);
        await injectContentRuntime(extensionPage, tabId);
        notice = page.locator('[data-session-export-notice="video"]');
      } else {
        await page.reload();
        await injectContentRuntime(extensionPage, tabId);
      }
      await expect(notice.locator('[data-attachment-progress]')).toContainText('1/2', {
        timeout: 15_000
      });
      await expandVideoPanel(page);
      await page.locator('[data-action-id="video:finish"]').click();
      expect(await attachmentWriteAttempts(extensionPage)).toHaveLength(2);
      expect(await extensionPage.evaluate(() => chrome.downloads.search({}))).toHaveLength(1);
      if (scenario === 'reload-legacy' || scenario === 'reload-missing-cache') {
        await expect(notice.locator('[data-export-recovery="continue"]')).toHaveCount(0);
        await expect(notice).toContainText('unavailable or changed');
        return;
      }
      await expect(notice.locator('[data-export-recovery="continue"]')).toHaveCount(1);
    } else if (scenario === 'lost-continuation-ack')
      await interceptRecoveryReply(extensionPage, tabId, 'videoClip', 'lose');

    await notice.locator('[data-export-recovery="continue"]').click();
    if (
      scenario === 'edit' ||
      scenario === 'destination-plan' ||
      scenario === 'reload-destination-plan' ||
      scenario === 'missing-file'
    ) {
      await expect(notice).toContainText('unavailable or changed');
      expect(await attachmentWriteAttempts(extensionPage)).toHaveLength(2);
      expect(await extensionPage.evaluate(() => chrome.downloads.search({}))).toHaveLength(1);
      if (scenario === 'edit')
        await expect(page.locator('[data-capture-input]').first()).toHaveValue(
          'Newer content must remain'
        );
      else if (scenario === 'missing-file')
        await expect(readFile(firstFile.filename)).rejects.toThrow();
      else expect(await readFile(firstFile.filename)).toEqual(Buffer.from([255, 216, 255, 217]));
      console.log(
        'attachment-recovery-evidence',
        JSON.stringify({ scenario, writes: 2, confirmedMetadataRetained: true })
      );
      return;
    }
    if (scenario === 'lost-continuation-ack') {
      await expect(notice).toContainText('unknown');
      await expect(notice.locator('[data-export-recovery="continue"]')).toHaveCount(0);
      if (await page.locator('#aiob-support-prompt').count())
        await page.locator('#aiob-support-prompt').click({ position: { x: 3, y: 3 } });
      await page.locator('[data-action-id="video:finish"]').click();
      expect(await attachmentWriteAttempts(extensionPage)).toHaveLength(4);
      await page.reload();
      await injectContentRuntime(extensionPage, tabId);
      await expect(notice).toContainText('unknown', { timeout: 15_000 });
      await expandVideoPanel(page);
      await page.locator('[data-action-id="video:finish"]').click();
      expect(await attachmentWriteAttempts(extensionPage)).toHaveLength(4);
      await expect(notice.locator('[data-export-recovery="continue"]')).toHaveCount(0);
      await notice.locator('[data-export-recovery="confirm-saved"]').click();
      await expect(page.locator('#aiob-video-panel')).toHaveCount(0);
      expect(await attachmentWriteAttempts(extensionPage)).toHaveLength(4);
    } else await expect(page.locator('#aiob-video-panel')).toHaveCount(0);
    const files = await extensionPage.evaluate(() => chrome.downloads.search({}));
    expect(files).toHaveLength(3);
    const note = files.find((file) => file.filename.endsWith('.md'));
    if (!note) throw new Error('Final Markdown missing');
    if (scenario === 'clock-boundary') {
      expect(note.filename).toContain('2026-10-15_235959_');
      expect(note.filename).not.toContain('2026-10-16_000001_');
    }
    const markdown = await readFile(note.filename, 'utf8');
    const references = [...markdown.matchAll(/!\[Screenshot\]\(([^)]+)\)/gu)].map(
      (match) => match[1]
    );
    expect(references).toHaveLength(2);
    for (const reference of references)
      expect(
        await readFile(path.join(path.dirname(note.filename), decodeURIComponent(reference)))
      ).toEqual(Buffer.from([255, 216, 255, 217]));
    expect(markdown).toContain('First attachment note');
    expect(markdown).toContain('Second attachment note');
    expect(await attachmentWriteAttempts(extensionPage)).toHaveLength(4);
    await expect
      .poll(() =>
        extensionPage.evaluate(
          async (key) => JSON.stringify((await chrome.storage.local.get(key))[key]),
          LEARNING_PROGRESS_KEY
        )
      )
      .toContain(attempt.operationId);
    console.log(
      'attachment-recovery-evidence',
      JSON.stringify({
        scenario,
        operationId: attempt.operationId,
        exportStartedAt: attempt.startedAt,
        notePath: note.filename,
        files: files.length,
        writes: 4,
        references,
        markdownSha256: createHash('sha256').update(markdown).digest('hex'),
        screenshotHex: 'ffd8ffd9'
      })
    );
  });
}
