import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo
} from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  attachBrowserDiagnostics,
  persistBrowserDiagnostics
} from '../visual/utils/browserDiagnostics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../../build/dist');
const HARNESS_PATH = 'content-orchestrator-harness.html';
const SESSION_DRAFT_STORAGE_PREFIX = 'aiob.sessionDraft';
const SESSION_DRAFT_INDEX_KEY = `${SESSION_DRAFT_STORAGE_PREFIX}.index.v1`;
const REAL_READER_FIXTURE_URL = 'https://example.com/p07-reader-real-flow';

type ServiceWorker = ReturnType<BrowserContext['serviceWorkers']>[number];

type StoredOptionsFixture = {
  video: {
    floatingPromptEnabled: boolean;
  };
  fragmentClipper: {
    useFootnoteFormat: boolean;
    captureContext: boolean;
    contextLength: number;
    contextMode: 'chars' | 'words';
    selectionModifierEnabled: boolean;
    selectionModifierKeys: Array<'alt' | 'meta' | 'ctrl' | 'shift'>;
  };
  readingSession: {
    exportMode: 'highlights' | 'full';
    highlightTheme: string;
  };
};

type ReaderDraftEntry = {
  key: string;
  pageUrl: string | null;
  status: string | null;
  highlightTexts: string[];
  commentDrafts: Record<string, string>;
};

type ReaderClipPayload = {
  title?: string;
  url?: string;
  meta?: Record<string, unknown>;
} | null;

const testWithExtension = test.extend<{
  context: BrowserContext;
  background: ServiceWorker;
  extensionPage: Page;
}>({
  context: async ({ browserName: _browserName }, use, testInfo) => {
    void _browserName;
    const userDataDir = `/tmp/test-user-data-dir-${Date.now()}-${Math.random()}`;
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
    const extensionId = await runStage(testInfo, 'resolve extension id', async () => {
      const backgroundUrl = background.url();
      const resolved = backgroundUrl.split('/')[2];
      if (!resolved) {
        throw new Error(`Unable to parse extension id from ${backgroundUrl}`);
      }
      return resolved;
    });

    const page = await runStage(testInfo, 'open extension helper page', () => context.newPage());
    await runStage(testInfo, 'goto extension helper page', () =>
      page.goto(`chrome-extension://${extensionId}/${HARNESS_PATH}`, {
        waitUntil: 'domcontentloaded'
      })
    );

    try {
      await use(page);
    } finally {
      await runStage(testInfo, 'close extension helper page', () => page.close());
    }
  }
});

function logStage(testInfo: TestInfo, stage: string, detail?: string): void {
  const suffix = detail ? ` :: ${detail}` : '';
  console.log(`[reader-panel][${testInfo.title}] ${stage}${suffix}`);
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
      floatingPromptEnabled: true
    },
    fragmentClipper: {
      useFootnoteFormat: true,
      captureContext: true,
      contextLength: 200,
      contextMode: 'chars',
      selectionModifierEnabled: false,
      selectionModifierKeys: []
    },
    readingSession: {
      exportMode: 'highlights',
      highlightTheme: 'gradient'
    }
  };
}

async function resolveHarnessUrl(background: ServiceWorker, testInfo: TestInfo): Promise<string> {
  return runStage(testInfo, 'resolve harness url', async () => {
    const backgroundUrl = background.url();
    const extensionId = backgroundUrl.split('/')[2];
    if (!extensionId) {
      throw new Error(`Unable to parse extension id from ${backgroundUrl}`);
    }
    return `chrome-extension://${extensionId}/${HARNESS_PATH}`;
  });
}

function isMissingHarnessPageError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('ERR_FILE_NOT_FOUND');
}

async function gotoHarnessWithRetry(
  page: Page,
  harnessUrl: string,
  testInfo: TestInfo
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await runStage(testInfo, `goto harness (attempt ${attempt})`, () =>
        page.goto(harnessUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      );
      return;
    } catch (error) {
      lastError = error;
      if (!isMissingHarnessPageError(error) || attempt === 3) {
        throw error;
      }
      await page.waitForTimeout(250);
    }
  }

  throw lastError ?? new Error('Failed to open reader harness.');
}

async function waitForHarnessReady(page: Page, testInfo: TestInfo): Promise<void> {
  await runStage(testInfo, 'wait harness ready', async () => {
    await expect(page.getByRole('button', { name: 'Start Reader Session' })).toBeVisible({
      timeout: 8000
    });
  });
}

async function openReaderDialogFromHarness(
  page: Page,
  background: ServiceWorker,
  testInfo: TestInfo
): Promise<void> {
  const harnessUrl = await resolveHarnessUrl(background, testInfo);

  await gotoHarnessWithRetry(page, harnessUrl, testInfo);
  await waitForHarnessReady(page, testInfo);

  await runStage(testInfo, 'click start reader', async () => {
    await page.getByRole('button', { name: 'Start Reader Session' }).click();
  });

  await runStage(testInfo, 'wait reader session mounted', async () => {
    await expect(page.getByText('ReaderSession mounted')).toBeVisible({ timeout: 8000 });
  });

  await runStage(testInfo, 'wait reader dialog visible', async () => {
    await expect(page.locator('[data-role="export-btn"]')).toBeVisible({ timeout: 8000 });
  });
}

async function waitForDialogClosed(page: Page, testInfo: TestInfo): Promise<void> {
  await runStage(testInfo, 'wait reader dialog closed', async () => {
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const readerActive = document.documentElement.dataset.aiobReaderActive === 'true';
            const hasDialog = Array.from(document.querySelectorAll('div')).some((el) =>
              Boolean(el.shadowRoot?.querySelector('[data-role="dialog-title"]'))
            );
            return { readerActive, hasDialog };
          }),
        {
          timeout: 10000,
          message: 'reader dialog did not close after export/cancel'
        }
      )
      .toEqual({ readerActive: false, hasDialog: false });
  });
}

async function expectReaderPanelFocusedRole(page: Page, role: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          for (const host of Array.from(document.querySelectorAll<HTMLElement>('div'))) {
            const activeRole = host.shadowRoot?.activeElement?.getAttribute('data-role');
            if (activeRole) {
              return activeRole;
            }
          }
          return document.activeElement?.getAttribute('data-role') ?? null;
        }),
      { timeout: 5000, message: `Reader panel focus did not move to ${role}` }
    )
    .toBe(role);
}

async function simulateTransientVisibilityRoundTrip(page: Page, testInfo: TestInfo): Promise<void> {
  await runStage(testInfo, 'simulate transient visibility round trip', async () => {
    await page.evaluate(() => {
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
    });
  });
}

async function clearSessionDraftKeys(extensionPage: Page, testInfo: TestInfo): Promise<void> {
  await runStage(testInfo, 'clear reader session drafts', async () => {
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
  await clearSessionDraftKeys(extensionPage, testInfo);
  await runStage(testInfo, 'seed reader options', async () => {
    await extensionPage.evaluate(async (storedOptions) => {
      await chrome.storage.sync.set({ options: storedOptions });
    }, options);
  });
}

async function installReaderExportCaptureListener(
  extensionPage: Page,
  testInfo: TestInfo
): Promise<void> {
  await runStage(testInfo, 'install reader export capture listener', async () => {
    await extensionPage.evaluate(() => {
      const runtimeWindow = window as Window & {
        __aiobP07ReaderClipCapture?: {
          installed: boolean;
          lastClipResult: ReaderClipPayload;
        };
      };
      const captureState = (runtimeWindow.__aiobP07ReaderClipCapture ??= {
        installed: false,
        lastClipResult: null
      });
      captureState.lastClipResult = null;
      if (!captureState.installed) {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
          if (
            message &&
            typeof message === 'object' &&
            (message as { type?: unknown }).type === 'CLIP_RESULT'
          ) {
            captureState.lastClipResult = ((message as { payload?: ReaderClipPayload }).payload ??
              null) as ReaderClipPayload;
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

async function readCapturedReaderClip(extensionPage: Page): Promise<ReaderClipPayload> {
  return extensionPage.evaluate(() => {
    const runtimeWindow = window as Window & {
      __aiobP07ReaderClipCapture?: {
        lastClipResult: ReaderClipPayload;
      };
    };
    return runtimeWindow.__aiobP07ReaderClipCapture?.lastClipResult ?? null;
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

async function openReaderFixtureWithRuntime(
  page: Page,
  context: BrowserContext,
  extensionPage: Page,
  testInfo: TestInfo,
  url: string
): Promise<number> {
  const body = `<!doctype html>
    <html>
      <body>
        <article>
          <p id="p1">Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa.</p>
          <p id="p2">Lambda Mu Nu Xi Omicron Pi Rho Sigma Tau Upsilon.</p>
        </article>
      </body>
    </html>`;

  await runStage(testInfo, 'route real reader fixture', async () => {
    await context.route(url, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body
      })
    );
  });

  await runStage(testInfo, 'goto real reader fixture', () =>
    page.goto(url, { waitUntil: 'domcontentloaded' })
  );
  const tabId = await runStage(testInfo, 'resolve real reader tab id', () =>
    findCurrentTabId(extensionPage, page.url())
  );
  await injectContentRuntime(extensionPage, tabId, testInfo);
  return tabId;
}

async function selectTextRange(
  page: Page,
  elementId: 'p1' | 'p2',
  endOffset: number,
  testInfo: TestInfo
): Promise<void> {
  await runStage(testInfo, `select text from ${elementId}`, async () => {
    await page.evaluate(
      ({ targetId, targetEndOffset }) => {
        const node = document.getElementById(targetId)?.firstChild;
        if (!(node instanceof Text)) {
          throw new Error(`Missing text node for ${targetId}`);
        }
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, targetEndOffset);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      },
      { targetId: elementId, targetEndOffset: endOffset }
    );
  });
}

async function sendSelectionClipAction(
  extensionPage: Page,
  tabId: number,
  testInfo: TestInfo
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const result = await runStage(testInfo, `send clipSelection (attempt ${attempt})`, async () =>
        extensionPage.evaluate(async (targetTabId) => {
          return await chrome.tabs.sendMessage(targetTabId, { action: 'clipSelection' });
        }, tabId)
      );
      expect(result).toMatchObject({ success: true });
      return;
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || !error.message.includes('Receiving end does not exist')) {
        throw error;
      }
      await extensionPage.waitForTimeout(200);
    }
  }

  throw lastError ?? new Error('clipSelection message never reached the content runtime.');
}

async function openReaderFromSelection(
  page: Page,
  extensionPage: Page,
  tabId: number,
  selection: { elementId: 'p1' | 'p2'; endOffset: number },
  testInfo: TestInfo
): Promise<void> {
  await selectTextRange(page, selection.elementId, selection.endOffset, testInfo);
  await sendSelectionClipAction(extensionPage, tabId, testInfo);

  const readerAction = page.locator(
    '[data-stitch-surface="clipper"] button[data-action-id="reader"]'
  );
  await runStage(testInfo, 'wait clipper reader action', async () => {
    await expect(readerAction).toBeVisible({ timeout: 10000 });
  });
  await runStage(testInfo, 'click clipper reader action', async () => {
    await readerAction.click();
  });

  await runStage(testInfo, 'wait real reader panel visible', async () => {
    await expect(page.locator('[data-stitch-surface="reader"]')).toHaveCount(1, {
      timeout: 10000
    });
    await expect(page.locator('[data-role="export-btn"]')).toBeVisible();
  });
}

async function readReaderDraftEntries(extensionPage: Page): Promise<ReaderDraftEntry[]> {
  return extensionPage.evaluate(
    async ({ storageKeyPrefix, indexKey }) => {
      const storage = await chrome.storage.local.get(null);
      return Object.entries(storage)
        .filter(([key]) => key.startsWith(storageKeyPrefix) && key !== indexKey)
        .map(([key, value]) => {
          const envelope =
            typeof value === 'object' && value !== null
              ? (value as {
                  pageUrl?: unknown;
                  status?: unknown;
                  payload?: {
                    highlights?: Array<{ selectedText?: unknown }>;
                    commentDrafts?: Record<string, unknown>;
                  };
                })
              : {};
          const highlights = Array.isArray(envelope.payload?.highlights)
            ? envelope.payload.highlights
            : [];
          const highlightTexts = highlights
            .map((highlight) =>
              typeof highlight === 'object' && highlight !== null ? highlight.selectedText : null
            )
            .filter((text): text is string => typeof text === 'string');
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
            status: typeof envelope.status === 'string' ? envelope.status : null,
            highlightTexts,
            commentDrafts
          };
        });
    },
    { storageKeyPrefix: SESSION_DRAFT_STORAGE_PREFIX, indexKey: SESSION_DRAFT_INDEX_KEY }
  );
}

testWithExtension.describe('Reader Panel E2E Flow', () => {
  let diagnostics: ReturnType<typeof attachBrowserDiagnostics> | null = null;

  testWithExtension.slow();
  testWithExtension.setTimeout(90000);

  testWithExtension.beforeEach(({ page }) => {
    diagnostics = attachBrowserDiagnostics(page);
  });

  testWithExtension.afterEach(async ({ page, extensionPage }, testInfo) => {
    try {
      await clearSessionDraftKeys(extensionPage, testInfo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logStage(testInfo, 'SKIP reader session draft cleanup', message);
    }
    if (diagnostics) {
      await persistBrowserDiagnostics(page, testInfo, diagnostics);
    }
    diagnostics = null;
  });

  testWithExtension(
    'opens Reader Dialog and renders highlights',
    async ({ page, background }, testInfo) => {
      await openReaderDialogFromHarness(page, background, testInfo);

      const highlightItem = page.locator('[data-role="highlight-item"]').first();
      await runStage(testInfo, 'wait highlight item visible', async () => {
        await expect(highlightItem).toBeVisible({ timeout: 8000 });
      });

      const exportBtn = page.locator('[data-role="export-btn"]');
      await runStage(testInfo, 'wait export button visible', async () => {
        await expect(exportBtn).toBeVisible();
      });
    }
  );

  testWithExtension(
    'exports highlights and closes dialog',
    async ({ page, background }, testInfo) => {
      await openReaderDialogFromHarness(page, background, testInfo);

      const exportBtn = page.locator('[data-role="export-btn"]');
      await runStage(testInfo, 'click export button', () => exportBtn.click());
      await runStage(testInfo, 'wait export status', async () => {
        await expect(page.getByText('ReaderSession exported once')).toBeVisible({ timeout: 8000 });
      });

      await waitForDialogClosed(page, testInfo);
    }
  );

  testWithExtension(
    'supports keyboard navigation and escape to close',
    async ({ page, background }, testInfo) => {
      await openReaderDialogFromHarness(page, background, testInfo);

      const exportBtn = page.locator('[data-role="export-btn"]');
      await runStage(testInfo, 'focus export button', async () => {
        await exportBtn.focus();
        await expectReaderPanelFocusedRole(page, 'export-btn');
      });

      await runStage(testInfo, 'press Tab', () => page.keyboard.press('Tab'));
      await runStage(testInfo, 'wait close button focused', async () => {
        await expectReaderPanelFocusedRole(page, 'close-btn');
      });

      await runStage(testInfo, 'press Escape', () => page.keyboard.press('Escape'));
      await waitForDialogClosed(page, testInfo);
    }
  );

  testWithExtension(
    'keeps the reader panel open with unsaved input across transient visibility changes',
    async ({ page, background }, testInfo) => {
      await openReaderDialogFromHarness(page, background, testInfo);

      const input = page.locator('[data-highlight-input]').first();
      await runStage(testInfo, 'fill unsaved harness reader note', async () => {
        await input.fill('Harness transient note');
        await expect(input).toHaveValue('Harness transient note');
      });

      await simulateTransientVisibilityRoundTrip(page, testInfo);

      await expect(page.locator('[data-role="export-btn"]')).toBeVisible();
      await expect(input).toHaveValue('Harness transient note');
    }
  );

  testWithExtension(
    'restores a stored reader draft on a real page, appends the fresh selection, and clears the draft on export',
    async ({ page, context, extensionPage }, testInfo) => {
      await seedOptions(extensionPage, testInfo);
      await installReaderExportCaptureListener(extensionPage, testInfo);

      let tabId = await openReaderFixtureWithRuntime(
        page,
        context,
        extensionPage,
        testInfo,
        REAL_READER_FIXTURE_URL
      );
      await openReaderFromSelection(
        page,
        extensionPage,
        tabId,
        { elementId: 'p1', endOffset: 10 },
        testInfo
      );

      const firstInput = page
        .locator('[data-stitch-surface="reader"] input[data-highlight-input]')
        .first();
      const unsavedDraft = 'note-one';
      await runStage(testInfo, 'fill real reader draft note', async () => {
        await firstInput.fill(unsavedDraft);
        await expect(firstInput).toHaveValue(unsavedDraft);
      });

      await expect
        .poll(
          async () => {
            const entries = await readReaderDraftEntries(extensionPage);
            return {
              count: entries.length,
              hasDraft: entries.some(
                (entry) =>
                  entry.pageUrl === REAL_READER_FIXTURE_URL &&
                  entry.highlightTexts.includes('Alpha Beta') &&
                  Object.values(entry.commentDrafts).includes(unsavedDraft)
              )
            };
          },
          {
            timeout: 10000,
            message: 'reader draft did not persist to chrome.storage.local'
          }
        )
        .toEqual({ count: 1, hasDraft: true });

      await runStage(testInfo, 'reload real reader fixture', async () => {
        await page.reload({ waitUntil: 'domcontentloaded' });
      });
      tabId = await runStage(testInfo, 'resolve reloaded real reader tab id', () =>
        findCurrentTabId(extensionPage, page.url())
      );
      await injectContentRuntime(extensionPage, tabId, testInfo);
      await openReaderFromSelection(
        page,
        extensionPage,
        tabId,
        { elementId: 'p2', endOffset: 11 },
        testInfo
      );

      await expect(
        page.locator('[data-stitch-surface="reader"] article[data-highlight-id]')
      ).toHaveCount(2);
      await expect
        .poll(
          async () => {
            const inputValues = await page
              .locator('[data-stitch-surface="reader"] input[data-highlight-input]')
              .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
            const entries = await readReaderDraftEntries(extensionPage);
            return {
              inputHasDraft: inputValues.includes(unsavedDraft),
              draftCount: entries.length,
              hasMergedDraft: entries.some(
                (entry) =>
                  entry.pageUrl === REAL_READER_FIXTURE_URL &&
                  entry.highlightTexts.includes('Alpha Beta') &&
                  entry.highlightTexts.includes('Lambda Mu N') &&
                  Object.values(entry.commentDrafts).includes(unsavedDraft)
              )
            };
          },
          {
            timeout: 10000,
            message: 'restored draft did not merge with the fresh reader selection'
          }
        )
        .toEqual({
          inputHasDraft: true,
          draftCount: 1,
          hasMergedDraft: true
        });

      const exportBtn = page.locator('[data-role="export-btn"]');
      await runStage(testInfo, 'export restored reader session', () => exportBtn.click());

      await expect
        .poll(() => readCapturedReaderClip(extensionPage), {
          timeout: 10000,
          message: 'reader export payload was not captured'
        })
        .not.toBeNull();
      await waitForDialogClosed(page, testInfo);
      await expect
        .poll(() => readReaderDraftEntries(extensionPage).then((entries) => entries.length), {
          timeout: 10000,
          message: 'reader draft storage was not cleared after export'
        })
        .toBe(0);
    }
  );

  testWithExtension(
    'keeps two reader harness tabs isolated while switching between them',
    async ({ page, background, context }, testInfo) => {
      const secondPage = await runStage(testInfo, 'open second reader harness tab', () =>
        context.newPage()
      );

      try {
        await openReaderDialogFromHarness(page, background, testInfo);
        await openReaderDialogFromHarness(secondPage, background, testInfo);

        const firstInput = page.locator('[data-highlight-input]').first();
        const secondInput = secondPage.locator('[data-highlight-input]').first();

        await runStage(testInfo, 'fill first tab reader note', async () => {
          await firstInput.fill('Reader tab A');
          await expect(firstInput).toHaveValue('Reader tab A');
        });
        await runStage(testInfo, 'fill second tab reader note', async () => {
          await secondInput.fill('Reader tab B');
          await expect(secondInput).toHaveValue('Reader tab B');
        });

        await runStage(testInfo, 'switch to second reader tab', () => secondPage.bringToFront());
        await expect(secondInput).toHaveValue('Reader tab B');

        await runStage(testInfo, 'switch back to first reader tab', () => page.bringToFront());
        await expect(firstInput).toHaveValue('Reader tab A');
      } finally {
        await runStage(testInfo, 'close second reader harness tab', () => secondPage.close());
      }
    }
  );
});
