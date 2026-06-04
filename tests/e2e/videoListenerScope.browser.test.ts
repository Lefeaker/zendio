import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BILIBILI_MAIN_COMMENT_TEXT,
  BILIBILI_REPLY_COMMENT_TEXT,
  buildBilibiliCommentsShadowFixture
} from './fixtures/bilibili-comments-shadow';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../../build/dist');
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=browserListenerScope';
const YOUTUBE_PAUSED_URL = 'https://www.youtube.com/watch?v=browserListenerScopePaused';
const BILIBILI_URL = 'https://www.bilibili.com/video/BV1browser/';

type FragmentModifierKey = 'alt' | 'meta' | 'ctrl' | 'shift';

type VideoPromptDebugCounters = {
  evaluateCount: number;
  controlButtonSyncCount: number;
  floatingPromptMountCount: number;
};

type HostShortcutCounters = {
  keydown: number;
  l: number;
  m: number;
  space: number;
};

type VideoPlaybackCounters = {
  pause: number;
  play: number;
  playEvent: number;
  paused: boolean;
};

type DelayedVideoStorageWriteController = {
  readDelayedWriteCount: () => number;
  release: () => void;
};

declare global {
  interface Window {
    __videoPlaybackCounters?: VideoPlaybackCounters;
  }
  // eslint-disable-next-line no-var
  var __delayedVideoCaptureStorageWritesForTests: DelayedVideoStorageWriteController | undefined;
}

type StoredOptionsFixture = {
  video: {
    floatingPromptEnabled: boolean;
    promptButtonLabel: string;
    promptShortcut: string;
    commentEditorAutoPause: boolean;
  };
  fragmentClipper: {
    useFootnoteFormat: boolean;
    captureContext: boolean;
    contextLength: number;
    contextMode: 'chars' | 'words';
    selectionModifierEnabled: boolean;
    selectionModifierKeys: FragmentModifierKey[];
    keyboardShortcutsEnabled: boolean;
  };
  readingSession: {
    exportMode: 'highlights' | 'full';
    highlightTheme: string;
  };
};

const testWithExtension = test.extend<{
  context: BrowserContext;
  extensionPage: Page;
}>({
  context: async ({ browserName: _browserName }, use) => {
    void _browserName;
    const userDataDir = `/tmp/video-listener-scope-${Date.now()}-${Math.random()}`;
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`]
    });

    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
  extensionPage: async ({ context }, use) => {
    const background =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15000 }));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) {
      throw new Error(`Unable to parse extension id from ${background.url()}`);
    }
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/content-orchestrator-harness.html`, {
      waitUntil: 'domcontentloaded'
    });
    await use(page);
    await page.close();
  }
});

function createOptionsFixture(
  fragment: Partial<StoredOptionsFixture['fragmentClipper']> = {},
  reading: Partial<StoredOptionsFixture['readingSession']> = {}
): StoredOptionsFixture {
  return {
    video: {
      floatingPromptEnabled: true,
      promptButtonLabel: 'Clip video',
      promptShortcut: 'Alt+V',
      commentEditorAutoPause: false
    },
    fragmentClipper: {
      useFootnoteFormat: true,
      captureContext: true,
      contextLength: 200,
      contextMode: 'chars',
      selectionModifierEnabled: false,
      selectionModifierKeys: [],
      keyboardShortcutsEnabled: true,
      ...fragment
    },
    readingSession: {
      exportMode: 'highlights',
      highlightTheme: 'gradient',
      ...reading
    }
  };
}

async function seedOptions(
  extensionPage: Page,
  options: StoredOptionsFixture = createOptionsFixture()
): Promise<void> {
  await extensionPage.evaluate(async (storedOptions) => {
    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();
    await chrome.storage.sync.set({ options: storedOptions });
  }, options);
}

async function findCurrentTabId(extensionPage: Page, url: string): Promise<number> {
  const tabId = await extensionPage.evaluate(async (targetUrl) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url === targetUrl)?.id ?? null;
  }, url);

  if (typeof tabId !== 'number') {
    throw new Error(`Unable to resolve tab id for ${url}`);
  }

  return tabId;
}

async function injectContentRuntime(extensionPage: Page, tabId: number): Promise<void> {
  await extensionPage.evaluate(async (targetTabId) => {
    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      files: ['content/index.js']
    });
  }, tabId);
}

async function readPromptCounters(
  extensionPage: Page,
  tabId: number
): Promise<VideoPromptDebugCounters> {
  const results = await extensionPage.evaluate(async (targetTabId) => {
    return await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => {
        const utils = (
          globalThis as typeof globalThis & {
            __aiobVideoPromptTestUtils?: {
              getDebugCountersForTests?: () => VideoPromptDebugCounters;
            };
          }
        ).__aiobVideoPromptTestUtils;
        return utils?.getDebugCountersForTests?.() ?? null;
      }
    });
  }, tabId);

  const counters = results[0]?.result;
  if (!counters) {
    throw new Error('Video prompt debug counters were not exposed by the content runtime.');
  }
  return counters;
}

async function readHostShortcutCounters(page: Page): Promise<HostShortcutCounters> {
  const counters = await page.evaluate(() => {
    return (
      window as typeof window & {
        __hostShortcutCounters?: HostShortcutCounters;
      }
    ).__hostShortcutCounters;
  });
  if (!counters) {
    throw new Error('Host shortcut counters were not installed in the fixture.');
  }
  return counters;
}

async function installPlaybackFixture(
  extensionPage: Page,
  tabId: number,
  initiallyPaused: boolean
): Promise<void> {
  await extensionPage.evaluate(
    async ({ targetTabId, isInitiallyPaused }) => {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: (initiallyPausedInContentWorld) => {
          const video = document.querySelector('video');
          if (!(video instanceof HTMLVideoElement)) {
            throw new Error('Missing video element for playback fixture.');
          }
          let paused = initiallyPausedInContentWorld;
          const counters = {
            pause: 0,
            play: 0,
            playEvent: 0,
            paused
          };
          Object.defineProperty(video, 'paused', {
            configurable: true,
            get: () => paused
          });
          Object.defineProperty(video, 'currentTime', {
            configurable: true,
            get: () => 42,
            set: () => undefined
          });
          Object.defineProperty(video, 'pause', {
            configurable: true,
            value: () => {
              counters.pause += 1;
              paused = true;
              counters.paused = paused;
            }
          });
          Object.defineProperty(video, 'play', {
            configurable: true,
            value: () => {
              counters.play += 1;
              paused = false;
              counters.paused = paused;
              return Promise.resolve();
            }
          });

          (
            globalThis as typeof globalThis & {
              __videoPlaybackCounters?: VideoPlaybackCounters;
              __dispatchSyntheticVideoPlayForTests?: () => void;
            }
          ).__videoPlaybackCounters = counters;
          (
            globalThis as typeof globalThis & {
              __dispatchSyntheticVideoPlayForTests?: () => void;
            }
          ).__dispatchSyntheticVideoPlayForTests = () => {
            paused = false;
            counters.paused = paused;
            counters.playEvent += 1;
            video.dispatchEvent(new Event('play', { bubbles: true }));
          };
        },
        args: [isInitiallyPaused]
      });
    },
    { targetTabId: tabId, isInitiallyPaused: initiallyPaused }
  );
}

async function readPlaybackCounters(
  extensionPage: Page,
  tabId: number
): Promise<VideoPlaybackCounters> {
  const results = await extensionPage.evaluate(async (targetTabId) => {
    return await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () =>
        (
          globalThis as typeof globalThis & {
            __videoPlaybackCounters?: VideoPlaybackCounters;
          }
        ).__videoPlaybackCounters ?? null
    });
  }, tabId);
  const counters = results[0]?.result;
  if (!counters) {
    throw new Error('Playback counters were not installed in the fixture.');
  }
  return counters;
}

async function dispatchSyntheticVideoPlay(extensionPage: Page, tabId: number): Promise<void> {
  await extensionPage.evaluate(async (targetTabId) => {
    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => {
        (
          globalThis as typeof globalThis & {
            __dispatchSyntheticVideoPlayForTests?: () => void;
          }
        ).__dispatchSyntheticVideoPlayForTests?.();
      }
    });
  }, tabId);
}

async function resetPlaybackCounters(extensionPage: Page, tabId: number): Promise<void> {
  await extensionPage.evaluate(async (targetTabId) => {
    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => {
        const counters = window.__videoPlaybackCounters;
        if (!counters) {
          throw new Error('Playback counters were not installed in the fixture.');
        }
        counters.pause = 0;
        counters.play = 0;
        counters.playEvent = 0;
      }
    });
  }, tabId);
}

async function installDelayedVideoCaptureStorageWrites(
  extensionPage: Page,
  tabId: number
): Promise<{
  release: () => Promise<void>;
  readDelayedWriteCount: () => Promise<number>;
}> {
  await extensionPage.evaluate(async (targetTabId) => {
    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => {
        type StorageSetItem = { entries?: readonly object[] } | string | number | boolean | null;
        if (globalThis.__delayedVideoCaptureStorageWritesForTests) {
          return;
        }
        const storageArea = chrome.storage.local;
        const originalSet = storageArea.set.bind(storageArea);
        let delayedWriteCount = 0;
        let pendingWrite: (() => void) | null = null;
        const isVideoCapturePayload = (value: StorageSetItem): boolean => {
          if (!value || typeof value !== 'object') {
            return false;
          }
          return Array.isArray(value.entries);
        };
        Object.defineProperty(storageArea, 'set', {
          configurable: true,
          value: (items: Record<string, StorageSetItem>, callback?: () => void) => {
            const writeItems = () => {
              if (callback) {
                void originalSet(items, callback);
                return;
              }
              void originalSet(items);
            };
            if (!Object.values(items).some(isVideoCapturePayload)) {
              writeItems();
              return;
            }
            delayedWriteCount += 1;
            pendingWrite = writeItems;
          }
        });
        globalThis.__delayedVideoCaptureStorageWritesForTests = {
          readDelayedWriteCount: () => delayedWriteCount,
          release: () => {
            const write = pendingWrite;
            pendingWrite = null;
            write?.();
          }
        };
      }
    });
  }, tabId);

  return {
    readDelayedWriteCount: async () => {
      const results = await extensionPage.evaluate(async (targetTabId) => {
        return await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          func: () =>
            globalThis.__delayedVideoCaptureStorageWritesForTests?.readDelayedWriteCount() ?? 0
        });
      }, tabId);
      return results[0]?.result ?? 0;
    },
    release: async () => {
      await extensionPage.evaluate(async (targetTabId) => {
        await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          func: () => {
            globalThis.__delayedVideoCaptureStorageWritesForTests?.release();
          }
        });
      }, tabId);
    }
  };
}

async function openFixtureWithRuntime(
  context: BrowserContext,
  extensionPage: Page,
  url: string,
  html: string,
  options?: StoredOptionsFixture
): Promise<{ page: Page; tabId: number }> {
  await seedOptions(extensionPage, options);
  await context.route(url, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: html
    })
  );

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const tabId = await findCurrentTabId(extensionPage, page.url());
  await injectContentRuntime(extensionPage, tabId);
  return { page, tabId };
}

function youtubeFixtureHtml(): string {
  return `<!doctype html>
    <html>
      <head><title>YouTube Listener Scope Fixture</title></head>
      <body>
        <main>
          <h1 id="video-title">Browser listener scope video</h1>
          <div id="movie_player" class="html5-video-player">
            <video></video>
            <div class="ytp-right-controls"></div>
          </div>
          <section id="comment">
            <p id="selectable">Browser selected fragment text</p>
          </section>
        </main>
        <script>
          window.__hostShortcutCounters = { keydown: 0, l: 0, m: 0, space: 0 };
          document.addEventListener('keydown', (event) => {
            window.__hostShortcutCounters.keydown += 1;
            if (event.key === 'l') window.__hostShortcutCounters.l += 1;
            if (event.key === 'm') window.__hostShortcutCounters.m += 1;
            if (event.key === ' ') window.__hostShortcutCounters.space += 1;
          });
        </script>
      </body>
    </html>`;
}

function bilibiliFixtureHtml(): string {
  return `<!doctype html>
    <html>
      <head><title>Bilibili Listener Scope Fixture</title></head>
      <body>
        <main>
          <h1 class="video-title">Browser listener scope Bilibili video</h1>
          <div class="bpx-player-container">
            <video></video>
            <div class="bpx-player-control-bottom-right"></div>
            <div class="bpx-player-render-dm-wrap"></div>
          </div>
          <aside class="recommendations"></aside>
          <section id="comment">${buildBilibiliCommentsShadowFixture()}</section>
        </main>
      </body>
    </html>`;
}

async function selectFixtureText(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = document.getElementById('selectable')?.firstChild;
    if (!target) {
      throw new Error('Missing selectable fixture text.');
    }
    const range = document.createRange();
    range.setStart(target, 0);
    range.setEnd(target, target.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}

async function submitControlBarNote(page: Page, note: string): Promise<void> {
  await page.locator('[data-aiob-video-control-bar-button="true"]').click();
  const input = page.locator('[data-aiob-video-control-bar-note-input="true"]');
  await expect(input).toBeVisible();
  await input.fill(note);
  await input.press('Enter');
}

async function openVideoPanelFromControlBar(
  page: Page,
  note = 'Browser control bar note'
): Promise<void> {
  await submitControlBarNote(page, note);
  await expect(page.locator('[data-stitch-surface="video"]')).toBeVisible({ timeout: 10000 });
}

async function expandVideoPanel(page: Page): Promise<void> {
  const surfaceWindow = page.locator('.video-surface-window').first();
  await expect(surfaceWindow).toBeVisible();
  const isCollapsed = await surfaceWindow.evaluate((element) =>
    element.classList.contains('is-collapsed')
  );
  if (isCollapsed) {
    await surfaceWindow.click();
    await expect(surfaceWindow).not.toHaveClass(/is-collapsed/);
  }
}

async function dragSelectBilibiliRichText(page: Page, fixtureId: string): Promise<void> {
  const content = page.locator(`bili-rich-text[data-fixture="${fixtureId}"] #contents`).first();
  await expect(content).toBeVisible();
  const box = await content.boundingBox();
  if (!box) {
    throw new Error(`Missing visible Bilibili rich text fixture: ${fixtureId}`);
  }

  const y = box.y + box.height / 2;
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, y, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
}

async function countBilibiliRichTextHighlights(page: Page, fixtureId: string): Promise<number> {
  return await page.evaluate((targetFixtureId) => {
    function findRichTextHost(root: ParentNode): HTMLElement | null {
      const direct = root.querySelector<HTMLElement>(
        `bili-rich-text[data-fixture="${targetFixtureId}"]`
      );
      if (direct) {
        return direct;
      }
      const elements = Array.from(root.querySelectorAll<HTMLElement>('*'));
      for (const element of elements) {
        if (!element.shadowRoot) {
          continue;
        }
        const nested = findRichTextHost(element.shadowRoot);
        if (nested) {
          return nested;
        }
      }
      return null;
    }

    const richText = findRichTextHost(document);
    return richText?.shadowRoot?.querySelectorAll('mark[data-video-fragment-id]').length ?? 0;
  }, fixtureId);
}

async function isBilibiliRichTextHighlightVisible(page: Page, fixtureId: string): Promise<boolean> {
  return await page.evaluate((targetFixtureId) => {
    function findRichTextHost(root: ParentNode): HTMLElement | null {
      const direct = root.querySelector<HTMLElement>(
        `bili-rich-text[data-fixture="${targetFixtureId}"]`
      );
      if (direct) {
        return direct;
      }
      const elements = Array.from(root.querySelectorAll<HTMLElement>('*'));
      for (const element of elements) {
        if (!element.shadowRoot) {
          continue;
        }
        const nested = findRichTextHost(element.shadowRoot);
        if (nested) {
          return nested;
        }
      }
      return null;
    }

    const richText = findRichTextHost(document);
    const mark = richText?.shadowRoot?.querySelector<HTMLElement>('mark[data-video-fragment-id]');
    if (!mark) {
      return false;
    }
    const style = getComputedStyle(mark);
    return style.backgroundImage !== 'none' || style.backgroundColor !== 'rgba(0, 0, 0, 0)';
  }, fixtureId);
}

testWithExtension.describe('video listener scope browser runtime', () => {
  testWithExtension.slow();
  testWithExtension.setTimeout(60000);

  testWithExtension(
    'opens real Video Mode from a YouTube-like control-bar note',
    async ({ context, extensionPage }) => {
      const { page } = await openFixtureWithRuntime(
        context,
        extensionPage,
        YOUTUBE_URL,
        youtubeFixtureHtml()
      );

      const logo = page.locator('[data-aiob-video-control-bar-button="true"]');
      await expect(logo).toHaveCount(1);
      await openVideoPanelFromControlBar(page, 'Browser control-bar note');
      await expect(logo).toHaveCount(1);
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);
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
      await expect(page.locator('[data-aiob-video-control-bar-button="true"]')).toHaveCount(1);
      await expect(page.locator('[data-stitch-surface="video"]')).toHaveCount(0);
      await expect(page.locator('#aiob-video-floating-prompt')).toHaveCount(0);
      expect(after.evaluateCount).toBe(before.evaluateCount);
      expect(after.controlButtonSyncCount).toBe(before.controlButtonSyncCount);
      expect(after.floatingPromptMountCount).toBe(before.floatingPromptMountCount);
    }
  );

  testWithExtension(
    'keeps panel note input keys isolated from YouTube-like host shortcuts',
    async ({ context, extensionPage }) => {
      const { page } = await openFixtureWithRuntime(
        context,
        extensionPage,
        YOUTUBE_URL,
        youtubeFixtureHtml()
      );

      await openVideoPanelFromControlBar(page, '');
      await expandVideoPanel(page);
      const before = await readHostShortcutCounters(page);

      await page.locator('[data-action-id="video:add-note"]').click();
      const input = page.locator('[data-capture-input]').first();
      await expect(input).toBeVisible();
      await input.click();
      await page.keyboard.type('lm test');

      const after = await readHostShortcutCounters(page);
      expect(after.l).toBe(before.l);
      expect(after.m).toBe(before.m);
      expect(after.space).toBe(before.space);
      await expect(input).toHaveValue('lm test');
    }
  );

  testWithExtension(
    'keeps playback paused while the control-bar note input is active and restores only playing videos',
    async ({ context, extensionPage }) => {
      const { page: playingPage, tabId: playingTabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        YOUTUBE_URL,
        youtubeFixtureHtml()
      );
      await installPlaybackFixture(extensionPage, playingTabId, false);

      await playingPage.locator('[data-aiob-video-control-bar-button="true"]').click();
      const playingInput = playingPage.locator('[data-aiob-video-control-bar-note-input="true"]');
      await expect(playingInput).toBeFocused();
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

      await playingInput.fill('Playing note');
      await playingInput.press('Enter');
      await expect
        .poll(() =>
          readPlaybackCounters(extensionPage, playingTabId).then((counters) => counters.play)
        )
        .toBe(1);

      const { page: pausedPage, tabId: pausedTabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        YOUTUBE_PAUSED_URL,
        youtubeFixtureHtml()
      );
      await installPlaybackFixture(extensionPage, pausedTabId, true);
      await submitControlBarNote(pausedPage, 'Paused note');
      const pausedCounters = await readPlaybackCounters(extensionPage, pausedTabId);
      expect(pausedCounters.pause).toBe(0);
      expect(pausedCounters.play).toBe(0);
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
      await expect(playingInput).toBeVisible();
      await expect(playingInput).toBeFocused();
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
      await expect(pausedInput).toBeVisible();
      await pausedInput.fill('Paused panel note');
      await pausedInput.press('Enter');
      await pausedPage.waitForTimeout(100);

      const pausedCounters = await readPlaybackCounters(extensionPage, pausedTabId);
      expect(pausedCounters.pause).toBe(0);
      expect(pausedCounters.play).toBe(0);
    }
  );

  testWithExtension(
    'keeps selection capture modifier-gated through the real session',
    async ({ context, extensionPage }) => {
      const { page } = await openFixtureWithRuntime(
        context,
        extensionPage,
        YOUTUBE_URL,
        youtubeFixtureHtml(),
        createOptionsFixture({
          selectionModifierEnabled: true,
          selectionModifierKeys: ['shift']
        })
      );

      await openVideoPanelFromControlBar(page, 'Seed modifier capture');
      await expandVideoPanel(page);
      const initialCount = await page.locator('[data-role="capture-item"]').count();

      await selectFixtureText(page);
      await page.evaluate(() => {
        document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
      });
      await page.waitForTimeout(100);
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(initialCount);

      await page.keyboard.down('Shift');
      await selectFixtureText(page);
      await page.evaluate(() => {
        document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
        document.dispatchEvent(
          new MouseEvent('mouseup', { bubbles: true, button: 0, shiftKey: true })
        );
      });
      await page.keyboard.up('Shift');

      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(initialCount + 1);
      await expect(page.locator('[data-role="capture-item"]').last()).toContainText(
        'Browser selected fragment text'
      );
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
});
