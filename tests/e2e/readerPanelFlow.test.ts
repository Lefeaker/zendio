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

type ServiceWorker = ReturnType<BrowserContext['serviceWorkers']>[number];

const testWithExtension = test.extend<{
  context: BrowserContext;
  background: ServiceWorker;
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

async function openReaderDialogFromHarness(
  page: Page,
  background: ServiceWorker,
  testInfo: TestInfo
): Promise<void> {
  const harnessUrl = await resolveHarnessUrl(background, testInfo);

  await gotoHarnessWithRetry(page, harnessUrl, testInfo);

  await runStage(testInfo, 'wait harness ready', async () => {
    await expect(page.getByRole('button', { name: 'Start Reader Session' })).toBeVisible({
      timeout: 8000
    });
  });

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

testWithExtension.describe('Reader Panel E2E Flow', () => {
  let diagnostics: ReturnType<typeof attachBrowserDiagnostics> | null = null;

  testWithExtension.slow();
  testWithExtension.setTimeout(60000);

  testWithExtension.beforeEach(({ page }) => {
    diagnostics = attachBrowserDiagnostics(page);
  });

  testWithExtension.afterEach(async ({ page }, testInfo) => {
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
        await expect(exportBtn).toBeFocused();
      });

      await runStage(testInfo, 'press Tab', () => page.keyboard.press('Tab'));
      const closeBtn = page.locator('[data-role="close-btn"]');
      await runStage(testInfo, 'wait close button focused', async () => {
        await expect(closeBtn).toBeFocused();
      });

      await runStage(testInfo, 'press Escape', () => page.keyboard.press('Escape'));
      await waitForDialogClosed(page, testInfo);
    }
  );
});
