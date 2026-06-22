import { expect } from '@playwright/test';
import {
  BILIBILI_MAIN_COMMENT_TEXT,
  BILIBILI_REPLY_COMMENT_TEXT,
  BILIBILI_URL,
  bilibiliFixtureHtml,
  churnBilibiliRuntime,
  closeVideoPanel,
  countBilibiliRichTextHighlights,
  createOptionsFixture,
  dispatchSyntheticVideoPlay,
  dragSelectBilibiliRichText,
  expandVideoPanel,
  expectPxWithin,
  installDelayedVideoCaptureStorageWrites,
  installPlaybackFixture,
  installVideoScreenshotProbe,
  isBilibiliRichTextHighlightVisible,
  openFixtureWithRuntime,
  openVideoPanelFromControlBar,
  readControlBarGeometry,
  readPlaybackCounters,
  readPromptCounters,
  readVideoDraftEntries,
  readVideoScreenshotProbe,
  releasePendingVideoScreenshotBlobs,
  resetPlaybackCounters,
  startVideoMode,
  testWithExtension,
  waitForPanelCaptureInputReady
} from './utils/videoListenerScopeHarness';

export function registerVideoListenerScopeBilibiliTests(): void {
  testWithExtension(
    'keeps Bilibili danmaku churn out of prompt startup work',
    async ({ context, extensionPage }) => {
      const { page, tabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        BILIBILI_URL,
        bilibiliFixtureHtml()
      );

      await expect(page.locator('[data-aiob-video-control-bar-button="true"]')).toHaveCount(1);
      await expect(page.locator('[data-stitch-surface="video"]')).toHaveCount(0);
      await expect(page.locator('#aiob-video-floating-prompt')).toHaveCount(0);
      const beforeGeometry = await readControlBarGeometry(page, '.bpx-player-control-bottom-right');
      expect(beforeGeometry.button?.parentMatchesTarget).toBe(true);
      expect(beforeGeometry.button?.isFirstElementChild).toBe(true);
      expect(beforeGeometry.icon).not.toBeNull();
      expectPxWithin(beforeGeometry.button?.computed.width ?? null, 25);
      expectPxWithin(beforeGeometry.button?.computed.height ?? null, 25);
      expectPxWithin(beforeGeometry.button?.computed.marginLeft ?? null, 6);
      expectPxWithin(beforeGeometry.button?.computed.marginRight ?? null, 6);
      expectPxWithin(beforeGeometry.button?.computed.translateY ?? null, -4);
      const before = await readPromptCounters(extensionPage, tabId);

      await page.evaluate(() => {
        const root = document.querySelector('.bpx-player-render-dm-wrap');
        for (let index = 0; index < 200; index += 1) {
          const node = document.createElement('span');
          node.className = 'bili-danmaku-x-dm';
          node.textContent = `dm-${index}`;
          root?.appendChild(node);
        }
      });
      await page.waitForTimeout(250);

      const after = await readPromptCounters(extensionPage, tabId);
      const afterGeometry = await readControlBarGeometry(page, '.bpx-player-control-bottom-right');
      await expect(page.locator('[data-aiob-video-control-bar-button="true"]')).toHaveCount(1);
      await expect(page.locator('[data-stitch-surface="video"]')).toHaveCount(0);
      await expect(page.locator('#aiob-video-floating-prompt')).toHaveCount(0);
      expect(afterGeometry.button?.parentMatchesTarget).toBe(true);
      expect(afterGeometry.button?.isFirstElementChild).toBe(true);
      expectPxWithin(afterGeometry.button?.computed.width ?? null, 25);
      expectPxWithin(afterGeometry.button?.computed.height ?? null, 25);
      expectPxWithin(afterGeometry.button?.computed.marginLeft ?? null, 6);
      expectPxWithin(afterGeometry.button?.computed.marginRight ?? null, 6);
      expectPxWithin(afterGeometry.button?.computed.translateY ?? null, -4);
      expect(after.evaluateCount).toBe(before.evaluateCount);
      expect(after.controlButtonSyncCount).toBe(before.controlButtonSyncCount);
      expect(after.floatingPromptMountCount).toBe(before.floatingPromptMountCount);
    }
  );

  testWithExtension(
    'restores playback after panel add-note Enter only for videos that were playing',
    async ({ context, extensionPage }) => {
      const { page: playingPage, tabId: playingTabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        BILIBILI_URL,
        bilibiliFixtureHtml()
      );
      await installPlaybackFixture(extensionPage, playingTabId, false);
      await openVideoPanelFromControlBar(playingPage, 'Seed panel note test');
      await expandVideoPanel(playingPage);
      await resetPlaybackCounters(extensionPage, playingTabId);

      await playingPage.locator('[data-action-id="video:add-note"]').click();
      const playingInput = playingPage.locator('[data-capture-input]').last();
      await waitForPanelCaptureInputReady(playingInput);
      await expect
        .poll(() =>
          readPlaybackCounters(extensionPage, playingTabId).then((counters) => counters.pause)
        )
        .toBe(1);
      await dispatchSyntheticVideoPlay(extensionPage, playingTabId);
      await expect
        .poll(() =>
          readPlaybackCounters(extensionPage, playingTabId).then((counters) => counters.pause)
        )
        .toBe(2);

      const delayedStorage = await installDelayedVideoCaptureStorageWrites(
        extensionPage,
        playingTabId
      );
      await playingInput.fill('Panel add note');
      await playingInput.press('Enter');
      await expect.poll(delayedStorage.readDelayedWriteCount).toBe(1);
      await expect
        .poll(() =>
          readPlaybackCounters(extensionPage, playingTabId).then((counters) => counters.play)
        )
        .toBe(0);
      await delayedStorage.release();
      await expect
        .poll(() =>
          readPlaybackCounters(extensionPage, playingTabId).then((counters) => counters.play)
        )
        .toBe(1);

      const { page: pausedPage, tabId: pausedTabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        `${BILIBILI_URL}?paused=1`,
        bilibiliFixtureHtml()
      );
      await installPlaybackFixture(extensionPage, pausedTabId, true);
      await openVideoPanelFromControlBar(pausedPage, 'Seed paused panel note test');
      await expandVideoPanel(pausedPage);
      await resetPlaybackCounters(extensionPage, pausedTabId);

      await pausedPage.locator('[data-action-id="video:add-note"]').click();
      const pausedInput = pausedPage.locator('[data-capture-input]').last();
      await waitForPanelCaptureInputReady(pausedInput);
      await pausedInput.fill('Paused panel note');
      await pausedInput.press('Enter');
      await expect
        .poll(() => readPlaybackCounters(extensionPage, pausedTabId), {
          timeout: 10000,
          message: 'paused panel add-note unexpectedly changed playback counters'
        })
        .toMatchObject({ pause: 0, play: 0 });
    }
  );

  testWithExtension(
    'captures and highlights Bilibili rich text selected by real mouse drag in nested shadow roots',
    async ({ context, extensionPage }) => {
      const { page } = await openFixtureWithRuntime(
        context,
        extensionPage,
        BILIBILI_URL,
        bilibiliFixtureHtml(),
        createOptionsFixture(
          {
            selectionModifierEnabled: true,
            selectionModifierKeys: ['shift']
          },
          { highlightTheme: 'neonOrange' }
        )
      );

      await openVideoPanelFromControlBar(page, 'Bilibili seed capture');
      await expandVideoPanel(page);
      const initialCount = await page.locator('[data-role="capture-item"]').count();

      await dragSelectBilibiliRichText(page, 'main-rich-text');
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(initialCount + 1);
      await expect(page.locator('[data-role="capture-item"]').last()).toContainText(
        BILIBILI_MAIN_COMMENT_TEXT
      );
      await expect.poll(() => countBilibiliRichTextHighlights(page, 'main-rich-text')).toBe(1);
      await expect
        .poll(() => isBilibiliRichTextHighlightVisible(page, 'main-rich-text'))
        .toBe(true);

      await dragSelectBilibiliRichText(page, 'reply-rich-text');
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(initialCount + 2);
      await expect(page.locator('[data-role="capture-item"]').last()).toContainText(
        BILIBILI_REPLY_COMMENT_TEXT
      );
      await expect.poll(() => countBilibiliRichTextHighlights(page, 'reply-rich-text')).toBe(1);
      await expect
        .poll(() => isBilibiliRichTextHighlightVisible(page, 'reply-rich-text'))
        .toBe(true);
    }
  );

  testWithExtension(
    'toggles Bilibili timestamp screenshots from the status dot hit area',
    async ({ context, extensionPage }) => {
      const { page } = await openFixtureWithRuntime(
        context,
        extensionPage,
        `${BILIBILI_URL}?screenshot-dot-hit-area=1`,
        bilibiliFixtureHtml()
      );

      await openVideoPanelFromControlBar(page, 'Bilibili screenshot dot toggle');
      await expandVideoPanel(page);

      const firstCapture = page.locator('[data-role="capture-item"]').first();
      const screenshotToggle = firstCapture.locator('[data-action-id="video:toggle-screenshot"]');
      await expect(screenshotToggle).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(async () => await screenshotToggle.getAttribute('data-screenshot-state'))
        .toMatch(/^(pending|on)$/);

      const toggleBox = await screenshotToggle.boundingBox();
      expect(toggleBox?.width).toBeGreaterThanOrEqual(24);
      expect(toggleBox?.height).toBeGreaterThanOrEqual(24);
      if (!toggleBox) {
        throw new Error('Missing Bilibili screenshot toggle hit area.');
      }

      await page.mouse.click(toggleBox.x + 16, toggleBox.y + toggleBox.height / 2);

      await expect(screenshotToggle).toHaveAttribute('data-screenshot-state', 'off');
      await expect(screenshotToggle).toHaveAttribute('aria-pressed', 'false');

      await page.mouse.click(toggleBox.x + 16, toggleBox.y + toggleBox.height / 2);
      await expect(screenshotToggle).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(async () => await screenshotToggle.getAttribute('data-screenshot-state'))
        .toMatch(/^(pending|on)$/);
    }
  );

  testWithExtension(
    'toggles Bilibili panel-added timestamp screenshots from the near-dot marker area',
    async ({ context, extensionPage }) => {
      const options = createOptionsFixture();
      options.video.controlBarScreenshot = false;
      const { page, tabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        `${BILIBILI_URL}?screenshot-visible-off-dot=1`,
        bilibiliFixtureHtml(),
        options
      );

      await installVideoScreenshotProbe(extensionPage, tabId);
      await startVideoMode(extensionPage, tabId);
      await expandVideoPanel(page);
      await page.locator('[data-role="add-btn"]').click();
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);

      const firstCapture = page.locator('[data-role="capture-item"]').first();
      const marker = firstCapture.locator('.video-timestamp-marker');
      const screenshotToggle = firstCapture.locator('[data-action-id="video:toggle-screenshot"]');
      await expect(screenshotToggle).toHaveAttribute('data-screenshot-state', 'off');
      await expect(screenshotToggle).toHaveAttribute('aria-pressed', 'false');
      await expect
        .poll(() => readVideoScreenshotProbe(extensionPage, tabId), {
          timeout: 10000,
          message: 'Bilibili timestamp screenshot preparation did not start'
        })
        .toMatchObject({
          currentTimeWrites: 0,
          drawImageCalls: 1,
          toBlobCalls: 1,
          toDataUrlCalls: 0,
          pendingBlobCallbacks: 1
        });

      await releasePendingVideoScreenshotBlobs(extensionPage, tabId, 'success');
      await expect
        .poll(() => readVideoScreenshotProbe(extensionPage, tabId), {
          timeout: 10000,
          message: 'Bilibili timestamp screenshot preparation did not complete'
        })
        .toMatchObject({
          currentTimeWrites: 0,
          drawImageCalls: 1,
          toBlobCalls: 1,
          toDataUrlCalls: 0,
          pendingBlobCallbacks: 0
        });
      await expect(screenshotToggle).toHaveAttribute('data-screenshot-state', 'off');
      await expect(screenshotToggle).toHaveAttribute('aria-pressed', 'false');

      const markerBox = await marker.boundingBox();
      if (!markerBox) {
        throw new Error('Missing Bilibili screenshot marker area.');
      }

      await page.mouse.click(markerBox.x - 17, markerBox.y + markerBox.height / 2);

      await expect(screenshotToggle).toHaveAttribute('aria-pressed', 'true');
      await expect(screenshotToggle).toHaveAttribute('data-screenshot-state', 'on');
      await expect
        .poll(async () => {
          const entries = await readVideoDraftEntries(extensionPage);
          return entries[0]?.requestedScreenshotCount ?? 0;
        })
        .toBe(1);
    }
  );

  testWithExtension(
    'creates Bilibili control-bar captures with screenshot intent after enabling the popover option',
    async ({ context, extensionPage }) => {
      const options = createOptionsFixture();
      options.video.controlBarScreenshot = false;
      const { page } = await openFixtureWithRuntime(
        context,
        extensionPage,
        `${BILIBILI_URL}?screenshot-popover-toggle=1`,
        bilibiliFixtureHtml(),
        options
      );

      await openVideoPanelFromControlBar(page, 'Bilibili checkbox screenshot', {
        captureScreenshotEnabled: true
      });
      await expandVideoPanel(page);

      const firstCapture = page.locator('[data-role="capture-item"]').first();
      const screenshotToggle = firstCapture.locator('[data-action-id="video:toggle-screenshot"]');
      await expect(screenshotToggle).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(async () => await screenshotToggle.getAttribute('data-screenshot-state'))
        .toMatch(/^(pending|on)$/);
      await expect
        .poll(async () => {
          const entries = await readVideoDraftEntries(extensionPage);
          return entries[0]?.requestedScreenshotCount ?? 0;
        })
        .toBe(1);
    }
  );

  testWithExtension(
    'restores Bilibili shadow rich-text capture after session restart without duplicate captures',
    async ({ context, extensionPage }) => {
      const { page, tabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        `${BILIBILI_URL}?p09=shadow-restart`,
        bilibiliFixtureHtml(),
        createOptionsFixture(
          {
            selectionModifierEnabled: true,
            selectionModifierKeys: ['shift']
          },
          { highlightTheme: 'neonOrange' }
        )
      );

      await expect(page.locator('[data-aiob-video-control-bar-button="true"]')).toHaveCount(1);
      await startVideoMode(extensionPage, tabId);
      await expect(page.locator('[data-role="finish-btn"]')).toBeVisible({ timeout: 10000 });
      await expandVideoPanel(page);

      await dragSelectBilibiliRichText(page, 'main-rich-text');
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);
      await expect(page.locator('[data-role="capture-item"]').last()).toContainText(
        BILIBILI_MAIN_COMMENT_TEXT
      );
      await expect.poll(() => countBilibiliRichTextHighlights(page, 'main-rich-text')).toBe(1);

      await closeVideoPanel(page);
      await expect.poll(() => countBilibiliRichTextHighlights(page, 'main-rich-text')).toBe(0);

      await startVideoMode(extensionPage, tabId);
      await expect(page.locator('[data-role="finish-btn"]')).toBeVisible({ timeout: 10000 });
      await expandVideoPanel(page);
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(0);

      await dragSelectBilibiliRichText(page, 'main-rich-text');
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);
      await expect(page.locator('[data-role="capture-item"]').last()).toContainText(
        BILIBILI_MAIN_COMMENT_TEXT
      );
      await expect.poll(() => countBilibiliRichTextHighlights(page, 'main-rich-text')).toBe(1);
      await expect
        .poll(() => isBilibiliRichTextHighlightVisible(page, 'main-rich-text'))
        .toBe(true);
    }
  );

  testWithExtension(
    'keeps Bilibili danmaku and comment churn from duplicating restores or capture listeners',
    async ({ context, extensionPage }) => {
      const { page, tabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        `${BILIBILI_URL}?p09=comment-churn`,
        bilibiliFixtureHtml(),
        createOptionsFixture(
          {
            selectionModifierEnabled: true,
            selectionModifierKeys: ['shift']
          },
          { highlightTheme: 'neonOrange' }
        )
      );

      await expect(page.locator('[data-aiob-video-control-bar-button="true"]')).toHaveCount(1);
      await startVideoMode(extensionPage, tabId);
      await expect(page.locator('[data-role="finish-btn"]')).toBeVisible({ timeout: 10000 });
      await expandVideoPanel(page);

      await dragSelectBilibiliRichText(page, 'main-rich-text');
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);
      await expect.poll(() => countBilibiliRichTextHighlights(page, 'main-rich-text')).toBe(1);

      await churnBilibiliRuntime(page);
      await page.waitForTimeout(350);
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);
      await expect.poll(() => countBilibiliRichTextHighlights(page, 'main-rich-text')).toBe(1);

      await dragSelectBilibiliRichText(page, 'reply-rich-text');
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(2);
      await expect(page.locator('[data-role="capture-item"]').last()).toContainText(
        BILIBILI_REPLY_COMMENT_TEXT
      );
      await expect.poll(() => countBilibiliRichTextHighlights(page, 'main-rich-text')).toBe(1);
      await expect.poll(() => countBilibiliRichTextHighlights(page, 'reply-rich-text')).toBe(1);
      await expect
        .poll(() => isBilibiliRichTextHighlightVisible(page, 'reply-rich-text'))
        .toBe(true);
    }
  );
}
