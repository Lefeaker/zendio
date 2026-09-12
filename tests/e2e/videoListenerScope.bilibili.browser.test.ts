import { expect, type BrowserContext, type Page } from '@playwright/test';
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

async function installDelayedVideoDraftStorageWrites(
  context: BrowserContext,
  extensionPage: Page,
  expectedComment: string
): Promise<{
  release: () => Promise<void>;
  readDelayedWriteCount: () => Promise<number>;
}> {
  const keepAliveName = 'aiob-test-video-draft-storage-gate';
  const background =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  await background.evaluate(
    ({ committedComment, portName }) => {
      const workerGlobal = globalThis as typeof globalThis & {
        __delayedVideoDraftStorageWritesForTests?: {
          readDelayedWriteCount: () => number;
          release: () => void;
        };
        __videoDraftStorageGatePortForTests?: chrome.runtime.Port;
      };
      chrome.runtime.onConnect.addListener((port) => {
        if (port.name === portName) {
          workerGlobal.__videoDraftStorageGatePortForTests = port;
        }
      });
      const storageArea = chrome.storage.local;
      const originalSet = storageArea.set.bind(storageArea) as (
        items: Record<string, unknown>,
        callback?: () => void
      ) => void;
      const pendingWrites: Array<() => void> = [];
      let delayedWriteCount = 0;
      let released = false;
      const containsCommittedCapture = (value: unknown): boolean => {
        if (typeof value !== 'object' || value === null || !('payload' in value)) return false;
        const payload = value.payload;
        if (typeof payload !== 'object' || payload === null || !('captures' in payload)) {
          return false;
        }
        const captures = payload.captures;
        return (
          Array.isArray(captures) &&
          captures.some(
            (capture) =>
              typeof capture === 'object' &&
              capture !== null &&
              'comment' in capture &&
              capture.comment === committedComment
          )
        );
      };
      Object.defineProperty(storageArea, 'set', {
        configurable: true,
        value: (items: Record<string, unknown>, callback?: () => void) => {
          const write = () => originalSet(items, callback);
          if (released || !Object.values(items).some(containsCommittedCapture)) {
            write();
            return;
          }
          delayedWriteCount += 1;
          pendingWrites.push(write);
        }
      });
      workerGlobal.__delayedVideoDraftStorageWritesForTests = {
        readDelayedWriteCount: () => delayedWriteCount,
        release: () => {
          released = true;
          pendingWrites.splice(0).forEach((write) => write());
        }
      };
    },
    { committedComment: expectedComment, portName: keepAliveName }
  );
  await extensionPage.evaluate((portName) => {
    const extensionGlobal = globalThis as typeof globalThis & {
      __videoDraftStorageGatePortForTests?: chrome.runtime.Port;
    };
    extensionGlobal.__videoDraftStorageGatePortForTests = chrome.runtime.connect({
      name: portName
    });
  }, keepAliveName);

  return {
    readDelayedWriteCount: () =>
      background.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              __delayedVideoDraftStorageWritesForTests?: {
                readDelayedWriteCount: () => number;
              };
            }
          ).__delayedVideoDraftStorageWritesForTests?.readDelayedWriteCount() ?? 0
      ),
    release: async () => {
      await background.evaluate(() => {
        (
          globalThis as typeof globalThis & {
            __delayedVideoDraftStorageWritesForTests?: { release: () => void };
          }
        ).__delayedVideoDraftStorageWritesForTests?.release();
      });
      await extensionPage.evaluate(() => {
        const extensionGlobal = globalThis as typeof globalThis & {
          __videoDraftStorageGatePortForTests?: chrome.runtime.Port;
        };
        extensionGlobal.__videoDraftStorageGatePortForTests?.disconnect();
        delete extensionGlobal.__videoDraftStorageGatePortForTests;
      });
    }
  };
}

export function registerVideoListenerScopeBilibiliTests(): void {
  testWithExtension(
    'discovers a late nested Bilibili shadow root while the active session has zero fragments',
    async ({ context, extensionPage }) => {
      const { page, tabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        `${BILIBILI_URL}?late-zero-fragment-shadow=1`,
        bilibiliFixtureHtml()
      );
      await page.evaluate(() => {
        document.querySelectorAll('bili-comments').forEach((element) => element.remove());
      });
      await startVideoMode(extensionPage, tabId);
      await expandVideoPanel(page);
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(0);

      await page.evaluate(() => {
        const outer = document.createElement('bili-comments');
        outer.dataset.fixture = 'late-comments';
        outer.attachShadow({ mode: 'open' }).innerHTML = '<div id="contents"></div>';
        document.body.append(outer);
      });
      await page.waitForTimeout(180);
      await page.evaluate(() => {
        const outer = document.querySelector<HTMLElement>(
          'bili-comments[data-fixture="late-comments"]'
        );
        const contents = outer?.shadowRoot?.querySelector('#contents');
        if (!contents) throw new Error('late outer comments root was not mounted');
        const thread = document.createElement('bili-comment-thread-renderer');
        thread.dataset.fixture = 'late-thread';
        const threadRoot = thread.attachShadow({ mode: 'open' });
        const comment = document.createElement('bili-comment-renderer');
        const commentRoot = comment.attachShadow({ mode: 'open' });
        const richText = document.createElement('bili-rich-text');
        richText.dataset.fixture = 'late-zero-fragment-rich-text';
        richText.attachShadow({ mode: 'open' }).innerHTML =
          '<div id="contents">Late nested comment without fragments</div>';
        commentRoot.append(richText);
        threadRoot.append(comment);
        contents.append(thread);
      });

      await dragSelectBilibiliRichText(page, 'late-zero-fragment-rich-text', {
        modifierKey: null
      });
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);
      await expect(page.locator('[data-role="capture-item"]').last()).toContainText(
        'Late nested comment without fragments'
      );
    }
  );

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

      const delayedStorage = await installDelayedVideoDraftStorageWrites(
        context,
        extensionPage,
        'Panel add note'
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
      await expect(playingInput).toHaveValue('Panel add note');
      await expect
        .poll(async () => ({
          delayedWriteCount: await delayedStorage.readDelayedWriteCount(),
          play: (await readPlaybackCounters(extensionPage, playingTabId)).play
        }))
        .toEqual({ delayedWriteCount: 1, play: 1 });

      await installPlaybackFixture(extensionPage, playingTabId, true);
      await resetPlaybackCounters(extensionPage, playingTabId);

      await playingPage.locator('[data-action-id="video:add-note"]').click();
      const pausedInput = playingPage.locator('[data-capture-input]').last();
      await waitForPanelCaptureInputReady(pausedInput);
      await pausedInput.fill('Paused panel note');
      await pausedInput.press('Enter');
      await expect
        .poll(() => readPlaybackCounters(extensionPage, playingTabId), {
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
            selectionTriggerMode: 'modifier',
            selectionModifierKeys: ['shift']
          },
          { highlightTheme: 'neonOrange' }
        )
      );

      await openVideoPanelFromControlBar(page, 'Bilibili seed capture');
      const initialCount = await page.locator('[data-role="capture-item"]').count();

      await dragSelectBilibiliRichText(page, 'main-rich-text');
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(initialCount + 1);
      await expandVideoPanel(page);
      await expect(page.locator('[data-role="capture-item"]').last()).toContainText(
        BILIBILI_MAIN_COMMENT_TEXT
      );
      await expect.poll(() => countBilibiliRichTextHighlights(page, 'main-rich-text')).toBe(1);
      await expect
        .poll(() => isBilibiliRichTextHighlightVisible(page, 'main-rich-text'))
        .toBe(true);

      await page.locator('[data-action-id="session:toggleCollapse"]').click();
      await expect(page.locator('.video-surface-window').first()).toHaveClass(/is-collapsed/);
      await dragSelectBilibiliRichText(page, 'reply-rich-text');
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(initialCount + 2);
      await expandVideoPanel(page);
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
    'honors disabled and direct trigger modes for Bilibili shadow-root drag selection',
    async ({ context, extensionPage }) => {
      const { page: disabledPage } = await openFixtureWithRuntime(
        context,
        extensionPage,
        `${BILIBILI_URL}?selection-trigger=disabled`,
        bilibiliFixtureHtml(),
        createOptionsFixture({ selectionTriggerMode: 'disabled' })
      );
      await openVideoPanelFromControlBar(disabledPage, 'Disabled trigger seed');
      await expandVideoPanel(disabledPage);
      const disabledInitialCount = await disabledPage.locator('[data-role="capture-item"]').count();

      await dragSelectBilibiliRichText(disabledPage, 'main-rich-text', { modifierKey: null });

      await expect(disabledPage.locator('[data-role="capture-item"]')).toHaveCount(
        disabledInitialCount
      );
      await expect
        .poll(() => countBilibiliRichTextHighlights(disabledPage, 'main-rich-text'))
        .toBe(0);

      const { page: directPage } = await openFixtureWithRuntime(
        context,
        extensionPage,
        `${BILIBILI_URL}?selection-trigger=direct`,
        bilibiliFixtureHtml(),
        createOptionsFixture({ selectionTriggerMode: 'direct' })
      );
      await openVideoPanelFromControlBar(directPage, 'Direct trigger seed');
      await expandVideoPanel(directPage);
      const directInitialCount = await directPage.locator('[data-role="capture-item"]').count();

      await dragSelectBilibiliRichText(directPage, 'main-rich-text', { modifierKey: null });

      await expect(directPage.locator('[data-role="capture-item"]')).toHaveCount(
        directInitialCount + 1
      );
      await expect(directPage.locator('[data-role="capture-item"]').last()).toContainText(
        BILIBILI_MAIN_COMMENT_TEXT
      );
      await expect
        .poll(() => countBilibiliRichTextHighlights(directPage, 'main-rich-text'))
        .toBe(1);
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
      await expect(screenshotToggle).toBeVisible();

      const toggleBox = await screenshotToggle.boundingBox();
      if (!toggleBox) {
        throw new Error('Missing Bilibili screenshot toggle hit area.');
      }
      expect(toggleBox.width).toBeGreaterThanOrEqual(24);
      expect(toggleBox.height).toBeGreaterThanOrEqual(24);

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
            selectionTriggerMode: 'modifier',
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
            selectionTriggerMode: 'modifier',
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

      await page.evaluate(
        ({ mainText, replyText }) => {
          const current = document.querySelector('bili-comments');
          if (!current) throw new Error('Missing current Bilibili comments host.');
          const createRichText = (fixtureId: string, html: string): HTMLElement => {
            const host = document.createElement('bili-rich-text');
            host.dataset.fixture = fixtureId;
            host.attachShadow({ mode: 'open' }).innerHTML =
              `<div id="contents" class="rich-text-content">${html}</div>`;
            return host;
          };
          const createComment = (
            tagName: 'bili-comment-renderer' | 'bili-comment-reply-renderer',
            fixtureId: string,
            richText: HTMLElement
          ): HTMLElement => {
            const host = document.createElement(tagName);
            host.dataset.fixture = fixtureId;
            const root = host.attachShadow({ mode: 'open' });
            root.append(richText);
            return host;
          };
          const replacement = document.createElement('bili-comments');
          replacement.dataset.fixture = 'comments-replacement';
          const replacementRoot = replacement.attachShadow({ mode: 'open' });
          const contents = document.createElement('div');
          contents.id = 'contents';
          const thread = document.createElement('bili-comment-thread-renderer');
          const threadRoot = thread.attachShadow({ mode: 'open' });
          threadRoot.append(
            createComment(
              'bili-comment-renderer',
              'main-comment-replacement',
              createRichText('main-rich-text', `<span>${mainText}</span>`)
            ),
            createComment(
              'bili-comment-reply-renderer',
              'reply-comment-replacement',
              createRichText('reply-rich-text', `<span>${replyText}</span>`)
            )
          );
          contents.append(thread);
          replacementRoot.append(contents);
          current.replaceWith(replacement);
        },
        { mainText: BILIBILI_MAIN_COMMENT_TEXT, replyText: BILIBILI_REPLY_COMMENT_TEXT }
      );

      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(2);
      await expect.poll(() => countBilibiliRichTextHighlights(page, 'main-rich-text')).toBe(1);
      await expect.poll(() => countBilibiliRichTextHighlights(page, 'reply-rich-text')).toBe(1);
    }
  );
}
