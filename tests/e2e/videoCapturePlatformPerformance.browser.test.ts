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
const BILIBILI_URL = 'https://www.bilibili.com/video/BV1capturePerformance/';
const SESSION_DRAFT_STORAGE_PREFIX = 'aiob.sessionDraft';

type FragmentModifierKey = 'alt' | 'meta' | 'ctrl' | 'shift';

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

type BilibiliFixtureCounters = {
  highlightInsertions: Record<string, number>;
};

type ShadowListenerProbeCounts = {
  shadowListenerAdds: Record<string, number>;
  shadowListenerRemoves: Record<string, number>;
};

type StartVideoModeResponse = {
  success: boolean;
  alreadyActive?: boolean;
};

const COMMENT_FIXTURE_IDS = [
  'comments',
  'thread',
  'main-comment',
  'reply-comment',
  'main-rich-text',
  'reply-rich-text'
] as const;

const testWithExtension = test.extend<{
  context: BrowserContext;
  extensionPage: Page;
}>({
  context: async ({ browserName: _browserName }, use) => {
    void _browserName;
    const userDataDir = `/tmp/video-capture-platform-performance-${Date.now()}-${Math.random()}`;
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

function createOptionsFixture(): StoredOptionsFixture {
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
      selectionModifierEnabled: true,
      selectionModifierKeys: ['shift'],
      keyboardShortcutsEnabled: true
    },
    readingSession: {
      exportMode: 'highlights',
      highlightTheme: 'neonOrange'
    }
  };
}

async function seedOptions(extensionPage: Page, options: StoredOptionsFixture): Promise<void> {
  await extensionPage.evaluate(async (storageKeyPrefix) => {
    const storage = await chrome.storage.local.get(null);
    const keys = Object.keys(storage).filter((key) => key.startsWith(storageKeyPrefix));
    if (keys.length > 0) {
      await chrome.storage.local.remove(keys);
    }
  }, SESSION_DRAFT_STORAGE_PREFIX);
  await extensionPage.evaluate(async (storedOptions) => {
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

async function installShadowListenerProbe(extensionPage: Page, tabId: number): Promise<void> {
  await extensionPage.evaluate(async (targetTabId) => {
    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => {
        const runtimeGlobal = globalThis as typeof globalThis & {
          __aiobP04ShadowListenerProbeInstalled?: boolean;
          __aiobP04ShadowListenerProbe?: ShadowListenerProbeCounts;
        };
        if (runtimeGlobal.__aiobP04ShadowListenerProbeInstalled) {
          return;
        }
        runtimeGlobal.__aiobP04ShadowListenerProbeInstalled = true;
        runtimeGlobal.__aiobP04ShadowListenerProbe = {
          shadowListenerAdds: {},
          shadowListenerRemoves: {}
        };

        const readFixtureKey = (root: ShadowRoot): string | null => {
          const host = root.host;
          return host instanceof HTMLElement ? (host.dataset.fixture ?? null) : null;
        };
        const bumpCounter = (bucket: Record<string, number>, key: string): void => {
          bucket[key] = (bucket[key] ?? 0) + 1;
        };
        const originalAddEventListener = ShadowRoot.prototype.addEventListener;
        const originalRemoveEventListener = ShadowRoot.prototype.removeEventListener;

        Object.defineProperty(ShadowRoot.prototype, 'addEventListener', {
          configurable: true,
          value: function addEventListener(
            this: ShadowRoot,
            type: string,
            listener: EventListenerOrEventListenerObject | null,
            options?: AddEventListenerOptions | boolean
          ) {
            const fixtureKey = readFixtureKey(this);
            if (fixtureKey) {
              bumpCounter(
                runtimeGlobal.__aiobP04ShadowListenerProbe!.shadowListenerAdds,
                `${fixtureKey}:${type}`
              );
            }
            return originalAddEventListener.call(
              this,
              type,
              listener as EventListenerOrEventListenerObject,
              options
            );
          }
        });
        Object.defineProperty(ShadowRoot.prototype, 'removeEventListener', {
          configurable: true,
          value: function removeEventListener(
            this: ShadowRoot,
            type: string,
            listener: EventListenerOrEventListenerObject | null,
            options?: EventListenerOptions | boolean
          ) {
            const fixtureKey = readFixtureKey(this);
            if (fixtureKey) {
              bumpCounter(
                runtimeGlobal.__aiobP04ShadowListenerProbe!.shadowListenerRemoves,
                `${fixtureKey}:${type}`
              );
            }
            return originalRemoveEventListener.call(
              this,
              type,
              listener as EventListenerOrEventListenerObject,
              options
            );
          }
        });
      }
    });
  }, tabId);
}

async function readShadowListenerProbe(
  extensionPage: Page,
  tabId: number
): Promise<ShadowListenerProbeCounts> {
  const results = await extensionPage.evaluate(async (targetTabId) => {
    return await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => {
        const runtimeGlobal = globalThis as typeof globalThis & {
          __aiobP04ShadowListenerProbe?: ShadowListenerProbeCounts;
        };
        return runtimeGlobal.__aiobP04ShadowListenerProbe ?? null;
      }
    });
  }, tabId);

  const probe = results[0]?.result;
  if (!probe) {
    throw new Error('Shadow listener probe was not installed in the content runtime.');
  }
  return probe;
}

async function startVideoMode(extensionPage: Page, tabId: number): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await extensionPage.evaluate(
        async (targetTabId): Promise<StartVideoModeResponse> => {
          const result: unknown = await chrome.tabs.sendMessage(targetTabId, {
            action: 'startVideoMode'
          });
          if (result && typeof result === 'object' && 'success' in result) {
            const payload = result as { success?: unknown; alreadyActive?: unknown };
            return {
              success: payload.success === true,
              ...(payload.alreadyActive === true ? { alreadyActive: true } : {})
            };
          }
          return { success: false };
        },
        tabId
      );

      expect(response.success).toBe(true);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Receiving end does not exist') || attempt === 11) {
        throw error;
      }
      await extensionPage.waitForTimeout(250);
    }
  }
}

async function openFixtureWithRuntime(
  context: BrowserContext,
  extensionPage: Page,
  url: string,
  html: string
): Promise<{ page: Page; tabId: number }> {
  await seedOptions(extensionPage, createOptionsFixture());
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
  await installShadowListenerProbe(extensionPage, tabId);
  await injectContentRuntime(extensionPage, tabId);
  return { page, tabId };
}

function bilibiliFixtureHtml(): string {
  return `<!doctype html>
    <html>
      <head><title>Bilibili Capture Platform Performance Fixture</title></head>
      <body>
        <main>
          <h1 class="video-title">Browser capture platform performance Bilibili video</h1>
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

async function countShadowHighlights(page: Page, fixtureId: string): Promise<number> {
  return await page.evaluate((targetFixtureId) => {
    function findHost(root: ParentNode): HTMLElement | null {
      const direct = root.querySelector<HTMLElement>(`[data-fixture="${targetFixtureId}"]`);
      if (direct) {
        return direct;
      }
      for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
        if (!element.shadowRoot) {
          continue;
        }
        const nested = findHost(element.shadowRoot);
        if (nested) {
          return nested;
        }
      }
      return null;
    }

    const host = findHost(document);
    return host?.shadowRoot?.querySelectorAll('mark[data-video-fragment-id]').length ?? 0;
  }, fixtureId);
}

async function readFixtureCounters(page: Page): Promise<BilibiliFixtureCounters> {
  return await page.evaluate(() => {
    const counters = (
      window as typeof window & {
        __bilibiliFixtureCounters?: BilibiliFixtureCounters;
      }
    ).__bilibiliFixtureCounters;
    if (!counters) {
      throw new Error('Bilibili fixture counters were not installed.');
    }
    return counters;
  });
}

function sumListenerAdds(
  counters: ShadowListenerProbeCounts,
  fixtureIds: readonly string[],
  eventNames = ['selectionchange', 'mousedown', 'mouseup', 'touchend', 'keyup']
): number {
  return fixtureIds.reduce((total, fixtureId) => {
    return (
      total +
      eventNames.reduce((eventTotal, eventName) => {
        return eventTotal + (counters.shadowListenerAdds[`${fixtureId}:${eventName}`] ?? 0);
      }, 0)
    );
  }, 0);
}

function readHighlightInsertions(counters: BilibiliFixtureCounters, fixtureId: string): number {
  return counters.highlightInsertions[fixtureId] ?? 0;
}

async function churnBilibiliRuntime(page: Page): Promise<void> {
  await page.evaluate(() => {
    const danmakuRoot = document.querySelector('.bpx-player-render-dm-wrap');
    const commentRoot = document.getElementById('comment');
    for (let index = 0; index < 200; index += 1) {
      const dm = document.createElement('span');
      dm.className = 'bili-danmaku-x-dm';
      dm.textContent = `runtime-dm-${index}`;
      danmakuRoot?.appendChild(dm);
    }
    for (let index = 0; index < 40; index += 1) {
      const noise = document.createElement('div');
      noise.className = `comment-transient-${index}`;
      noise.textContent = `comment-noise-${index}`;
      commentRoot?.appendChild(noise);
      if (index % 2 === 0) {
        noise.remove();
      }
    }
  });
}

testWithExtension(
  'keeps Bilibili shadow listeners, restore counts, and scoped-root ownership stable under churn',
  async ({ context, extensionPage }) => {
    const { page, tabId } = await openFixtureWithRuntime(
      context,
      extensionPage,
      `${BILIBILI_URL}?p04=platform-performance`,
      bilibiliFixtureHtml()
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
    await expect.poll(() => countShadowHighlights(page, 'main-rich-text')).toBe(1);
    await expect.poll(() => countShadowHighlights(page, 'unrelated-shadow-host')).toBe(0);

    const afterSelectionCounters = await readFixtureCounters(page);
    const afterSelectionListenerProbe = await readShadowListenerProbe(extensionPage, tabId);
    const initialCommentListenerAdds = sumListenerAdds(
      afterSelectionListenerProbe,
      COMMENT_FIXTURE_IDS
    );
    expect(initialCommentListenerAdds).toBeGreaterThan(0);
    expect(sumListenerAdds(afterSelectionListenerProbe, ['unrelated-shadow-host'])).toBe(0);
    expect(readHighlightInsertions(afterSelectionCounters, 'main-rich-text')).toBe(1);
    expect(readHighlightInsertions(afterSelectionCounters, 'unrelated-shadow-host')).toBe(0);

    await churnBilibiliRuntime(page);
    await page.waitForTimeout(350);
    await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);
    await expect.poll(() => countShadowHighlights(page, 'main-rich-text')).toBe(1);
    await expect.poll(() => countShadowHighlights(page, 'unrelated-shadow-host')).toBe(0);

    const afterChurnCounters = await readFixtureCounters(page);
    const afterChurnListenerProbe = await readShadowListenerProbe(extensionPage, tabId);
    expect(sumListenerAdds(afterChurnListenerProbe, COMMENT_FIXTURE_IDS)).toBe(
      initialCommentListenerAdds
    );
    expect(sumListenerAdds(afterChurnListenerProbe, ['unrelated-shadow-host'])).toBe(0);
    expect(readHighlightInsertions(afterChurnCounters, 'main-rich-text')).toBe(1);
    expect(readHighlightInsertions(afterChurnCounters, 'unrelated-shadow-host')).toBe(0);

    await dragSelectBilibiliRichText(page, 'reply-rich-text');
    await expect(page.locator('[data-role="capture-item"]')).toHaveCount(2);
    await expect(page.locator('[data-role="capture-item"]').last()).toContainText(
      BILIBILI_REPLY_COMMENT_TEXT
    );
    await expect.poll(() => countShadowHighlights(page, 'reply-rich-text')).toBe(1);
  }
);
