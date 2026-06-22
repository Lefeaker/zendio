import { expect } from '@playwright/test';
import {
  captureFixtureSelectionWithShift,
  clearVideoScreenshotCacheStorage,
  closeVideoPanel,
  createOptionsFixture,
  expandVideoPanel,
  findCurrentTabId,
  injectContentRuntime,
  installVideoScreenshotProbe,
  openFixtureWithRuntime,
  openVideoPanelFromControlBar,
  readVideoScreenshotProbe,
  readVideoStorageSummary,
  releasePendingVideoScreenshotBlobs,
  removeDraftScreenshotRefs,
  startVideoMode,
  testWithExtension,
  YOUTUBE_URL,
  youtubeFixtureHtml
} from './utils/videoListenerScopeHarness';

export function registerVideoListenerScopeLifecycleTests(): void {
  testWithExtension(
    'keeps control-bar screenshot intent durable without mutating visible currentTime',
    async ({ context, extensionPage }) => {
      const { page, tabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        `${YOUTUBE_URL}&p09=screenshot-intent`,
        youtubeFixtureHtml()
      );

      await installVideoScreenshotProbe(extensionPage, tabId);
      await openVideoPanelFromControlBar(page, 'Browser screenshot intent note');

      const firstCapture = page.locator('[data-role="capture-item"]').first();
      const screenshotToggle = firstCapture.locator('[data-action-id="video:toggle-screenshot"]');
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);
      await expect(screenshotToggle).toHaveAttribute('data-screenshot-state', 'pending');
      await expect(screenshotToggle).toHaveAttribute('aria-pressed', 'true');

      await expect
        .poll(() => readVideoScreenshotProbe(extensionPage, tabId), {
          timeout: 10000,
          message: 'screenshot preparation did not start in the background'
        })
        .toMatchObject({
          currentTimeWrites: 0,
          drawImageCalls: 1,
          toBlobCalls: 1,
          toDataUrlCalls: 0,
          pendingBlobCallbacks: 1
        });

      await expect
        .poll(
          async () => {
            const summary = await readVideoStorageSummary(extensionPage);
            const firstDraft = summary.drafts[0];
            return {
              count: summary.drafts.length,
              captureCount: firstDraft?.captureCount ?? 0,
              requestedScreenshotCount: firstDraft?.requestedScreenshotCount ?? 0,
              screenshotRefCount: firstDraft?.screenshotRefCount ?? 0,
              containsInlineScreenshotPayload: firstDraft?.containsInlineScreenshotPayload ?? false,
              cacheEntryCount: summary.cacheEntryCount,
              legacyStorageCacheEntryCount: summary.legacyStorageCacheEntryCount
            };
          },
          {
            timeout: 10000,
            message: 'pending screenshot intent was not persisted durably'
          }
        )
        .toEqual({
          count: 1,
          captureCount: 1,
          requestedScreenshotCount: 1,
          screenshotRefCount: 0,
          containsInlineScreenshotPayload: false,
          cacheEntryCount: 0,
          legacyStorageCacheEntryCount: 0
        });

      await releasePendingVideoScreenshotBlobs(extensionPage, tabId, 'success');
      await expect
        .poll(() => readVideoScreenshotProbe(extensionPage, tabId), {
          timeout: 10000,
          message: 'background screenshot preparation did not settle cleanly'
        })
        .toMatchObject({
          currentTimeWrites: 0,
          drawImageCalls: 1,
          toBlobCalls: 1,
          toDataUrlCalls: 0,
          pendingBlobCallbacks: 0
        });

      await expect(screenshotToggle).toHaveAttribute('data-screenshot-state', 'on');
      await expect(screenshotToggle).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(
          async () => {
            const summary = await readVideoStorageSummary(extensionPage);
            const firstDraft = summary.drafts[0];
            return {
              count: summary.drafts.length,
              captureCount: firstDraft?.captureCount ?? 0,
              requestedScreenshotCount: firstDraft?.requestedScreenshotCount ?? 0,
              screenshotRefCount: firstDraft?.screenshotRefCount ?? 0,
              containsInlineScreenshotPayload: firstDraft?.containsInlineScreenshotPayload ?? false,
              cacheEntryCount: summary.cacheEntryCount,
              cacheIndexEntryCount: summary.cacheIndexEntryCount,
              legacyStorageCacheEntryCount: summary.legacyStorageCacheEntryCount
            };
          },
          {
            timeout: 10000,
            message: 'completed screenshot intent stopped matching the durable draft state'
          }
        )
        .toEqual({
          count: 1,
          captureCount: 1,
          requestedScreenshotCount: 1,
          screenshotRefCount: 1,
          containsInlineScreenshotPayload: false,
          cacheEntryCount: 1,
          cacheIndexEntryCount: 1,
          legacyStorageCacheEntryCount: 0
        });

      await expandVideoPanel(page);
      await closeVideoPanel(page);
      await expect(page.locator('[data-aiob-video-control-bar-button="true"]')).toHaveCount(1);
      await expect
        .poll(
          async () => {
            const summary = await readVideoStorageSummary(extensionPage);
            return {
              draftCount: summary.drafts.length,
              cacheEntryCount: summary.cacheEntryCount,
              cacheIndexEntryCount: summary.cacheIndexEntryCount,
              cacheKeyCount: summary.cacheKeys.length,
              legacyStorageCacheEntryCount: summary.legacyStorageCacheEntryCount
            };
          },
          {
            timeout: 10000,
            message: 'cancel cleanup left screenshot cache state behind'
          }
        )
        .toEqual({
          draftCount: 0,
          cacheEntryCount: 0,
          cacheIndexEntryCount: 0,
          cacheKeyCount: 0,
          legacyStorageCacheEntryCount: 0
        });
    }
  );

  testWithExtension(
    'restores legacy screenshotRequested-only drafts through fallback preparation without mutating visible currentTime',
    async ({ context, extensionPage }) => {
      const url = `${YOUTUBE_URL}&p09=legacy-screenshot-draft`;
      const { page, tabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        url,
        youtubeFixtureHtml()
      );

      await installVideoScreenshotProbe(extensionPage, tabId);
      await openVideoPanelFromControlBar(page, 'Legacy screenshot restore note');

      const firstCapture = page.locator('[data-role="capture-item"]').first();
      const screenshotToggle = firstCapture.locator('[data-action-id="video:toggle-screenshot"]');
      await expect(screenshotToggle).toHaveAttribute('data-screenshot-state', 'pending');
      await expect
        .poll(() => readVideoScreenshotProbe(extensionPage, tabId), {
          timeout: 10000,
          message: 'initial screenshot preparation did not reach the delayed probe'
        })
        .toMatchObject({
          currentTimeWrites: 0,
          drawImageCalls: 1,
          toBlobCalls: 1,
          toDataUrlCalls: 0,
          pendingBlobCallbacks: 1
        });

      await releasePendingVideoScreenshotBlobs(extensionPage, tabId, 'success');
      await expect(screenshotToggle).toHaveAttribute('data-screenshot-state', 'on');
      await expect
        .poll(async () => {
          const summary = await readVideoStorageSummary(extensionPage);
          const firstDraft = summary.drafts[0];
          return {
            requestedScreenshotCount: firstDraft?.requestedScreenshotCount ?? 0,
            screenshotRefCount: firstDraft?.screenshotRefCount ?? 0,
            containsInlineScreenshotPayload: firstDraft?.containsInlineScreenshotPayload ?? false,
            cacheEntryCount: summary.cacheEntryCount,
            legacyStorageCacheEntryCount: summary.legacyStorageCacheEntryCount
          };
        })
        .toEqual({
          requestedScreenshotCount: 1,
          screenshotRefCount: 1,
          containsInlineScreenshotPayload: false,
          cacheEntryCount: 1,
          legacyStorageCacheEntryCount: 0
        });

      await page.close();
      await removeDraftScreenshotRefs(extensionPage, url);
      await clearVideoScreenshotCacheStorage(extensionPage);

      const restoredPage = await context.newPage();
      await restoredPage.goto(url, { waitUntil: 'domcontentloaded' });
      const restoredTabId = await findCurrentTabId(extensionPage, restoredPage.url());
      await installVideoScreenshotProbe(extensionPage, restoredTabId);
      await injectContentRuntime(extensionPage, restoredTabId);
      await expect(restoredPage.locator('[data-aiob-video-control-bar-button="true"]')).toHaveCount(
        1
      );
      await expect(restoredPage.locator('[data-stitch-surface="video"]')).toBeVisible({
        timeout: 10000
      });
      await expandVideoPanel(restoredPage);

      const restoredToggle = restoredPage
        .locator('[data-role="capture-item"]')
        .first()
        .locator('[data-action-id="video:toggle-screenshot"]');
      await expect(restoredToggle).toHaveAttribute('data-screenshot-state', 'pending');
      await expect
        .poll(() => readVideoScreenshotProbe(extensionPage, restoredTabId), {
          timeout: 10000,
          message: 'legacy screenshot restore did not trigger fallback preparation'
        })
        .toMatchObject({
          currentTimeWrites: 0,
          drawImageCalls: 1,
          toBlobCalls: 1,
          toDataUrlCalls: 0,
          pendingBlobCallbacks: 1
        });
      await expect
        .poll(async () => {
          const summary = await readVideoStorageSummary(extensionPage);
          const firstDraft = summary.drafts[0];
          return {
            requestedScreenshotCount: firstDraft?.requestedScreenshotCount ?? 0,
            screenshotRefCount: firstDraft?.screenshotRefCount ?? 0,
            containsInlineScreenshotPayload: firstDraft?.containsInlineScreenshotPayload ?? false,
            cacheEntryCount: summary.cacheEntryCount,
            legacyStorageCacheEntryCount: summary.legacyStorageCacheEntryCount
          };
        })
        .toEqual({
          requestedScreenshotCount: 1,
          screenshotRefCount: 0,
          containsInlineScreenshotPayload: false,
          cacheEntryCount: 0,
          legacyStorageCacheEntryCount: 0
        });

      await releasePendingVideoScreenshotBlobs(extensionPage, restoredTabId, 'success');
      await expect(restoredToggle).toHaveAttribute('data-screenshot-state', 'on');
      await expect
        .poll(async () => {
          const summary = await readVideoStorageSummary(extensionPage);
          const firstDraft = summary.drafts[0];
          return {
            requestedScreenshotCount: firstDraft?.requestedScreenshotCount ?? 0,
            screenshotRefCount: firstDraft?.screenshotRefCount ?? 0,
            containsInlineScreenshotPayload: firstDraft?.containsInlineScreenshotPayload ?? false,
            cacheEntryCount: summary.cacheEntryCount,
            legacyStorageCacheEntryCount: summary.legacyStorageCacheEntryCount
          };
        })
        .toEqual({
          requestedScreenshotCount: 1,
          screenshotRefCount: 1,
          containsInlineScreenshotPayload: false,
          cacheEntryCount: 1,
          legacyStorageCacheEntryCount: 0
        });

      await restoredPage.close();
    }
  );

  testWithExtension(
    'restores drafts with missing screenshot cache entries into pending state and recovers via fallback preparation',
    async ({ context, extensionPage }) => {
      const url = `${YOUTUBE_URL}&p09=missing-screenshot-cache`;
      const { page, tabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        url,
        youtubeFixtureHtml()
      );

      await installVideoScreenshotProbe(extensionPage, tabId);
      await openVideoPanelFromControlBar(page, 'Missing screenshot cache note');

      const firstCapture = page.locator('[data-role="capture-item"]').first();
      const screenshotToggle = firstCapture.locator('[data-action-id="video:toggle-screenshot"]');
      await expect(screenshotToggle).toHaveAttribute('data-screenshot-state', 'pending');
      await expect
        .poll(() => readVideoScreenshotProbe(extensionPage, tabId), {
          timeout: 10000,
          message: 'initial screenshot preparation did not reach the delayed probe'
        })
        .toMatchObject({
          currentTimeWrites: 0,
          drawImageCalls: 1,
          toBlobCalls: 1,
          toDataUrlCalls: 0,
          pendingBlobCallbacks: 1
        });

      await releasePendingVideoScreenshotBlobs(extensionPage, tabId, 'success');
      await expect(screenshotToggle).toHaveAttribute('data-screenshot-state', 'on');
      await expect
        .poll(async () => {
          const summary = await readVideoStorageSummary(extensionPage);
          const firstDraft = summary.drafts[0];
          return {
            requestedScreenshotCount: firstDraft?.requestedScreenshotCount ?? 0,
            screenshotRefCount: firstDraft?.screenshotRefCount ?? 0,
            containsInlineScreenshotPayload: firstDraft?.containsInlineScreenshotPayload ?? false,
            cacheEntryCount: summary.cacheEntryCount,
            legacyStorageCacheEntryCount: summary.legacyStorageCacheEntryCount
          };
        })
        .toEqual({
          requestedScreenshotCount: 1,
          screenshotRefCount: 1,
          containsInlineScreenshotPayload: false,
          cacheEntryCount: 1,
          legacyStorageCacheEntryCount: 0
        });

      await page.close();
      await clearVideoScreenshotCacheStorage(extensionPage);

      const restoredPage = await context.newPage();
      await restoredPage.goto(url, { waitUntil: 'domcontentloaded' });
      const restoredTabId = await findCurrentTabId(extensionPage, restoredPage.url());
      await installVideoScreenshotProbe(extensionPage, restoredTabId);
      await injectContentRuntime(extensionPage, restoredTabId);
      await expect(restoredPage.locator('[data-aiob-video-control-bar-button="true"]')).toHaveCount(
        1
      );
      await expect(restoredPage.locator('[data-stitch-surface="video"]')).toBeVisible({
        timeout: 10000
      });
      await expandVideoPanel(restoredPage);

      const restoredToggle = restoredPage
        .locator('[data-role="capture-item"]')
        .first()
        .locator('[data-action-id="video:toggle-screenshot"]');
      await expect(restoredToggle).toHaveAttribute('data-screenshot-state', 'pending');
      await expect
        .poll(() => readVideoScreenshotProbe(extensionPage, restoredTabId), {
          timeout: 10000,
          message: 'missing screenshot cache restore did not trigger fallback preparation'
        })
        .toMatchObject({
          currentTimeWrites: 0,
          drawImageCalls: 1,
          toBlobCalls: 1,
          toDataUrlCalls: 0,
          pendingBlobCallbacks: 1
        });
      await expect
        .poll(async () => {
          const summary = await readVideoStorageSummary(extensionPage);
          const firstDraft = summary.drafts[0];
          return {
            requestedScreenshotCount: firstDraft?.requestedScreenshotCount ?? 0,
            screenshotRefCount: firstDraft?.screenshotRefCount ?? 0,
            containsInlineScreenshotPayload: firstDraft?.containsInlineScreenshotPayload ?? false,
            cacheEntryCount: summary.cacheEntryCount,
            legacyStorageCacheEntryCount: summary.legacyStorageCacheEntryCount
          };
        })
        .toEqual({
          requestedScreenshotCount: 1,
          screenshotRefCount: 1,
          containsInlineScreenshotPayload: false,
          cacheEntryCount: 0,
          legacyStorageCacheEntryCount: 0
        });

      await releasePendingVideoScreenshotBlobs(extensionPage, restoredTabId, 'success');
      await expect(restoredToggle).toHaveAttribute('data-screenshot-state', 'on');
      await expect
        .poll(async () => {
          const summary = await readVideoStorageSummary(extensionPage);
          const firstDraft = summary.drafts[0];
          return {
            requestedScreenshotCount: firstDraft?.requestedScreenshotCount ?? 0,
            screenshotRefCount: firstDraft?.screenshotRefCount ?? 0,
            containsInlineScreenshotPayload: firstDraft?.containsInlineScreenshotPayload ?? false,
            cacheEntryCount: summary.cacheEntryCount,
            legacyStorageCacheEntryCount: summary.legacyStorageCacheEntryCount
          };
        })
        .toEqual({
          requestedScreenshotCount: 1,
          screenshotRefCount: 1,
          containsInlineScreenshotPayload: false,
          cacheEntryCount: 1,
          legacyStorageCacheEntryCount: 0
        });

      await restoredPage.close();
    }
  );

  testWithExtension(
    'cleans up the first session so a second YouTube session captures selection only once',
    async ({ context, extensionPage }) => {
      const { page, tabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        `${YOUTUBE_URL}&p09=session-restart`,
        youtubeFixtureHtml(),
        createOptionsFixture({
          selectionModifierEnabled: true,
          selectionModifierKeys: ['shift']
        })
      );

      await startVideoMode(extensionPage, tabId);
      await expect(page.locator('[data-role="finish-btn"]')).toBeVisible({ timeout: 10000 });
      await expandVideoPanel(page);
      await closeVideoPanel(page);
      await expect(page.locator('[data-aiob-video-control-bar-button="true"]')).toHaveCount(1);

      await startVideoMode(extensionPage, tabId);
      await expect(page.locator('[data-role="finish-btn"]')).toBeVisible({ timeout: 10000 });
      await expandVideoPanel(page);
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(0);

      await captureFixtureSelectionWithShift(page);
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);
      await expect(page.locator('[data-role="capture-item"]').last()).toContainText(
        'Browser selected fragment text'
      );
    }
  );
}
