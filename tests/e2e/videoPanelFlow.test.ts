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
  captureComments: string[];
  commentDrafts: Record<string, string>;
  json: string;
};

type VideoProbeState = {
  toDataUrlCalls: number;
  drawImageCalls: number;
  currentTimeWrites: number;
  pauseCalls: number;
  playCalls: number;
};

type ExportedVideoClip = {
  title?: string;
  attachments?: Array<{
    fileName?: string;
    mimeType?: string;
    dataUrl?: string;
  }>;
} | null;

type StartVideoModeResponse = {
  success: boolean;
};

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
      const runtimeWindow = window as Window & {
        __aiobP07VideoClipCapture?: {
          installed: boolean;
          lastVideoClip: Record<string, unknown> | null;
        };
      };
      const captureState = (runtimeWindow.__aiobP07VideoClipCapture ??= {
        installed: false,
        lastVideoClip: null
      });
      captureState.lastVideoClip = null;
      if (!captureState.installed) {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
          if (
            message &&
            typeof message === 'object' &&
            (message as { type?: unknown }).type === 'videoClip'
          ) {
            captureState.lastVideoClip = ((message as { data?: Record<string, unknown> }).data ??
              null) as Record<string, unknown> | null;
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
    const runtimeWindow = window as Window & {
      __aiobP07VideoClipCapture?: {
        lastVideoClip: ExportedVideoClip;
      };
    };
    return runtimeWindow.__aiobP07VideoClipCapture?.lastVideoClip ?? null;
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
          const runtimeGlobal = globalThis as typeof globalThis & {
            __aiobP07VideoProbe?: {
              toDataUrlCalls: number;
              drawImageCalls: number;
              currentTimeWrites: number;
              pauseCalls: number;
              playCalls: number;
            };
            __aiobP07CanvasPatched?: boolean;
          };
          const video = document.querySelector('video');
          if (!(video instanceof HTMLVideoElement)) {
            throw new Error('Missing video element for P07 video probe.');
          }

          runtimeGlobal.__aiobP07VideoProbe = {
            toDataUrlCalls: 0,
            drawImageCalls: 0,
            currentTimeWrites: 0,
            pauseCalls: 0,
            playCalls: 0
          };

          let currentTime = 42;
          Object.defineProperty(video, 'currentTime', {
            configurable: true,
            get: () => currentTime,
            set: (value: number) => {
              if (Number.isFinite(value)) {
                currentTime = value;
              }
              runtimeGlobal.__aiobP07VideoProbe!.currentTimeWrites += 1;
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
              runtimeGlobal.__aiobP07VideoProbe!.pauseCalls += 1;
            }
          });
          Object.defineProperty(video, 'play', {
            configurable: true,
            value: () => {
              paused = false;
              runtimeGlobal.__aiobP07VideoProbe!.playCalls += 1;
              return Promise.resolve();
            }
          });

          if (!runtimeGlobal.__aiobP07CanvasPatched) {
            Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
              configurable: true,
              value: function getContext(type: string) {
                if (type !== '2d') {
                  return null;
                }
                return {
                  drawImage: () => {
                    runtimeGlobal.__aiobP07VideoProbe!.drawImageCalls += 1;
                  }
                };
              }
            });
            Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
              configurable: true,
              value: () => {
                runtimeGlobal.__aiobP07VideoProbe!.toDataUrlCalls += 1;
                return 'data:image/jpeg;base64,ZmFrZS1zY3JlZW5zaG90';
              }
            });
            runtimeGlobal.__aiobP07CanvasPatched = true;
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
      func: () => {
        const runtimeGlobal = globalThis as typeof globalThis & {
          __aiobP07VideoProbe?: VideoProbeState;
        };
        return runtimeGlobal.__aiobP07VideoProbe ?? null;
      }
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
          const runtimeGlobal = globalThis as typeof globalThis & {
            __aiobP07VideoProbe?: VideoProbeState;
          };
          if (!runtimeGlobal.__aiobP07VideoProbe) {
            throw new Error('Video probe was not installed in the content runtime.');
          }
          runtimeGlobal.__aiobP07VideoProbe.toDataUrlCalls = 0;
          runtimeGlobal.__aiobP07VideoProbe.drawImageCalls = 0;
          runtimeGlobal.__aiobP07VideoProbe.currentTimeWrites = 0;
          runtimeGlobal.__aiobP07VideoProbe.pauseCalls = 0;
          runtimeGlobal.__aiobP07VideoProbe.playCalls = 0;
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
        const response: unknown = await chrome.tabs.sendMessage(targetTabId, {
          action: 'startVideoMode'
        });
        if (response && typeof response === 'object' && 'success' in response) {
          const success = (response as { success?: unknown }).success === true;
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
          const doc = document as Document & {
            hidden?: boolean;
            visibilityState?: DocumentVisibilityState;
          };
          const hiddenDescriptor = Object.getOwnPropertyDescriptor(doc, 'hidden');
          const visibilityDescriptor = Object.getOwnPropertyDescriptor(doc, 'visibilityState');

          Object.defineProperty(doc, 'hidden', {
            configurable: true,
            get: () => true
          });
          Object.defineProperty(doc, 'visibilityState', {
            configurable: true,
            get: () => 'hidden'
          });
          document.dispatchEvent(new Event('visibilitychange'));
          window.dispatchEvent(new Event('pagehide'));

          if (hiddenDescriptor) {
            Object.defineProperty(doc, 'hidden', hiddenDescriptor);
          } else {
            Reflect.deleteProperty(doc, 'hidden');
          }
          if (visibilityDescriptor) {
            Object.defineProperty(doc, 'visibilityState', visibilityDescriptor);
          } else {
            Reflect.deleteProperty(doc, 'visibilityState');
          }
          document.dispatchEvent(new Event('visibilitychange'));
        }
      });
    }, tabId);
  });
}

async function readVideoDraftEntries(extensionPage: Page): Promise<VideoDraftEntry[]> {
  return extensionPage.evaluate(
    async ({ storageKeyPrefix, indexKey }) => {
      const storage = await chrome.storage.local.get(null);
      return Object.entries(storage)
        .filter(([key]) => key.startsWith(storageKeyPrefix) && key !== indexKey)
        .map(([key, value]) => {
          const json = JSON.stringify(value);
          const envelope =
            typeof value === 'object' && value !== null
              ? (value as {
                  pageUrl?: unknown;
                  payload?: {
                    captures?: Array<{ screenshotRequested?: boolean }>;
                    commentDrafts?: Record<string, unknown>;
                  };
                })
              : {};
          const captures = Array.isArray(envelope.payload?.captures)
            ? envelope.payload.captures
            : [];
          const captureComments = captures
            .map((capture) =>
              typeof capture === 'object' &&
              capture !== null &&
              typeof (capture as { comment?: unknown }).comment === 'string'
                ? (capture as { comment: string }).comment
                : ''
            )
            .filter((comment) => comment.length > 0);
          const rawDrafts = envelope.payload?.commentDrafts;
          const commentDrafts =
            rawDrafts && typeof rawDrafts === 'object'
              ? (Object.fromEntries(
                  Object.entries(rawDrafts)
                    .filter(([, draftValue]) => typeof draftValue === 'string')
                    .map(([draftKey, draftValue]) => [draftKey, draftValue])
                ) as Record<string, string>)
              : {};
          return {
            key,
            pageUrl: typeof envelope.pageUrl === 'string' ? envelope.pageUrl : null,
            captureCount: captures.length,
            requestedScreenshotCount: captures.filter(
              (capture) =>
                typeof capture === 'object' &&
                capture !== null &&
                capture.screenshotRequested === true
            ).length,
            captureComments,
            commentDrafts,
            json
          };
        });
    },
    { storageKeyPrefix: SESSION_DRAFT_STORAGE_PREFIX, indexKey: SESSION_DRAFT_INDEX_KEY }
  );
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
                toDataUrlCalls: probe.toDataUrlCalls,
                currentTimeWrites: probe.currentTimeWrites,
                pauseCalls: probe.pauseCalls,
                playCalls: probe.playCalls
              })),
            {
              timeout: 10000,
              message: 'initial screenshot toggle disturbed visible playback'
            }
          )
          .toEqual({
            toDataUrlCalls: 1,
            currentTimeWrites: 0,
            pauseCalls: 0,
            playCalls: 0
          });

        await expect
          .poll(
            async () => {
              const entries = await readVideoDraftEntries(extensionPage);
              return {
                count: entries.length,
                hasDraft: entries.some(
                  (entry) =>
                    entry.pageUrl?.includes('p07BrowserVideoFlow') &&
                    entry.captureCount === 2 &&
                    entry.requestedScreenshotCount === 1
                ),
                containsScreenshotDataUrl: entries.some((entry) =>
                  entry.json.includes('data:image')
                )
              };
            },
            {
              timeout: 10000,
              message: 'video draft did not persist expected captures'
            }
          )
          .toEqual({ count: 1, hasDraft: true, containsScreenshotDataUrl: false });

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
                toDataUrlCalls: probe.toDataUrlCalls,
                currentTimeWrites: probe.currentTimeWrites
              })),
            {
              timeout: 10000,
              message: 'restore-time screenshot recapture did not run'
            }
          )
          .toEqual({ toDataUrlCalls: 1, currentTimeWrites: 0 });

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
                toDataUrlCalls: probe.toDataUrlCalls,
                drawImageCalls: probe.drawImageCalls,
                currentTimeWrites: probe.currentTimeWrites
              })),
            {
              timeout: 10000,
              message: 'video export triggered an unexpected recapture/seek pass'
            }
          )
          .toEqual({ toDataUrlCalls: 0, drawImageCalls: 0, currentTimeWrites: 0 });

        await expect
          .poll(() => readCapturedVideoClip(extensionPage), {
            timeout: 10000,
            message: 'video export payload was not captured'
          })
          .not.toBeNull();
        const resolvedClip = (await readCapturedVideoClip(
          extensionPage
        )) as NonNullable<ExportedVideoClip>;
        expect(Array.isArray(resolvedClip.attachments)).toBe(true);
        expect(resolvedClip.attachments).toHaveLength(1);
        expect(resolvedClip.attachments?.[0]).toMatchObject({
          mimeType: 'image/jpeg',
          dataUrl: 'data:image/jpeg;base64,ZmFrZS1zY3JlZW5zaG90'
        });

        await expect
          .poll(() => readVideoDraftEntries(extensionPage).then((entries) => entries.length), {
            timeout: 10000,
            message: 'video draft storage was not cleared after export'
          })
          .toBe(0);
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
