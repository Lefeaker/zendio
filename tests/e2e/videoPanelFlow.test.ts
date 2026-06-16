import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo
} from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VIDEO_SCREENSHOT_CACHE_LEGACY_STORAGE_INDEX_KEY,
  VIDEO_SCREENSHOT_CACHE_LEGACY_STORAGE_KEY_PREFIX,
  readVideoScreenshotCacheIndexedDbSummary
} from './utils/videoScreenshotCacheIndexedDb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../../build/dist');
const EXTENSION_HARNESS_PATH = 'content-orchestrator-harness.html';
const SESSION_DRAFT_STORAGE_PREFIX = 'aiob.sessionDraft';
const SESSION_DRAFT_INDEX_KEY = `${SESSION_DRAFT_STORAGE_PREFIX}.index.v1`;
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=p07BrowserVideoFlow';

type ServiceWorker = ReturnType<BrowserContext['serviceWorkers']>[number];

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
    selectionModifierKeys: Array<'alt' | 'meta' | 'ctrl' | 'shift'>;
    keyboardShortcutsEnabled: boolean;
  };
  readingSession: {
    exportMode: 'highlights' | 'full';
    highlightTheme: string;
  };
};

type VideoDraftEntry = {
  key: string;
  pageUrl: string | null;
  captureCount: number;
  requestedScreenshotCount: number;
  screenshotRefCount: number;
  containsInlineScreenshotPayload: boolean;
  captureComments: string[];
  commentDrafts: Record<string, string>;
};

type VideoStorageSummary = {
  drafts: VideoDraftEntry[];
  cacheEntryCount: number;
  cacheIndexEntryCount: number;
  cacheKeys: string[];
  legacyStorageCacheEntryCount: number;
};

type VideoProbeState = {
  toBlobCalls: number;
  toDataUrlCalls: number;
  drawImageCalls: number;
  currentTimeWrites: number;
  pauseCalls: number;
  playCalls: number;
};

type ExportCaptureState = {
  installed: boolean;
  lastVideoClip: ExportedVideoClip;
};

type ExportedVideoClip = {
  title?: string;
  attachments?: Array<{
    fileName?: string;
    mimeType?: string;
    content?: {
      encoding?: string;
      data?: string;
      byteLength?: number;
    };
    dataUrl?: string;
  }>;
} | null;

type StartVideoModeResponse = {
  success: boolean;
};

type VideoDraftCapture = {
  screenshotRequested?: boolean;
  screenshotRef?: unknown;
  screenshot?: unknown;
  dataUrl?: unknown;
  content?: unknown;
  comment?: string;
};

type VideoDraftEnvelope = {
  pageUrl?: string;
  payload?: {
    captures?: VideoDraftCapture[];
    commentDrafts?: Record<string, string>;
  };
};

declare global {
  interface Window {
    __aiobP07VideoClipCapture?: ExportCaptureState;
  }

  // eslint-disable-next-line no-var
  var __aiobP07VideoProbe: VideoProbeState | undefined;
  // eslint-disable-next-line no-var
  var __aiobP07CanvasPatched: boolean | undefined;
}

const testWithExtension = test.extend<{
  context: BrowserContext;
  background: ServiceWorker;
  extensionPage: Page;
}>({
  context: async ({ browserName: _browserName }, use, testInfo) => {
    void _browserName;
    const userDataDir = `/tmp/p07-video-panel-${Date.now()}-${Math.random()}`;
    const context = await runStage(testInfo, 'launch context', () =>
      chromium.launchPersistentContext(userDataDir, {
        headless: true,
        channel: 'chromium',
        args: [
          `--disable-extensions-except=${EXTENSION_PATH}`,
          `--load-extension=${EXTENSION_PATH}`
        ]
      })
    );

    try {
      await use(context);
    } finally {
      await runStage(testInfo, 'close context', () => context.close());
    }
  },
  background: async ({ context }, use, testInfo) => {
    let background = context.serviceWorkers()[0];
    if (!background) {
      background = await runStage(testInfo, 'wait service worker', () =>
        context.waitForEvent('serviceworker', { timeout: 15000 })
      );
    } else {
      logStage(testInfo, 'reuse service worker', background.url());
    }
    await use(background);
  },
  extensionPage: async ({ context, background }, use, testInfo) => {
    const extensionId = await runStage(testInfo, 'resolve extension id', () => {
      const backgroundUrl = background.url();
      const resolved = backgroundUrl.split('/')[2];
      if (!resolved) {
        throw new Error(`Unable to parse extension id from ${backgroundUrl}`);
      }
      return Promise.resolve(resolved);
    });
    const page = await runStage(testInfo, 'open extension harness page', () => context.newPage());
    await runStage(testInfo, 'goto extension harness page', () =>
      page.goto(`chrome-extension://${extensionId}/${EXTENSION_HARNESS_PATH}`, {
        waitUntil: 'domcontentloaded'
      })
    );

    try {
      await use(page);
    } finally {
      await runStage(testInfo, 'close extension harness page', () => page.close());
    }
  }
});

function logStage(testInfo: TestInfo, stage: string, detail?: string): void {
  const suffix = detail ? ` :: ${detail}` : '';
  console.log(`[video-panel][${testInfo.title}] ${stage}${suffix}`);
}

async function runStage<T>(
  testInfo: TestInfo,
  stage: string,
  action: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  logStage(testInfo, `START ${stage}`);
  try {
    const result = await action();
    logStage(testInfo, `OK ${stage}`, `${Date.now() - startedAt}ms`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStage(testInfo, `FAIL ${stage}`, `${Date.now() - startedAt}ms :: ${message}`);
    throw error;
  }
}

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
      selectionModifierEnabled: false,
      selectionModifierKeys: [],
      keyboardShortcutsEnabled: true
    },
    readingSession: {
      exportMode: 'highlights',
      highlightTheme: 'gradient'
    }
  };
}

async function clearSessionDraftStorage(extensionPage: Page, testInfo: TestInfo): Promise<void> {
  await runStage(testInfo, 'clear video session drafts', async () => {
    await extensionPage.evaluate(async (storageKeyPrefix) => {
      const storage = await chrome.storage.local.get(null);
      const keys = Object.keys(storage).filter((key) => key.startsWith(storageKeyPrefix));
      if (keys.length > 0) {
        await chrome.storage.local.remove(keys);
      }
    }, SESSION_DRAFT_STORAGE_PREFIX);
  });
}

async function seedOptions(
  extensionPage: Page,
  testInfo: TestInfo,
  options: StoredOptionsFixture = createOptionsFixture()
): Promise<void> {
  await clearSessionDraftStorage(extensionPage, testInfo);
  await runStage(testInfo, 'seed extension options', async () => {
    await extensionPage.evaluate(async (storedOptions) => {
      await chrome.storage.sync.set({ options: storedOptions });
    }, options);
  });
}

async function installExportCaptureListener(
  extensionPage: Page,
  testInfo: TestInfo
): Promise<void> {
  await runStage(testInfo, 'install export capture listener', async () => {
    await extensionPage.evaluate(() => {
      const captureState = (window.__aiobP07VideoClipCapture ?? {
        installed: false,
        lastVideoClip: null
      }) satisfies ExportCaptureState;
      window.__aiobP07VideoClipCapture = captureState;
      captureState.lastVideoClip = null;
      if (!captureState.installed) {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
          const isVideoClipRuntimeMessage = (
            candidate: unknown
          ): candidate is { type: 'videoClip'; data?: ExportedVideoClip } =>
            typeof candidate === 'object' &&
            candidate !== null &&
            'type' in candidate &&
            candidate.type === 'videoClip';

          if (isVideoClipRuntimeMessage(message)) {
            captureState.lastVideoClip = message.data ?? null;
            sendResponse({ success: true });
            return true;
          }
          return undefined;
        });
        captureState.installed = true;
      }
    });
  });
}

async function readCapturedVideoClip(extensionPage: Page): Promise<ExportedVideoClip> {
  return extensionPage.evaluate(() => {
    return window.__aiobP07VideoClipCapture?.lastVideoClip ?? null;
  });
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

async function injectContentRuntime(
  extensionPage: Page,
  tabId: number,
  testInfo: TestInfo
): Promise<void> {
  await runStage(testInfo, `inject content runtime for tab ${tabId}`, async () => {
    await extensionPage.evaluate(async (targetTabId) => {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        files: ['content/index.js']
      });
    }, tabId);
  });
}

async function installVideoProbe(
  extensionPage: Page,
  tabId: number,
  testInfo: TestInfo
): Promise<void> {
  await runStage(testInfo, `install video probe for tab ${tabId}`, async () => {
    await extensionPage.evaluate(async (targetTabId) => {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: () => {
          const video = document.querySelector('video');
          if (!(video instanceof HTMLVideoElement)) {
            throw new Error('Missing video element for P07 video probe.');
          }

          const probe = (globalThis.__aiobP07VideoProbe = {
            toBlobCalls: 0,
            toDataUrlCalls: 0,
            drawImageCalls: 0,
            currentTimeWrites: 0,
            pauseCalls: 0,
            playCalls: 0
          });

          let currentTime = 42;
          Object.defineProperty(video, 'currentTime', {
            configurable: true,
            get: () => currentTime,
            set: (value: number) => {
              if (Number.isFinite(value)) {
                currentTime = value;
              }
              probe.currentTimeWrites += 1;
              queueMicrotask(() => {
                video.dispatchEvent(new Event('seeked', { bubbles: true }));
              });
            }
          });
          Object.defineProperty(video, 'videoWidth', {
            configurable: true,
            get: () => 320
          });
          Object.defineProperty(video, 'videoHeight', {
            configurable: true,
            get: () => 180
          });

          let paused = true;
          Object.defineProperty(video, 'paused', {
            configurable: true,
            get: () => paused
          });
          Object.defineProperty(video, 'pause', {
            configurable: true,
            value: () => {
              paused = true;
              probe.pauseCalls += 1;
            }
          });
          Object.defineProperty(video, 'play', {
            configurable: true,
            value: () => {
              paused = false;
              probe.playCalls += 1;
              return Promise.resolve();
            }
          });

          if (!globalThis.__aiobP07CanvasPatched) {
            Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
              configurable: true,
              value: function getContext(type: string) {
                if (type !== '2d') {
                  return null;
                }
                return {
                  drawImage: () => {
                    probe.drawImageCalls += 1;
                  }
                };
              }
            });
            Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
              configurable: true,
              value: (callback: (blob: Blob | null) => void) => {
                probe.toBlobCalls += 1;
                callback(new Blob(['fake-screenshot'], { type: 'image/jpeg' }));
              }
            });
            Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
              configurable: true,
              value: () => {
                probe.toDataUrlCalls += 1;
                return 'data:image/jpeg;base64,ZmFrZS1zY3JlZW5zaG90';
              }
            });
            globalThis.__aiobP07CanvasPatched = true;
          }
        }
      });
    }, tabId);
  });
}

async function readVideoProbe(extensionPage: Page, tabId: number): Promise<VideoProbeState> {
  const results = await extensionPage.evaluate(async (targetTabId) => {
    return await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => globalThis.__aiobP07VideoProbe ?? null
    });
  }, tabId);

  const probe = results[0]?.result;
  if (!probe) {
    throw new Error('Video probe was not installed in the content runtime.');
  }
  return probe;
}

async function resetVideoProbe(
  extensionPage: Page,
  tabId: number,
  testInfo: TestInfo
): Promise<void> {
  await runStage(testInfo, `reset video probe for tab ${tabId}`, async () => {
    await extensionPage.evaluate(async (targetTabId) => {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: () => {
          const probe = globalThis.__aiobP07VideoProbe;
          if (!probe) {
            throw new Error('Video probe was not installed in the content runtime.');
          }
          probe.toBlobCalls = 0;
          probe.toDataUrlCalls = 0;
          probe.drawImageCalls = 0;
          probe.currentTimeWrites = 0;
          probe.pauseCalls = 0;
          probe.playCalls = 0;
        }
      });
    }, tabId);
  });
}

async function startVideoMode(
  extensionPage: Page,
  tabId: number,
  testInfo: TestInfo
): Promise<void> {
  const result = await runStage<StartVideoModeResponse>(
    testInfo,
    `start video mode for tab ${tabId}`,
    () =>
      extensionPage.evaluate(async (targetTabId): Promise<StartVideoModeResponse> => {
        const response = (await chrome.tabs.sendMessage(targetTabId, {
          action: 'startVideoMode'
        })) as unknown;
        if (typeof response === 'object' && response !== null && 'success' in response) {
          const success = response.success === true;
          return { success };
        }
        return { success: false };
      }, tabId)
  );

  expect(result).toMatchObject({ success: true });
}

async function simulateVisibilityRoundTrip(
  extensionPage: Page,
  tabId: number,
  testInfo: TestInfo
): Promise<void> {
  await runStage(testInfo, `simulate visibility round trip for tab ${tabId}`, async () => {
    await extensionPage.evaluate(async (targetTabId) => {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: () => {
          const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
          const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');

          Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => true
          });
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'hidden'
          });
          document.dispatchEvent(new Event('visibilitychange'));
          window.dispatchEvent(new Event('pagehide'));

          if (hiddenDescriptor) {
            Object.defineProperty(document, 'hidden', hiddenDescriptor);
          } else {
            Reflect.deleteProperty(document, 'hidden');
          }
          if (visibilityDescriptor) {
            Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
          } else {
            Reflect.deleteProperty(document, 'visibilityState');
          }
          document.dispatchEvent(new Event('visibilitychange'));
        }
      });
    }, tabId);
  });
}

async function readVideoStorageSummary(extensionPage: Page): Promise<VideoStorageSummary> {
  const [cacheSummary, storageSummary] = await Promise.all([
    readVideoScreenshotCacheIndexedDbSummary(extensionPage),
    extensionPage.evaluate(
      async ({ storageKeyPrefix, indexKey, legacyCacheKeyPrefix, legacyCacheIndexKey }) => {
        const storage = await chrome.storage.local.get(null);
        const drafts = Object.entries(storage)
          .filter(([key]) => key.startsWith(storageKeyPrefix) && key !== indexKey)
          .map(([key, value]) => {
            const envelope: VideoDraftEnvelope | undefined =
              typeof value === 'object' && value !== null
                ? (value as VideoDraftEnvelope)
                : undefined;
            const captures = envelope?.payload?.captures ?? [];
            const captureComments = captures
              .map((capture) => capture.comment ?? '')
              .filter((comment) => comment.length > 0);
            const commentDrafts = envelope?.payload?.commentDrafts ?? {};
            return {
              key,
              pageUrl: envelope?.pageUrl ?? null,
              captureCount: captures.length,
              requestedScreenshotCount: captures.filter(
                (capture) => capture.screenshotRequested === true
              ).length,
              screenshotRefCount: captures.filter(
                (capture) =>
                  typeof capture.screenshotRef === 'object' && capture.screenshotRef !== null
              ).length,
              containsInlineScreenshotPayload: captures.some((capture) => {
                return (
                  capture.screenshot !== undefined ||
                  capture.dataUrl !== undefined ||
                  capture.content !== undefined ||
                  Object.values(capture).some(
                    (field) => typeof field === 'string' && field.startsWith('data:image')
                  )
                );
              }),
              captureComments,
              commentDrafts
            };
          });
        const legacyStorageCacheEntryCount = Object.keys(storage).filter(
          (key) => key.startsWith(legacyCacheKeyPrefix) && key !== legacyCacheIndexKey
        ).length;
        return {
          drafts,
          legacyStorageCacheEntryCount
        };
      },
      {
        storageKeyPrefix: SESSION_DRAFT_STORAGE_PREFIX,
        indexKey: SESSION_DRAFT_INDEX_KEY,
        legacyCacheKeyPrefix: VIDEO_SCREENSHOT_CACHE_LEGACY_STORAGE_KEY_PREFIX,
        legacyCacheIndexKey: VIDEO_SCREENSHOT_CACHE_LEGACY_STORAGE_INDEX_KEY
      }
    )
  ]);

  return {
    ...storageSummary,
    ...cacheSummary
  };
}

async function readVideoDraftEntries(extensionPage: Page): Promise<VideoDraftEntry[]> {
  return (await readVideoStorageSummary(extensionPage)).drafts;
}

async function openFixtureWithRuntime(
  context: BrowserContext,
  extensionPage: Page,
  testInfo: TestInfo,
  url: string,
  html: string
): Promise<{ page: Page; tabId: number }> {
  await runStage(testInfo, `route fixture ${url}`, async () => {
    await context.route(url, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: html
      })
    );
  });

  const page = await runStage(testInfo, `open fixture page ${url}`, () => context.newPage());
  await runStage(testInfo, `goto fixture page ${url}`, () =>
    page.goto(url, { waitUntil: 'domcontentloaded' })
  );
  const tabId = await runStage(testInfo, `resolve fixture tab id for ${url}`, () =>
    findCurrentTabId(extensionPage, page.url())
  );
  await injectContentRuntime(extensionPage, tabId, testInfo);
  await runStage(testInfo, 'wait video control bar button', async () => {
    await expect(page.locator('[data-aiob-video-control-bar-button="true"]')).toHaveCount(1, {
      timeout: 10000
    });
  });
  return { page, tabId };
}

function youtubeFixtureHtml(): string {
  return `<!doctype html>
    <html>
      <head><title>P07 Video Panel Flow Fixture</title></head>
      <body>
        <main>
          <h1 id="video-title">P07 browser video fixture</h1>
          <div id="movie_player" class="html5-video-player">
            <video></video>
            <div class="ytp-right-controls"></div>
          </div>
          <section id="comment">
            <p id="selectable">P07 browser-selected fragment text</p>
          </section>
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

testWithExtension.describe('Video Panel browser flow', () => {
  testWithExtension.slow();
  testWithExtension.setTimeout(90000);

  testWithExtension(
    'restores video captures and screenshot intent after reload without export recapture',
    async ({ context, extensionPage }, testInfo) => {
      await seedOptions(extensionPage, testInfo);
      await installExportCaptureListener(extensionPage, testInfo);

      const { page, tabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        testInfo,
        YOUTUBE_URL,
        youtubeFixtureHtml()
      );

      try {
        await installVideoProbe(extensionPage, tabId, testInfo);
        await startVideoMode(extensionPage, tabId, testInfo);
        await expandVideoPanel(page);

        await runStage(testInfo, 'add timestamp capture', async () => {
          await page.locator('[data-role="add-btn"]').click();
          await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);
        });

        await expect
          .poll(
            () =>
              readVideoProbe(extensionPage, tabId).then((probe) => ({
                toBlobCalls: probe.toBlobCalls,
                toDataUrlCalls: probe.toDataUrlCalls,
                drawImageCalls: probe.drawImageCalls,
                currentTimeWrites: probe.currentTimeWrites,
                pauseCalls: probe.pauseCalls,
                playCalls: probe.playCalls
              })),
            {
              timeout: 10000,
              message: 'timestamp creation did not prepare a reusable screenshot'
            }
          )
          .toEqual({
            toBlobCalls: 1,
            toDataUrlCalls: 0,
            drawImageCalls: 1,
            currentTimeWrites: 0,
            pauseCalls: 0,
            playCalls: 0
          });

        const timestampInput = page.locator('[data-capture-input]').first();
        const timestampDraft = 'Video timestamp unsaved draft note';
        await runStage(testInfo, 'fill timestamp draft', async () => {
          await timestampInput.fill(timestampDraft);
          await expect(timestampInput).toHaveValue(timestampDraft);
        });

        await runStage(testInfo, 'capture fragment selection', async () => {
          await selectFixtureText(page);
          await page.evaluate(() => {
            document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
          });
          await expect(page.locator('[data-role="capture-item"]')).toHaveCount(2);
          await expect(page.locator('[data-role="capture-item"]').last()).toContainText(
            'P07 browser-selected fragment text'
          );
        });

        const firstCapture = page.locator('[data-role="capture-item"]').first();
        const screenshotToggle = firstCapture.locator('[data-action-id="video:toggle-screenshot"]');
        await resetVideoProbe(extensionPage, tabId, testInfo);
        await runStage(testInfo, 'toggle screenshot intent', async () => {
          await screenshotToggle.click();
          await expect(screenshotToggle).toHaveAttribute('data-screenshot-state', 'on');
        });

        await expect
          .poll(
            () =>
              readVideoProbe(extensionPage, tabId).then((probe) => ({
                toBlobCalls: probe.toBlobCalls,
                toDataUrlCalls: probe.toDataUrlCalls,
                drawImageCalls: probe.drawImageCalls,
                currentTimeWrites: probe.currentTimeWrites,
                pauseCalls: probe.pauseCalls,
                playCalls: probe.playCalls
              })),
            {
              timeout: 10000,
              message: 'initial screenshot toggle did not reuse the prepared frame'
            }
          )
          .toEqual({
            toBlobCalls: 0,
            toDataUrlCalls: 0,
            drawImageCalls: 0,
            currentTimeWrites: 0,
            pauseCalls: 0,
            playCalls: 0
          });

        await expect
          .poll(
            async () => {
              const summary = await readVideoStorageSummary(extensionPage);
              const matchingDraft = summary.drafts.find(
                (entry) =>
                  entry.pageUrl?.includes('p07BrowserVideoFlow') &&
                  entry.captureCount === 2 &&
                  entry.requestedScreenshotCount === 1
              );
              return {
                count: summary.drafts.length,
                hasDraft: matchingDraft !== undefined,
                screenshotRefCount: matchingDraft?.screenshotRefCount ?? 0,
                containsInlineScreenshotPayload:
                  matchingDraft?.containsInlineScreenshotPayload ?? false,
                cacheEntryCount: summary.cacheEntryCount,
                cacheIndexEntryCount: summary.cacheIndexEntryCount,
                legacyStorageCacheEntryCount: summary.legacyStorageCacheEntryCount
              };
            },
            {
              timeout: 10000,
              message: 'video draft did not persist expected captures'
            }
          )
          .toEqual({
            count: 1,
            hasDraft: true,
            screenshotRefCount: 1,
            containsInlineScreenshotPayload: false,
            cacheEntryCount: 1,
            cacheIndexEntryCount: 1,
            legacyStorageCacheEntryCount: 0
          });

        await simulateVisibilityRoundTrip(extensionPage, tabId, testInfo);
        await expect(page.locator('[data-role="finish-btn"]')).toBeVisible();
        await expect(page.locator('[data-role="capture-item"]')).toHaveCount(2);
        await expect(screenshotToggle).toHaveAttribute('data-screenshot-state', 'on');

        await runStage(testInfo, 'reload video fixture page', async () => {
          await page.reload({ waitUntil: 'domcontentloaded' });
        });

        const reloadedTabId = await runStage(testInfo, 'resolve reloaded tab id', () =>
          findCurrentTabId(extensionPage, page.url())
        );
        await installVideoProbe(extensionPage, reloadedTabId, testInfo);
        await injectContentRuntime(extensionPage, reloadedTabId, testInfo);
        await runStage(testInfo, 'wait reloaded video control bar button', async () => {
          await expect(page.locator('[data-aiob-video-control-bar-button="true"]')).toHaveCount(1, {
            timeout: 10000
          });
        });

        await runStage(testInfo, 'wait video draft auto-restore panel', async () => {
          await expect(page.locator('[data-stitch-surface="video"]')).toHaveCount(1, {
            timeout: 10000
          });
          await expect(page.locator('[data-role="finish-btn"]')).toBeVisible();
        });
        await expandVideoPanel(page);
        await expect(page.locator('[data-role="capture-item"]')).toHaveCount(2);
        await expect(
          page
            .locator('[data-role="capture-item"]')
            .first()
            .locator('[data-action-id="video:toggle-screenshot"]')
        ).toHaveAttribute('data-screenshot-state', 'on');
        await expect
          .poll(
            () =>
              readVideoProbe(extensionPage, reloadedTabId).then((probe) => ({
                toBlobCalls: probe.toBlobCalls,
                toDataUrlCalls: probe.toDataUrlCalls,
                drawImageCalls: probe.drawImageCalls,
                currentTimeWrites: probe.currentTimeWrites
              })),
            {
              timeout: 10000,
              message: 'restore-time cache hit unexpectedly recaptured the screenshot'
            }
          )
          .toEqual({ toBlobCalls: 0, toDataUrlCalls: 0, drawImageCalls: 0, currentTimeWrites: 0 });

        const restoredScreenshotToggle = page
          .locator('[data-role="capture-item"]')
          .first()
          .locator('[data-action-id="video:toggle-screenshot"]');
        await runStage(testInfo, 'disable restored screenshot before export', async () => {
          await restoredScreenshotToggle.click();
          await expect(restoredScreenshotToggle).toHaveAttribute('data-screenshot-state', 'off');
        });
        await expect
          .poll(
            async () => {
              const summary = await readVideoStorageSummary(extensionPage);
              const matchingDraft = summary.drafts.find((entry) =>
                entry.pageUrl?.includes('p07BrowserVideoFlow')
              );
              return {
                requestedScreenshotCount: matchingDraft?.requestedScreenshotCount ?? 0,
                screenshotRefCount: matchingDraft?.screenshotRefCount ?? 0,
                containsInlineScreenshotPayload:
                  matchingDraft?.containsInlineScreenshotPayload ?? false,
                cacheEntryCount: summary.cacheEntryCount,
                legacyStorageCacheEntryCount: summary.legacyStorageCacheEntryCount
              };
            },
            {
              timeout: 10000,
              message: 'disabling the restored screenshot did not update the durable draft state'
            }
          )
          .toEqual({
            requestedScreenshotCount: 0,
            screenshotRefCount: 1,
            containsInlineScreenshotPayload: false,
            cacheEntryCount: 1,
            legacyStorageCacheEntryCount: 0
          });

        await resetVideoProbe(extensionPage, reloadedTabId, testInfo);
        const finishButton = page.locator('[data-role="finish-btn"]');
        await runStage(testInfo, 'export restored video captures', async () => {
          await finishButton.click();
        });

        await expect(page.locator('[data-stitch-surface="video"]')).toHaveCount(0);
        await expect
          .poll(
            () =>
              readVideoProbe(extensionPage, reloadedTabId).then((probe) => ({
                toBlobCalls: probe.toBlobCalls,
                toDataUrlCalls: probe.toDataUrlCalls,
                drawImageCalls: probe.drawImageCalls,
                currentTimeWrites: probe.currentTimeWrites
              })),
            {
              timeout: 10000,
              message: 'video export triggered an unexpected recapture/seek pass'
            }
          )
          .toEqual({ toBlobCalls: 0, toDataUrlCalls: 0, drawImageCalls: 0, currentTimeWrites: 0 });

        await expect
          .poll(() => readCapturedVideoClip(extensionPage), {
            timeout: 10000,
            message: 'video export payload was not captured'
          })
          .not.toBeNull();
        const resolvedClip = await readCapturedVideoClip(extensionPage);
        if (!resolvedClip) {
          throw new Error('Expected exported video clip payload.');
        }
        expect(resolvedClip.attachments ?? []).toHaveLength(0);

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
              message: 'video draft and screenshot cache storage were not cleared after export'
            }
          )
          .toEqual({
            draftCount: 0,
            cacheEntryCount: 0,
            cacheIndexEntryCount: 0,
            cacheKeyCount: 0,
            legacyStorageCacheEntryCount: 0
          });
      } finally {
        await runStage(testInfo, 'close video fixture page', () => page.close());
      }
    }
  );

  testWithExtension(
    'keeps the sixth timestamp draft stable across edits, add, toggle, and visibility restore',
    async ({ context, extensionPage }, testInfo) => {
      await seedOptions(extensionPage, testInfo);

      const { page, tabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        testInfo,
        `${YOUTUBE_URL}-eight-timestamps`,
        youtubeFixtureHtml()
      );

      try {
        await installVideoProbe(extensionPage, tabId, testInfo);
        await startVideoMode(extensionPage, tabId, testInfo);
        await expandVideoPanel(page);

        const addButton = page.locator('[data-role="add-btn"]');
        await runStage(testInfo, 'add eight timestamp captures', async () => {
          for (let index = 0; index < 8; index += 1) {
            await addButton.click();
            await expect(page.locator('[data-role="capture-item"]')).toHaveCount(index + 1);
          }
        });

        let captureInputs = page.locator('[data-capture-input]');
        await expect(captureInputs).toHaveCount(8);

        const stableDraft =
          'Capture six browser draft that must survive unrelated timestamp operations.';
        await runStage(testInfo, 'fill sixth timestamp draft', async () => {
          await captureInputs.nth(5).fill(stableDraft);
          await expect(captureInputs.nth(5)).toHaveValue(stableDraft);
        });

        await runStage(testInfo, 'edit earlier timestamp drafts', async () => {
          await captureInputs.nth(0).fill('first timestamp edit');
          await captureInputs.nth(1).fill('second timestamp edit');
          await expect(captureInputs.nth(5)).toHaveValue(stableDraft);
        });

        await runStage(testInfo, 'add one more timestamp', async () => {
          await addButton.click();
          captureInputs = page.locator('[data-capture-input]');
          await expect(captureInputs).toHaveCount(9);
          await expect(captureInputs.nth(5)).toHaveValue(stableDraft);
        });

        const firstToggle = page
          .locator('[data-role="capture-item"]')
          .first()
          .locator('[data-action-id="video:toggle-screenshot"]');
        await resetVideoProbe(extensionPage, tabId, testInfo);
        await runStage(testInfo, 'toggle first timestamp screenshot', async () => {
          await firstToggle.click();
          await expect(firstToggle).toHaveAttribute('data-screenshot-state', 'on');
        });

        await expect(captureInputs.nth(5)).toHaveValue(stableDraft);
        await expect
          .poll(
            () =>
              readVideoProbe(extensionPage, tabId).then((probe) => ({
                currentTimeWrites: probe.currentTimeWrites
              })),
            {
              timeout: 10000,
              message: 'screenshot toggle sought the visible video'
            }
          )
          .toEqual({ currentTimeWrites: 0 });

        await simulateVisibilityRoundTrip(extensionPage, tabId, testInfo);
        captureInputs = page.locator('[data-capture-input]');
        await expect(captureInputs).toHaveCount(9);
        await expect(captureInputs.nth(5)).toHaveValue(stableDraft);
        await expect
          .poll(
            async () => {
              const entries = await readVideoDraftEntries(extensionPage);
              const stableEntry =
                entries.find(
                  (entry) =>
                    entry.captureComments.includes(stableDraft) ||
                    Object.values(entry.commentDrafts).includes(stableDraft)
                ) ?? null;
              if (!stableEntry) {
                return null;
              }
              return {
                captureCount: stableEntry.captureCount,
                requestedScreenshotCount: stableEntry.requestedScreenshotCount,
                stableDraftOccurrences:
                  stableEntry.captureComments.filter((comment) => comment === stableDraft).length +
                  Object.values(stableEntry.commentDrafts).filter((draft) => draft === stableDraft)
                    .length
              };
            },
            {
              timeout: 10000,
              message: 'video draft storage lost the stable sixth draft'
            }
          )
          .toEqual({
            captureCount: 9,
            requestedScreenshotCount: 1,
            stableDraftOccurrences: 1
          });
        await expect
          .poll(
            () =>
              readVideoProbe(extensionPage, tabId).then((probe) => ({
                currentTimeWrites: probe.currentTimeWrites
              })),
            {
              timeout: 10000,
              message: 'visibility round trip sought the visible video'
            }
          )
          .toEqual({ currentTimeWrites: 0 });
      } finally {
        await runStage(testInfo, 'close eight timestamp fixture page', () => page.close());
      }
    }
  );
});
