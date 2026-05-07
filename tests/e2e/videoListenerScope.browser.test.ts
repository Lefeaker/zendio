import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../../build/dist');
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=browserListenerScope';
const BILIBILI_URL = 'https://www.bilibili.com/video/BV1browser/';

type FragmentModifierKey = 'alt' | 'meta' | 'ctrl' | 'shift';

type VideoPromptDebugCounters = {
  evaluateCount: number;
  controlButtonSyncCount: number;
  floatingPromptMountCount: number;
};

type StoredOptionsFixture = {
  video: {
    floatingPromptEnabled: boolean;
    promptButtonLabel: string;
    promptShortcut: string;
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
  fragment: Partial<StoredOptionsFixture['fragmentClipper']> = {}
): StoredOptionsFixture {
  return {
    video: {
      floatingPromptEnabled: true,
      promptButtonLabel: 'Clip video',
      promptShortcut: 'Alt+V'
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
      highlightTheme: 'gradient'
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
          <section id="comment"></section>
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

testWithExtension.describe('video listener scope browser runtime', () => {
  testWithExtension.slow();
  testWithExtension.setTimeout(60000);

  testWithExtension(
    'opens real Video Mode from one YouTube-like logo',
    async ({ context, extensionPage }) => {
      const { page } = await openFixtureWithRuntime(
        context,
        extensionPage,
        YOUTUBE_URL,
        youtubeFixtureHtml()
      );

      const logo = page.locator('[data-aiob-video-control-bar-button="true"]');
      await expect(logo).toHaveCount(1);
      await logo.click();
      await expect(page.locator('[data-stitch-surface="video"]')).toBeVisible();
      await expect(logo).toHaveCount(1);
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

      await page.locator('[data-aiob-video-control-bar-button="true"]').click();
      await expect(page.locator('[data-stitch-surface="video"]')).toBeVisible();
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(0);

      await selectFixtureText(page);
      await page.evaluate(() => {
        document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
      });
      await page.waitForTimeout(100);
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(0);

      await page.keyboard.down('Shift');
      await selectFixtureText(page);
      await page.evaluate(() => {
        document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
        document.dispatchEvent(
          new MouseEvent('mouseup', { bubbles: true, button: 0, shiftKey: true })
        );
      });
      await page.keyboard.up('Shift');

      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);
      await expect(page.locator('[data-role="capture-summary"]')).toContainText(
        'Browser selected fragment text'
      );
    }
  );
});
