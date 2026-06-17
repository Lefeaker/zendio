import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page
} from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BILIBILI_MAIN_COMMENT_TEXT,
  BILIBILI_REPLY_COMMENT_TEXT,
  buildBilibiliCommentsShadowFixture
} from './fixtures/bilibili-comments-shadow';
import {
  VIDEO_SCREENSHOT_CACHE_LEGACY_STORAGE_INDEX_KEY,
  VIDEO_SCREENSHOT_CACHE_LEGACY_STORAGE_KEY_PREFIX,
  clearVideoScreenshotCacheIndexedDb,
  readVideoScreenshotCacheIndexedDbSummary
} from './utils/videoScreenshotCacheIndexedDb';
import { readVideoControlBarGeometry } from '../utils/videoControlBarGeometry';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../../build/dist');
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=browserListenerScope';
const YOUTUBE_PAUSED_URL = 'https://www.youtube.com/watch?v=browserListenerScopePaused';
const BILIBILI_URL = 'https://www.bilibili.com/video/BV1browser/';
const SESSION_DRAFT_STORAGE_PREFIX = 'aiob.sessionDraft';
const SESSION_DRAFT_INDEX_KEY = `${SESSION_DRAFT_STORAGE_PREFIX}.index.v1`;

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

type VideoScreenshotProbeState = {
  currentTimeWrites: number;
  drawImageCalls: number;
  toBlobCalls: number;
  toDataUrlCalls: number;
  pendingBlobCallbacks: number;
};

type VideoDraftEntry = {
  key: string;
  pageUrl: string | null;
  captureCount: number;
  requestedScreenshotCount: number;
  screenshotRefCount: number;
  containsInlineScreenshotPayload: boolean;
};

type VideoStorageSummary = {
  drafts: VideoDraftEntry[];
  cacheEntryCount: number;
  cacheIndexEntryCount: number;
  cacheKeys: string[];
  legacyStorageCacheEntryCount: number;
};

type StartVideoModeResponse = {
  success: boolean;
  alreadyActive?: boolean;
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
    controlBarScreenshot?: boolean;
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
    const userDataDir = await fs.mkdtemp(path.join(tmpdir(), 'video-listener-scope-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`]
    });

    try {
      await use(context);
    } finally {
      const openPages = context.pages().filter((page) => !page.isClosed());
      await Promise.all(openPages.map((page) => page.close().catch(() => undefined)));
      await context.close().catch(() => undefined);
      await fs.rm(userDataDir, { recursive: true, force: true });
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

async function installVideoScreenshotProbe(extensionPage: Page, tabId: number): Promise<void> {
  await extensionPage.evaluate(async (targetTabId) => {
    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => {
        const runtimeGlobal = globalThis as typeof globalThis & {
          __aiobP09VideoScreenshotProbe?: Omit<VideoScreenshotProbeState, 'pendingBlobCallbacks'>;
          __aiobP09VideoScreenshotPendingResolvers?: Array<(blob: Blob | null) => void>;
          __aiobP09CanvasPatched?: boolean;
        };

        const video = document.querySelector('video');
        if (!(video instanceof HTMLVideoElement)) {
          throw new Error('Missing video element for screenshot probe.');
        }

        runtimeGlobal.__aiobP09VideoScreenshotProbe = {
          currentTimeWrites: 0,
          drawImageCalls: 0,
          toBlobCalls: 0,
          toDataUrlCalls: 0
        };
        runtimeGlobal.__aiobP09VideoScreenshotPendingResolvers = [];

        let currentTime = 42;
        Object.defineProperty(video, 'currentTime', {
          configurable: true,
          get: () => currentTime,
          set: (value: number) => {
            if (Number.isFinite(value)) {
              currentTime = value;
            }
            runtimeGlobal.__aiobP09VideoScreenshotProbe!.currentTimeWrites += 1;
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

        if (!runtimeGlobal.__aiobP09CanvasPatched) {
          Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: function getContext(type: string) {
              if (type !== '2d') {
                return null;
              }
              return {
                drawImage: () => {
                  runtimeGlobal.__aiobP09VideoScreenshotProbe!.drawImageCalls += 1;
                }
              };
            }
          });
          Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
            configurable: true,
            value: (callback: (blob: Blob | null) => void) => {
              runtimeGlobal.__aiobP09VideoScreenshotProbe!.toBlobCalls += 1;
              runtimeGlobal.__aiobP09VideoScreenshotPendingResolvers?.push(callback);
            }
          });
          Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
            configurable: true,
            value: () => {
              runtimeGlobal.__aiobP09VideoScreenshotProbe!.toDataUrlCalls += 1;
              return 'data:image/jpeg;base64,ZmFrZS1zY3JlZW5zaG90';
            }
          });
          runtimeGlobal.__aiobP09CanvasPatched = true;
        }
      }
    });
  }, tabId);
}

async function readVideoScreenshotProbe(
  extensionPage: Page,
  tabId: number
): Promise<VideoScreenshotProbeState> {
  const results = await extensionPage.evaluate(async (targetTabId) => {
    return await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => {
        const runtimeGlobal = globalThis as typeof globalThis & {
          __aiobP09VideoScreenshotProbe?: Omit<VideoScreenshotProbeState, 'pendingBlobCallbacks'>;
          __aiobP09VideoScreenshotPendingResolvers?: Array<(blob: Blob | null) => void>;
        };
        const probe = runtimeGlobal.__aiobP09VideoScreenshotProbe;
        if (!probe) {
          return null;
        }
        return {
          ...probe,
          pendingBlobCallbacks: runtimeGlobal.__aiobP09VideoScreenshotPendingResolvers?.length ?? 0
        };
      }
    });
  }, tabId);

  const probe = results[0]?.result;
  if (!probe) {
    throw new Error('Video screenshot probe was not installed in the content runtime.');
  }
  return probe;
}

async function releasePendingVideoScreenshotBlobs(
  extensionPage: Page,
  tabId: number,
  outcome: 'success' | 'failure'
): Promise<void> {
  await extensionPage.evaluate(
    async ({ targetTabId, nextOutcome }) => {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: (blobOutcome) => {
          const runtimeGlobal = globalThis as typeof globalThis & {
            __aiobP09VideoScreenshotPendingResolvers?: Array<(blob: Blob | null) => void>;
          };
          const pending = runtimeGlobal.__aiobP09VideoScreenshotPendingResolvers ?? [];
          const blob =
            blobOutcome === 'success'
              ? new Blob([Uint8Array.of(255, 216, 255, 217)], { type: 'image/jpeg' })
              : null;
          while (pending.length > 0) {
            pending.shift()?.(blob);
          }
        },
        args: [nextOutcome]
      });
    },
    { targetTabId: tabId, nextOutcome: outcome }
  );
}

async function readVideoStorageSummary(extensionPage: Page): Promise<VideoStorageSummary> {
  const [cacheSummary, storageSummary] = await Promise.all([
    readVideoScreenshotCacheIndexedDbSummary(extensionPage),
    extensionPage.evaluate(
      async ({ storageKeyPrefix, indexKey, legacyCacheKeyPrefix, legacyCacheIndexKey }) => {
        const isRecord = (value: unknown): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null;
        const toUnknownArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

        const rawStorage = await chrome.storage.local.get(null);
        const storage = isRecord(rawStorage) ? rawStorage : {};
        const drafts = Object.entries(storage)
          .filter(([key]) => key.startsWith(storageKeyPrefix) && key !== indexKey)
          .map(([key, value]) => {
            const envelope = isRecord(value) ? value : null;
            const payload = envelope && isRecord(envelope.payload) ? envelope.payload : null;
            const captures = payload ? toUnknownArray(payload.captures) : [];
            return {
              key,
              pageUrl:
                envelope && 'pageUrl' in envelope && typeof envelope.pageUrl === 'string'
                  ? envelope.pageUrl
                  : null,
              captureCount: captures.length,
              requestedScreenshotCount: captures.filter(
                (capture) => isRecord(capture) && capture.screenshotRequested === true
              ).length,
              screenshotRefCount: captures.filter(
                (capture) =>
                  isRecord(capture) &&
                  typeof capture.screenshotRef === 'object' &&
                  capture.screenshotRef !== null
              ).length,
              containsInlineScreenshotPayload: captures.some((capture) => {
                if (!isRecord(capture)) {
                  return false;
                }
                return (
                  'screenshot' in capture ||
                  'dataUrl' in capture ||
                  'content' in capture ||
                  Object.values(capture).some(
                    (field) => typeof field === 'string' && field.startsWith('data:image')
                  )
                );
              })
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

async function clearVideoScreenshotCacheStorage(extensionPage: Page): Promise<void> {
  await clearVideoScreenshotCacheIndexedDb(extensionPage);
  await extensionPage.evaluate(
    async ({ legacyCacheKeyPrefix }) => {
      const storage = await chrome.storage.local.get(null);
      const keys = Object.keys(storage).filter((key) => key.startsWith(legacyCacheKeyPrefix));
      if (keys.length > 0) {
        await chrome.storage.local.remove(keys);
      }
    },
    {
      legacyCacheKeyPrefix: VIDEO_SCREENSHOT_CACHE_LEGACY_STORAGE_KEY_PREFIX
    }
  );
}

async function removeDraftScreenshotRefs(extensionPage: Page, pageUrl: string): Promise<void> {
  await extensionPage.evaluate(async (targetPageUrl) => {
    const storage = await chrome.storage.local.get(null);
    const draftEntry = Object.entries(storage).find(([key, value]) => {
      if (!key.startsWith('aiob.sessionDraft') || key === 'aiob.sessionDraft.index.v1') {
        return false;
      }
      return (
        typeof value === 'object' &&
        value !== null &&
        'pageUrl' in value &&
        value.pageUrl === targetPageUrl
      );
    });
    if (!draftEntry) {
      throw new Error(`Missing stored draft for ${targetPageUrl}`);
    }
    const [draftKey, rawDraftValue] = draftEntry;
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null;
    if (
      !isRecord(rawDraftValue) ||
      !('payload' in rawDraftValue) ||
      !isRecord(rawDraftValue.payload)
    ) {
      throw new Error(`Stored draft for ${targetPageUrl} is not a video draft envelope.`);
    }

    const payload = rawDraftValue.payload;
    const rawCaptures = 'captures' in payload ? payload.captures : undefined;
    const captures: unknown[] = Array.isArray(rawCaptures) ? rawCaptures : [];
    const screenshotPayloadKeys = new Set(['screenshotRef', 'screenshot', 'dataUrl', 'content']);
    const nextCaptures = captures.map((capture) => {
      if (!isRecord(capture)) {
        return capture;
      }
      return Object.fromEntries(
        Object.entries(capture).filter(([key]) => !screenshotPayloadKeys.has(key))
      );
    });

    await chrome.storage.local.set({
      [draftKey]: {
        ...rawDraftValue,
        payload: {
          ...payload,
          captures: nextCaptures
        }
      }
    });
  }, pageUrl);
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
      const isStartupRace = message.includes('Receiving end does not exist');
      if (!isStartupRace || attempt === 11) {
        throw error;
      }
      await extensionPage.waitForTimeout(250);
    }
  }
}

async function closeVideoPanel(page: Page): Promise<void> {
  await page.locator('[data-role="close-btn"]').click();
  await expect(page.locator('[data-stitch-surface="video"]')).toHaveCount(0);
}

async function captureFixtureSelectionWithShift(page: Page): Promise<void> {
  await page.keyboard.down('Shift');
  await selectFixtureText(page);
  await page.evaluate(() => {
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, shiftKey: true }));
  });
  await page.keyboard.up('Shift');
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

async function submitControlBarNote(
  page: Page,
  note: string,
  options: { captureScreenshotEnabled?: boolean } = {}
): Promise<void> {
  await page.locator('[data-aiob-video-control-bar-button="true"]').click();
  const input = page.locator('[data-aiob-video-control-bar-note-input="true"]');
  await expect(input).toBeVisible();
  if (options.captureScreenshotEnabled !== undefined) {
    await page
      .locator('[data-aiob-video-control-bar-popover="true"]')
      .locator('[data-preference="captureScreenshotEnabled"]')
      .setChecked(options.captureScreenshotEnabled);
  }
  await input.fill(note);
  await input.press('Enter');
}

async function openVideoPanelFromControlBar(
  page: Page,
  note = 'Browser control bar note',
  options: { captureScreenshotEnabled?: boolean } = {}
): Promise<void> {
  await submitControlBarNote(page, note, options);
  await expect(page.locator('[data-stitch-surface="video"]')).toBeVisible({ timeout: 10000 });
}

async function waitForPanelCaptureInputReady(input: Locator): Promise<void> {
  await expect(input).toBeVisible();
  await expect(input).toBeEditable();
  await expect
    .poll(
      async () =>
        await input.evaluate((element) => {
          if (!(element instanceof HTMLInputElement)) {
            return { connected: false, active: false };
          }
          return {
            connected: element.isConnected,
            active: document.activeElement === element
          };
        }),
      {
        timeout: 10000,
        message: 'panel capture input never settled into an editable, focusable state'
      }
    )
    .toMatchObject({ connected: true });
}

async function readControlBarGeometry(page: Page, targetSelector: string) {
  return await page.evaluate(readVideoControlBarGeometry, { targetSelector });
}

function expectPxWithin(actual: number | null, expected: number): void {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThanOrEqual(1);
}

function expectHorizontallyCenteredUnlessClamped(horizontalCenterDelta: number | null): void {
  expect(horizontalCenterDelta).not.toBeNull();
  expect(horizontalCenterDelta ?? Number.NaN).toBeLessThanOrEqual(1.5);
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
    'keeps YouTube control-bar geometry and popover clamp parity in Chromium',
    async ({ context, extensionPage }) => {
      const { page } = await openFixtureWithRuntime(
        context,
        extensionPage,
        YOUTUBE_URL,
        youtubeFixtureHtml()
      );

      await expect(page.locator('[data-aiob-video-control-bar-button="true"]')).toHaveCount(1);
      const beforeOpen = await readControlBarGeometry(page, '.ytp-right-controls');
      expect(beforeOpen.button?.parentMatchesTarget).toBe(true);
      expect(beforeOpen.button?.isFirstElementChild).toBe(true);
      expect(beforeOpen.icon).not.toBeNull();
      expectPxWithin(beforeOpen.button?.computed.width ?? null, 31);
      expectPxWithin(beforeOpen.button?.computed.height ?? null, 31);
      expectPxWithin(beforeOpen.button?.computed.marginLeft ?? null, 8);
      expectPxWithin(beforeOpen.button?.computed.marginRight ?? null, 8);

      await page.locator('[data-aiob-video-control-bar-button="true"]').click();
      const afterOpen = await readControlBarGeometry(page, '.ytp-right-controls');
      expect(afterOpen.popover).not.toBeNull();
      expectPxWithin(afterOpen.popover?.computed.width ?? null, 220);
      expect(afterOpen.popover?.inlineLeft).not.toBeNull();
      expect(afterOpen.popover?.inlineTop).not.toBeNull();
      expect(afterOpen.popover?.horizontalClamp.withinRange).toBe(true);
      expect(afterOpen.popover?.verticalClamp.withinRange).toBe(true);
      if (afterOpen.popover?.horizontalClamp.clamped) {
        const left = afterOpen.popover.inlineLeft ?? Number.NaN;
        const rightClamp = afterOpen.popover.horizontalClamp.max;
        expect(
          Math.abs(left - afterOpen.popover.horizontalClamp.min) <= 1 ||
            Math.abs(left - rightClamp) <= 1
        ).toBe(true);
      } else {
        expectHorizontallyCenteredUnlessClamped(afterOpen.popover?.horizontalCenterDelta ?? null);
      }
      expect(afterOpen.popover?.noteInputIsActive).toBe(true);
      expect(afterOpen.popover?.noteInputIsFirstFocusable).toBe(true);
      expect(afterOpen.popover?.focusableOrder).toEqual([
        'note-input',
        'toggle:autoPauseEnabled',
        'toggle:captureScreenshotEnabled'
      ]);
      expect(afterOpen.popover?.toggleOrder).toEqual([
        'autoPauseEnabled',
        'captureScreenshotEnabled'
      ]);
    }
  );

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

      const addButton = page.locator('.session-add-capture-card [data-role="add-btn"]');
      const addNoteInput = page.locator(
        '.session-add-capture-card [data-action-id="video:add-note"]'
      );
      const addButtonBox = await addButton.boundingBox();
      const addNoteInputBox = await addNoteInput.boundingBox();
      expect(addButtonBox).not.toBeNull();
      expect(addNoteInputBox).not.toBeNull();
      expect(
        Math.abs(
          (addButtonBox?.y ?? Number.NaN) +
            (addButtonBox?.height ?? Number.NaN) / 2 -
            ((addNoteInputBox?.y ?? Number.NaN) + (addNoteInputBox?.height ?? Number.NaN) / 2)
        )
      ).toBeLessThanOrEqual(1.5);

      await page.locator('[data-action-id="video:add-note"]').click();
      const input = page.locator('[data-capture-input]').last();
      await expect(input).toBeVisible();
      await expect(input).toBeFocused();
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
});
